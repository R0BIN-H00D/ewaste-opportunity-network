'use strict';
// Environmental impact (FR-IMP-*, design.md A.6).
//
// The rules that keep the numbers honest:
//  - an impact event is written only when an activity is verified by the other side (BR-05), once per activity, however many
//    times the completing call runs (the unique index on the event makes it idempotent);
//  - measured and estimated figures are never added together (BR-06), and CO2e is always an estimate;
//  - an upheld complaint reverses the event, once;
//  - nothing here is hard-coded as a "total": every figure comes from recorded events (FR-IMP-006).
const mongoose = require('mongoose');
const EnvironmentalImpact = require('../models/EnvironmentalImpact');
const Category = require('../models/Category');
const DeviceListing = require('../models/DeviceListing');
const TechnicianProfile = require('../models/TechnicianProfile');
const Donation = require('../models/Donation');
const env = require('../config/env');
const { IMPACT_TYPES } = require('../config/constants');
const cfg = require('../config/impact');

const idOf = (v) => String(v && v._id ? v._id : v);
const oid = (v) => new mongoose.Types.ObjectId(idOf(v));
const round2 = (n) => Math.round((n || 0) * 100) / 100;

/** Sum of the numbers in an object-valued field, for use inside an aggregation (weights keyed by material). */
const sumValues = (path) => ({ $sum: { $map: { input: { $objectToArray: { $ifNull: [path, {}] } }, as: 'm', in: { $ifNull: ['$$m.v', 0] } } } });

/* ---------- factors and estimates ---------- */

/** The (placeholder) factors for a category: the category's own if it has any, otherwise the defaults in config. */
async function factorsFor(categoryId) {
  if (!categoryId) return cfg.DEFAULT_FACTORS;
  const category = await Category.findById(idOf(categoryId)).select('slug defaultMaterialFactors').lean();
  if (!category) return cfg.DEFAULT_FACTORS;
  const own = category.defaultMaterialFactors && Object.keys(category.defaultMaterialFactors).length ? category.defaultMaterialFactors : null;
  return own || cfg.PLACEHOLDER_FACTORS[category.slug] || cfg.DEFAULT_FACTORS;
}

/* ---------- recording ---------- */

/**
 * Records a verified activity. Call it from the workflow step that verifies the activity. It never throws for an
 * activity that was already recorded.
 */
async function record({ user, type, refType, refId, category, devices = 1, materials, verifiedBy }) {
  if (!IMPACT_TYPES.includes(type)) throw new Error(`Unknown impact type: ${type}`);
  const factors = await factorsFor(category);
  try {
    await EnvironmentalImpact.create({
      user, type, refType, refId, category, devices, materials, verifiedBy,
      co2eEstimate: round2((factors.co2eKg || 0) * devices),
    });
  } catch (err) {
    if (err.code !== 11000) throw err; // already recorded
  }
}

/** Takes an activity out of every total because a complaint about it was upheld (BR-05). The event stays on record, marked reversed. */
async function reverse({ refType, refId }) {
  const events = await EnvironmentalImpact.find({ refType, refId: oid(refId), reversedAt: null }).lean();
  for (const event of events) {
    await EnvironmentalImpact.updateOne({ _id: event._id, reversedAt: null }, { $set: { reversedAt: new Date() } });
  }
  return { reversedEvents: events.length };
}

const emptyByType = () => Object.fromEntries(IMPACT_TYPES.map((t) => [t, 0]));

async function totalsFor(match) {
  const rows = await EnvironmentalImpact.aggregate([
    { $match: { reversedAt: null, ...match } },
    { $group: { _id: '$type', events: { $sum: 1 }, devices: { $sum: '$devices' }, co2e: { $sum: '$co2eEstimate' }, measuredKg: { $sum: sumValues('$materials.actual') }, estimatedKg: { $sum: sumValues('$materials.estimated') } } },
  ]);
  const devices = emptyByType();
  let events = 0; let co2e = 0; let measuredKg = 0; let estimatedKg = 0;
  for (const r of rows) {
    devices[r._id] = r.devices;
    events += r.events; co2e += r.co2e || 0; measuredKg += r.measuredKg || 0; estimatedKg += r.estimatedKg || 0;
  }
  return {
    events,
    devices: { total: Object.values(devices).reduce((a, b) => a + b, 0), byType: devices },
    // Measured on a scale and estimated are kept apart (BR-06); CO2e is only ever an estimate.
    materials: { measuredKg: round2(measuredKg), estimatedKg: round2(estimatedKg) },
    co2e: { kgEstimated: round2(co2e), isEstimate: true },
  };
}

/** One person's own impact. */
async function userImpact(user) {
  const totals = await totalsFor({ user: oid(user.id) });
  return { ...totals, factorsProvisional: true, method: cfg.METHOD_NOTE };
}

/* ---------- time series ---------- */

function monthKeys(now, n) {
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) keys.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return keys;
}

/**
 * Month by month, oldest first, every month present (zeros where nothing happened) so a chart never skips a gap.
 * `userId` limits it to one person; without it, the whole platform.
 */
async function monthly({ userId, months = 12, now = new Date() } = {}) {
  const n = Math.min(Math.max(parseInt(months, 10) || 12, 1), 36);
  const keys = monthKeys(now, n);
  const from = new Date(`${keys[0]}-01T00:00:00.000Z`);
  const rows = await EnvironmentalImpact.aggregate([
    { $match: { reversedAt: null, verifiedAt: { $gte: from }, ...(userId ? { user: oid(userId) } : {}) } },
    { $group: { _id: { m: { $dateToString: { format: '%Y-%m', date: '$verifiedAt', timezone: 'UTC' } }, t: '$type' }, devices: { $sum: '$devices' }, co2e: { $sum: '$co2eEstimate' }, measuredKg: { $sum: sumValues('$materials.actual') }, estimatedKg: { $sum: sumValues('$materials.estimated') } } },
  ]);
  const byMonth = new Map(keys.map((k) => [k, { month: k, devices: 0, byType: emptyByType(), measuredKg: 0, estimatedKg: 0, co2eKgEstimated: 0 }]));
  for (const r of rows) {
    const bucket = byMonth.get(r._id.m);
    if (!bucket) continue;
    bucket.byType[r._id.t] += r.devices;
    bucket.devices += r.devices;
    bucket.measuredKg = round2(bucket.measuredKg + (r.measuredKg || 0));
    bucket.estimatedKg = round2(bucket.estimatedKg + (r.estimatedKg || 0));
    bucket.co2eKgEstimated = round2(bucket.co2eKgEstimated + (r.co2e || 0));
  }
  return { months: [...byMonth.values()], factorsProvisional: true, method: cfg.METHOD_NOTE };
}

/**
 * Year by year, oldest first, every year present. Same figures as the monthly series, so the two always add up.
 * `userId` limits it to one person; without it, the whole platform.
 */
async function yearly({ userId, years = 5, now = new Date() } = {}) {
  const n = Math.min(Math.max(parseInt(years, 10) || 5, 1), 10);
  const last = now.getUTCFullYear();
  const keys = Array.from({ length: n }, (_, i) => last - n + 1 + i);
  const rows = await EnvironmentalImpact.aggregate([
    { $match: { reversedAt: null, year: { $gte: keys[0], $lte: last }, ...(userId ? { user: oid(userId) } : {}) } },
    { $group: { _id: { y: '$year', t: '$type' }, devices: { $sum: '$devices' }, co2e: { $sum: '$co2eEstimate' }, measuredKg: { $sum: sumValues('$materials.actual') }, estimatedKg: { $sum: sumValues('$materials.estimated') } } },
  ]);
  const byYear = new Map(keys.map((k) => [k, { year: k, devices: 0, byType: emptyByType(), measuredKg: 0, estimatedKg: 0, co2eKgEstimated: 0 }]));
  for (const r of rows) {
    const bucket = byYear.get(r._id.y);
    if (!bucket) continue;
    bucket.byType[r._id.t] += r.devices;
    bucket.devices += r.devices;
    bucket.measuredKg = round2(bucket.measuredKg + (r.measuredKg || 0));
    bucket.estimatedKg = round2(bucket.estimatedKg + (r.estimatedKg || 0));
    bucket.co2eKgEstimated = round2(bucket.co2eKgEstimated + (r.co2e || 0));
  }
  return { years: [...byYear.values()], factorsProvisional: true, method: cfg.METHOD_NOTE };
}

/**
 * Which kinds of device the impact came from, most devices first. An event recorded without a category is grouped as "Other"
 * rather than dropped, so the rows add up to the total.
 */
async function byCategory({ userId } = {}) {
  const rows = await EnvironmentalImpact.aggregate([
    { $match: { reversedAt: null, ...(userId ? { user: oid(userId) } : {}) } },
    { $group: { _id: { c: '$category', t: '$type' }, devices: { $sum: '$devices' }, co2e: { $sum: '$co2eEstimate' }, measuredKg: { $sum: sumValues('$materials.actual') }, estimatedKg: { $sum: sumValues('$materials.estimated') } } },
  ]);
  const ids = [...new Set(rows.map((r) => r._id.c).filter(Boolean).map(String))];
  const names = new Map((await Category.find({ _id: { $in: ids } }).select('name slug').lean()).map((c) => [String(c._id), c]));
  const groups = new Map();
  for (const r of rows) {
    const key = r._id.c ? String(r._id.c) : 'other';
    const known = names.get(key);
    const g = groups.get(key) || { category: known ? { _id: known._id, name: known.name, slug: known.slug } : null, devices: 0, byType: emptyByType(), measuredKg: 0, estimatedKg: 0, co2eKgEstimated: 0 };
    g.byType[r._id.t] += r.devices;
    g.devices += r.devices;
    g.measuredKg = round2(g.measuredKg + (r.measuredKg || 0));
    g.estimatedKg = round2(g.estimatedKg + (r.estimatedKg || 0));
    g.co2eKgEstimated = round2(g.co2eKgEstimated + (r.co2e || 0));
    groups.set(key, g);
  }
  const categories = [...groups.values()].sort((a, b) => b.devices - a.devices || String(a.category?.name || '~').localeCompare(String(b.category?.name || '~')));
  return { categories, factorsProvisional: true, method: cfg.METHOD_NOTE };
}

/* ---------- platform-wide (public) ---------- */

let cache = null;
const CACHE_MS = env.isTest ? 0 : 60 * 1000;
const clearCache = () => { cache = null; };

/** The figures shown to the public (FR-IMP-001). Cached for a minute: it is the same for everyone and counts a lot of rows. */
async function platformImpact() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const [listed, totals, technicians, donations] = await Promise.all([
    DeviceListing.countDocuments({ deletedAt: null, status: { $in: ['listed', 'in_service', 'completed', 'withdrawn'] } }),
    totalsFor({}),
    TechnicianProfile.countDocuments({ 'verification.status': 'approved' }),
    Donation.countDocuments({ status: 'completed' }),
  ]);
  const value = {
    devicesListed: listed,
    devices: {
      repaired: totals.devices.byType.repair,
      reused: totals.devices.byType.reuse,
      donated: totals.devices.byType.donation,
      refurbished: totals.devices.byType.refurbishment,
      recycled: totals.devices.byType.recycling,
      // Kept out of the waste stream by a verified activity.
      diverted: totals.devices.total,
    },
    materials: totals.materials,
    co2e: totals.co2e,
    activeTechnicians: technicians,
    completedDonations: donations,
    verifiedActivities: totals.events,
    updatedAt: new Date().toISOString(),
    factorsProvisional: true,
    method: cfg.METHOD_NOTE,
  };
  cache = { at: Date.now(), value };
  return value;
}

module.exports = { record, reverse, userImpact, monthly, yearly, byCategory, platformImpact, clearCache, factorsFor };

'use strict';
// Environmental impact and the Green Score (FR-IMP-*, design.md A.6).
//
// The rules that keep the numbers honest:
//  - an impact event is written only when an activity is verified by the other side (BR-05), once per activity, however many
//    times the completing call runs (the unique index on the event, and on the ledger entry, make it idempotent);
//  - the score is the sum of the ledger, which keeps one line per thing that earned (or removed) points, so every point can be
//    explained (FR-IMP-004);
//  - measured and estimated figures are never added together (BR-06), and CO2e is always an estimate;
//  - an upheld complaint reverses the event and takes its points back, once;
//  - nothing here is hard-coded as a "total": every figure comes from recorded events (FR-IMP-006).
const mongoose = require('mongoose');
const EnvironmentalImpact = require('../models/EnvironmentalImpact');
const GreenScoreLedger = require('../models/GreenScoreLedger');
const UserProfile = require('../models/UserProfile');
const Category = require('../models/Category');
const DeviceListing = require('../models/DeviceListing');
const TechnicianProfile = require('../models/TechnicianProfile');
const StudentProfile = require('../models/StudentProfile');
const Donation = require('../models/Donation');
const ServiceRequest = require('../models/ServiceRequest');
const logger = require('../utils/logger');
const env = require('../config/env');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { IMPACT_TYPES } = require('../config/constants');
const cfg = require('../config/impact');
const { notify } = require('./notificationService');

const idOf = (v) => String(v && v._id ? v._id : v);
const oid = (v) => new mongoose.Types.ObjectId(idOf(v));
const round2 = (n) => Math.round((n || 0) * 100) / 100;
const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

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

/* ---------- points ---------- */

const ruleLabel = (rule) => {
  if (rule === 'reversal') return 'Removed: a complaint about this was upheld';
  if (rule.endsWith(':capped')) return `${cfg.POINT_RULES[rule.replace(':capped', '')]?.label || 'Activity'} (daily limit reached, so no points)`;
  return cfg.POINT_RULES[rule]?.label || rule;
};

/**
 * Adds one line to a person's ledger and the points to their score. Once per (person, eventRef): a second call for the same
 * thing does nothing. Past the daily limit the line is still recorded, at zero, so the same activity is never scored later.
 * Returns what was recorded, or null if it already was (or the rule is unknown).
 */
async function awardPoints(userId, eventRef, ruleKey) {
  const rule = cfg.POINT_RULES[ruleKey];
  if (!rule || !userId) return null;
  const user = idOf(userId);
  if (await GreenScoreLedger.exists({ user, eventRef })) return null;

  const earnedToday = await GreenScoreLedger.countDocuments({ user, points: { $gt: 0 }, createdAt: { $gte: startOfUtcDay() } });
  const capped = earnedToday >= cfg.DAILY_EVENT_CAP;
  const points = capped ? 0 : rule.points;
  try {
    await GreenScoreLedger.create({ user, eventRef, points, rule: capped ? `${ruleKey}:capped` : ruleKey });
  } catch (err) {
    if (err.code === 11000) return null; // someone else recorded it a moment ago
    throw err;
  }
  if (points) await UserProfile.updateOne({ user }, { $inc: { greenScore: points } }, { upsert: true });
  await refreshBadges(user);
  return { eventRef, points, rule: ruleKey, capped };
}

/**
 * Records a verified activity and scores it. Call it from the workflow step that verifies the activity. It never throws for an
 * activity that was already recorded. `provider` (for repairs) is the technician, who earns points for the work too.
 */
async function record({ user, type, refType, refId, category, devices = 1, materials, verifiedBy, provider }) {
  if (!IMPACT_TYPES.includes(type)) throw new Error(`Unknown impact type: ${type}`);
  const factors = await factorsFor(category);
  try {
    await EnvironmentalImpact.create({
      user, type, refType, refId, category, devices, materials, verifiedBy,
      co2eEstimate: round2((factors.co2eKg || 0) * devices),
    });
  } catch (err) {
    if (err.code !== 11000) throw err; // already recorded: fall through, so any points still owed are given
  }
  const eventRef = `${type}:${idOf(refId)}`;
  const awards = [await awardPoints(user, eventRef, cfg.RULE_FOR_TYPE[type])];
  if (type === 'repair' && provider) awards.push(await awardPoints(provider, `${eventRef}:provider`, 'repair_provider'));
  return awards.filter(Boolean);
}

/** Two points for reviewing a completed service, once per transaction. */
const awardReview = (userId, contextType, contextId) => awardPoints(userId, `review:${contextType}:${idOf(contextId)}`, 'review_left');

/**
 * Takes an activity's points back, once, because a complaint about it was upheld (BR-05). The event stays on record, marked
 * reversed, and drops out of every total. A score never goes below zero.
 */
async function reverse({ refType, refId }) {
  const events = await EnvironmentalImpact.find({ refType, refId: oid(refId), reversedAt: null }).lean();
  let points = 0;
  for (const event of events) {
    await EnvironmentalImpact.updateOne({ _id: event._id, reversedAt: null }, { $set: { reversedAt: new Date() } });
    const refs = [`${event.type}:${idOf(event.refId)}`, `${event.type}:${idOf(event.refId)}:provider`];
    const earned = await GreenScoreLedger.find({ eventRef: { $in: refs }, points: { $gt: 0 } }).lean();
    for (const entry of earned) {
      try {
        await GreenScoreLedger.create({ user: entry.user, eventRef: `reversal:${entry.eventRef}`, points: -entry.points, rule: 'reversal' });
      } catch (err) {
        if (err.code === 11000) continue; // already taken back
        throw err;
      }
      await UserProfile.updateOne({ user: entry.user }, [{ $set: { greenScore: { $max: [0, { $add: ['$greenScore', -entry.points] }] } } }]);
      await refreshBadges(entry.user);
      points += entry.points;
      await notify(entry.user, { type: 'impact.reversed', title: 'Green Score points were removed', body: `${entry.points} points were taken back because a complaint about this activity was upheld.`, data: { deepLink: '/dashboard/impact' } });
    }
  }
  return { reversedEvents: events.length, reversedPoints: points };
}

/* ---------- levels and badges ---------- */

function levelFor(score) {
  const index = cfg.LEVELS.reduce((best, level, i) => (score >= level.min ? i : best), 0);
  const current = cfg.LEVELS[index];
  const next = cfg.LEVELS[index + 1] || null;
  return {
    key: current.key,
    name: current.name,
    min: current.min,
    next: next ? { key: next.key, name: next.name, min: next.min } : null,
    progress: next ? round2((score - current.min) / (next.min - current.min)) : 1,
  };
}

/** What a person has done so far, from recorded events only, in the shape the badge rules read. */
async function statsFor(userId) {
  const user = idOf(userId);
  const [events, ledger] = await Promise.all([
    EnvironmentalImpact.aggregate([
      { $match: { user: oid(user), reversedAt: null } },
      { $group: { _id: '$type', events: { $sum: 1 }, measuredKg: { $sum: sumValues('$materials.actual') } } },
    ]),
    GreenScoreLedger.find({ user, rule: { $in: ['repair_provider', 'review_left', 'reversal'] } }).select('eventRef rule').lean(),
  ]);
  const byType = emptyByType();
  let measuredKg = 0;
  for (const row of events) {
    byType[row._id] = row.events;
    measuredKg += row.measuredKg || 0;
  }
  const reversed = new Set(ledger.filter((l) => l.rule === 'reversal').map((l) => l.eventRef.replace(/^reversal:/, '')));
  byType.repair += ledger.filter((l) => l.rule === 'repair_provider' && !reversed.has(l.eventRef)).length;
  const kinds = Object.values(byType).filter((n) => n > 0).length;
  return { byType, total: Object.values(byType).reduce((a, b) => a + b, 0), kinds, measuredKg, reviews: ledger.filter((l) => l.rule === 'review_left').length };
}

async function refreshBadges(userId) {
  const stats = await statsFor(userId);
  const earned = cfg.BADGES.filter((b) => b.test(stats)).map((b) => b.key);
  await UserProfile.updateOne({ user: idOf(userId) }, { $set: { badges: earned } }, { upsert: true });
  return earned;
}

/* ---------- what a person sees ---------- */

/** Score, level, badges (earned or how far to go) and the ledger, newest first. */
async function greenScore(user, query = {}) {
  const pg = parsePagination(query, { defaultLimit: 20, maxLimit: 50 });
  const [profile, stats, total, rows] = await Promise.all([
    UserProfile.findOne({ user: user.id }).select('greenScore').lean(),
    statsFor(user.id),
    GreenScoreLedger.countDocuments({ user: user.id }),
    GreenScoreLedger.find({ user: user.id }).sort({ createdAt: -1, _id: -1 }).skip(pg.skip).limit(pg.limit).lean(),
  ]);
  const score = profile?.greenScore || 0;
  return {
    data: {
      score,
      level: levelFor(score),
      badges: cfg.BADGES.map((b) => {
        const [done, needed] = b.progress(stats);
        return { key: b.key, name: b.name, description: b.description, earned: b.test(stats), progress: { done: round2(done), needed } };
      }),
      ledger: rows.map((r) => ({ _id: r._id, eventRef: r.eventRef, points: r.points, rule: r.rule, label: ruleLabel(r.rule), createdAt: r.createdAt })),
    },
    meta: buildMeta(pg, total),
  };
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

/* ---------- platform-wide (public) ---------- */

let cache = null;
const CACHE_MS = env.isTest ? 0 : 60 * 1000;
const clearCache = () => { cache = null; };

/** The figures shown to the public (FR-IMP-001). Cached for a minute: it is the same for everyone and counts a lot of rows. */
async function platformImpact() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const [listed, totals, technicians, students, donations] = await Promise.all([
    DeviceListing.countDocuments({ deletedAt: null, status: { $in: ['listed', 'in_service', 'completed', 'withdrawn'] } }),
    totalsFor({}),
    TechnicianProfile.countDocuments({ 'verification.status': 'approved' }),
    StudentProfile.countDocuments({ 'verification.status': 'approved' }),
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
    studentParticipants: students,
    completedDonations: donations,
    verifiedActivities: totals.events,
    updatedAt: new Date().toISOString(),
    factorsProvisional: true,
    method: cfg.METHOD_NOTE,
  };
  cache = { at: Date.now(), value };
  return value;
}

/** The scoring rules exactly as they run, so a person can read how a score is made (P9-03). */
function rules() {
  return {
    rules: Object.entries(cfg.POINT_RULES).map(([key, r]) => ({ key, points: r.points, label: r.label, who: r.who })),
    dailyCap: cfg.DAILY_EVENT_CAP,
    levels: cfg.LEVELS.map(({ key, name, min }) => ({ key, name, min })),
    badges: cfg.BADGES.map(({ key, name, description }) => ({ key, name, description })),
    notes: [
      'Points come only from activities the other side has confirmed as done. Listing, browsing and unverified activity earn nothing.',
      `You can earn points for at most ${cfg.DAILY_EVENT_CAP} activities a day; later ones are recorded at zero.`,
      'If a complaint about an activity is upheld, its points are taken back once.',
    ],
    method: cfg.METHOD_NOTE,
    factorsProvisional: true,
    factors: cfg.PLACEHOLDER_FACTORS,
  };
}

/**
 * Gives every recorded, un-reversed event the points it should have earned, for events written before scoring existed. Safe to
 * run again: nothing is given twice. Returns how many lines it added.
 */
async function rebuildAll() {
  let added = 0;
  const cursor = EnvironmentalImpact.find({ reversedAt: null }).sort({ verifiedAt: 1 }).cursor();
  for await (const event of cursor) {
    // Events written before the factors existed have no CO2e estimate: work it out now (still only an estimate).
    if (event.co2eEstimate === undefined || event.co2eEstimate === null) {
      const factors = await factorsFor(event.category);
      await EnvironmentalImpact.updateOne({ _id: event._id }, { $set: { co2eEstimate: round2((factors.co2eKg || 0) * (event.devices || 0)) } });
    }
    let provider;
    if (event.type === 'repair') provider = (await ServiceRequest.findById(event.refId).select('technician').lean())?.technician;
    const eventRef = `${event.type}:${idOf(event.refId)}`;
    const made = [await awardPoints(event.user, eventRef, cfg.RULE_FOR_TYPE[event.type])];
    if (provider) made.push(await awardPoints(provider, `${eventRef}:provider`, 'repair_provider'));
    added += made.filter(Boolean).length;
  }
  logger.info({ added }, 'green score rebuilt');
  return { added };
}

module.exports = { record, awardPoints, awardReview, reverse, greenScore, userImpact, monthly, platformImpact, rules, levelFor, statsFor, refreshBadges, rebuildAll, clearCache, factorsFor };

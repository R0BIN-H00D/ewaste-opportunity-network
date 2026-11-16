'use strict';
// Platform analytics for administrators (FR-ADM-010): how the platform is growing and how much is happening on it, month by month.
//
// Rules that keep the numbers honest:
//  - months are calendar months in UTC and every month in the period is present, with zeros where nothing happened, so a chart
//    never skips a gap;
//  - "completed" uses the same meaning as the overview and the monitors (FLOWS), so the three never disagree;
//  - environmental figures come only from verified impact events that have not been reversed (FR-IMP-006), and weighed and
//    estimated kilograms are kept apart and never added together (BR-06); CO2e is always labelled an estimate;
//  - administrators and deleted accounts are not counted as people.
const User = require('../models/User');
const DeviceListing = require('../models/DeviceListing');
const Category = require('../models/Category');
const EnvironmentalImpact = require('../models/EnvironmentalImpact');
const RecyclingRecord = require('../models/RecyclingRecord');
const { ROLES, ACCOUNT_STATUS: S } = require('../config/constants');
const { FLOWS } = require('./adminDashboardService');

const MONTH_FORMAT = '%Y-%m';
const DEFAULT_MONTHS = 12;
const TOP_CATEGORIES = 8;

const round2 = (n) => Math.round((n || 0) * 100) / 100;
const monthOf = (field) => ({ $dateToString: { format: MONTH_FORMAT, date: field, timezone: 'UTC' } });

/** `n` calendar months ending with the current one, oldest first, as `YYYY-MM`. */
function monthKeys(now, n) {
  const keys = [];
  for (let i = n - 1; i >= 0; i -= 1) keys.push(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  return keys;
}
const startOf = (key) => new Date(`${key}-01T00:00:00.000Z`);

const people = { role: { $ne: ROLES.ADMIN }, status: { $ne: S.DELETED } };

async function registrations(keys, from) {
  const [rows, before] = await Promise.all([
    User.aggregate([{ $match: { ...people, createdAt: { $gte: from } } }, { $group: { _id: { m: monthOf('$createdAt'), r: '$role' }, n: { $sum: 1 } } }]),
    User.countDocuments({ ...people, createdAt: { $lt: from } }),
  ]);
  const byRole = Object.fromEntries(Object.values(ROLES).filter((r) => r !== ROLES.ADMIN).map((r) => [r, 0]));
  const perMonth = Object.fromEntries(keys.map((k) => [k, { members: 0, providers: 0 }]));
  rows.forEach(({ _id, n }) => {
    byRole[_id.r] = (byRole[_id.r] || 0) + n;
    if (perMonth[_id.m]) perMonth[_id.m][_id.r === ROLES.USER ? 'members' : 'providers'] += n;
  });
  let running = before;
  const series = [];
  const growth = [];
  keys.forEach((month) => {
    const { members, providers } = perMonth[month];
    running += members + providers;
    series.push({ month, members, providers, total: members + providers });
    growth.push({ month, total: running });
  });
  return { registrations: { total: series.reduce((t, s) => t + s.total, 0), byRole, series }, growth };
}

/** Per flow and month: how many were started and how many of those are completed. */
async function flowSeries(keys, from) {
  const names = Object.keys(FLOWS);
  const grouped = await Promise.all(names.map((name) => FLOWS[name].Model.aggregate([
    { $match: { deletedAt: null, createdAt: { $gte: from } } },
    { $group: { _id: monthOf('$createdAt'), created: { $sum: 1 }, completed: { $sum: { $cond: [{ $in: ['$status', FLOWS[name].done] }, 1, 0] } } } },
  ])));
  const by = {};
  names.forEach((name, i) => { by[name] = Object.fromEntries(grouped[i].map((g) => [g._id, g])); });
  const at = (name, month, field) => by[name][month]?.[field] || 0;

  const activity = keys.map((month) => ({ month, ...Object.fromEntries(names.map((n) => [n, at(n, month, 'created')])) }));
  const services = Object.fromEntries(names.map((n) => [n, { created: keys.reduce((t, m) => t + at(n, m, 'created'), 0), completed: keys.reduce((t, m) => t + at(n, m, 'completed'), 0) }]));
  const pair = (name, a, b) => keys.map((month) => ({ month, [a]: at(name, month, 'created'), [b]: at(name, month, 'completed') }));
  return {
    activity,
    services,
    donations: { offered: services.donations.created, completed: services.donations.completed, series: pair('donations', 'offered', 'completed') },
    recyclingSeries: pair('recycling', 'requests', 'completed'),
  };
}

async function categories(from) {
  const rows = await DeviceListing.aggregate([
    { $match: { deletedAt: null, status: { $nin: ['draft', 'removed_by_admin'] }, createdAt: { $gte: from } } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
  ]);
  const names = new Map((await Category.find({ _id: { $in: rows.map((r) => r._id) } }).select('name').lean()).map((c) => [String(c._id), c.name]));
  const named = rows.map((r) => ({ name: names.get(String(r._id)) || 'Other', count: r.count }));
  const top = named.slice(0, TOP_CATEGORIES);
  const rest = named.slice(TOP_CATEGORIES).reduce((t, r) => t + r.count, 0);
  return rest ? [...top, { name: 'All other categories', count: rest }] : top;
}

const sumValues = (path) => ({ $sum: { $map: { input: { $objectToArray: { $ifNull: [path, {}] } }, as: 'm', in: { $ifNull: ['$$m.v', 0] } } } });

async function recyclingAndImpact(from) {
  const [devices, impact] = await Promise.all([
    RecyclingRecord.aggregate([{ $match: { deletedAt: null, status: 'completed', createdAt: { $gte: from } } }, { $group: { _id: null, devices: { $sum: '$deviceCount' } } }]),
    EnvironmentalImpact.aggregate([
      { $match: { reversedAt: null, verifiedAt: { $gte: from } } },
      // Weigh each event first: $sum over an array only works outside $group, and inside $group it would ignore the array.
      { $addFields: { weighedKg: sumValues('$materials.actual'), estimatedKg: sumValues('$materials.estimated') } },
      { $group: { _id: null, events: { $sum: 1 }, devices: { $sum: '$devices' }, co2e: { $sum: '$co2eEstimate' }, weighed: { $sum: '$weighedKg' }, estimated: { $sum: '$estimatedKg' } } },
    ]),
  ]);
  const i = impact[0] || {};
  return {
    devicesRecycled: devices[0]?.devices || 0,
    impact: {
      events: i.events || 0,
      devices: i.devices || 0,
      weighedKg: round2(i.weighed),
      estimatedKg: round2(i.estimated),
      co2eEstimateKg: round2(i.co2e),
    },
  };
}

/** @param query { months?: 3-24 } defaults to 12 */
async function get(query = {}, now = new Date()) {
  const months = Math.min(24, Math.max(3, Number(query.months) || DEFAULT_MONTHS));
  const keys = monthKeys(now, months);
  const from = startOf(keys[0]);

  const [reg, flows, cats, extra] = await Promise.all([registrations(keys, from), flowSeries(keys, from), categories(from), recyclingAndImpact(from)]);
  return {
    period: { months, from: keys[0], to: keys[keys.length - 1] },
    registrations: reg.registrations,
    growth: reg.growth,
    activity: flows.activity,
    services: flows.services,
    categories: cats,
    donations: flows.donations,
    recycling: { requests: flows.services.recycling.created, completed: flows.services.recycling.completed, devices: extra.devicesRecycled, series: flows.recyclingSeries },
    impact: extra.impact,
    generatedAt: now.toISOString(),
  };
}

module.exports = { get, monthKeys, DEFAULT_MONTHS };

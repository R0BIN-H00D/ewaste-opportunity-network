'use strict';
// CSV exports for administrators (FR-ADM-011): users, listings and the five monitored flows.
//
// What goes in a file is decided here, once:
//  - never an exact address, a phone number or anything private about a listing (BR-08); listings carry the public area only,
//  - recycling keeps weighed and estimated kilograms in separate columns (BR-06),
//  - text cells are made safe for spreadsheets (see utils/csv.js),
//  - the file is capped, and when it was cut short the caller is told so (never a silent partial file),
//  - every download is written to the audit log with the filters used, because a user export holds email addresses.
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const DeviceListing = require('../models/DeviceListing');
const { ACCOUNT_STATUS: S, LISTING_STATUS, ROLES } = require('../config/constants');
const monitors = require('./adminMonitorService');
const { providerStatuses } = require('./adminUserService');
const audit = require('./auditService');
const { toCsv } = require('../utils/csv');

const MAX_ROWS = 10000;
const idOf = (v) => String(v && v._id ? v._id : v);
const day = (d) => new Date(d).toISOString().slice(0, 10);
const name = (v) => (v && v.name ? v.name : 'Removed account');

// Which filters each export accepts. Anything else is refused rather than quietly ignored, so a file never claims a filter it did not apply.
const FILTERS = {
  users: ['role', 'status', 'from', 'to'],
  listings: ['status', 'category', 'from', 'to'],
};
monitors.KIND_NAMES.forEach((k) => { FILTERS[k] = ['status', 'from', 'to']; });
const KINDS = Object.keys(FILTERS);

function refuseUnusedFilters(kind, query) {
  const errors = Object.keys(query || {})
    .filter((k) => query[k] !== undefined && query[k] !== '' && !FILTERS[kind].includes(k))
    .map((field) => ({ field, message: 'This export does not use that filter' }));
  if (errors.length) throw ApiError.validation(errors);
}

const USER_COLUMNS = [
  { key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role' }, { key: 'status', label: 'Status' },
  { key: 'emailVerified', label: 'Email verified' }, { key: 'verification', label: 'Verification' },
  { key: 'createdAt', label: 'Joined' }, { key: 'lastLoginAt', label: 'Last sign-in' },
];

async function usersRows(query) {
  if (query.role && !Object.values(ROLES).includes(query.role)) throw ApiError.validation([{ field: 'role', message: 'Not a role' }]);
  if (query.status && !Object.values(S).includes(query.status)) throw ApiError.validation([{ field: 'status', message: 'Not an account status' }]);
  const range = monitors.dateRange(query);
  const filter = { status: query.status || { $ne: S.DELETED } };
  if (query.role) filter.role = query.role;
  if (range) filter.createdAt = range;
  const rows = await User.find(filter).sort({ createdAt: -1, _id: -1 }).limit(MAX_ROWS + 1).lean();
  const kept = rows.slice(0, MAX_ROWS);
  const verification = await providerStatuses(kept);
  const items = kept.map((u) => ({
    name: u.name, email: u.email, role: u.role, status: u.status, emailVerified: !!u.emailVerified,
    verification: verification.get(idOf(u._id)) || '', createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || '',
  }));
  return { columns: USER_COLUMNS, items, truncated: rows.length > MAX_ROWS };
}

const LISTING_COLUMNS = [
  { key: 'title', label: 'Title' }, { key: 'category', label: 'Category' }, { key: 'brand', label: 'Brand' }, { key: 'model', label: 'Model' },
  { key: 'condition', label: 'Condition' }, { key: 'service', label: 'Preferred service' }, { key: 'status', label: 'Status' },
  { key: 'owner', label: 'Owner' }, { key: 'area', label: 'Area' }, { key: 'city', label: 'City' },
  { key: 'price', label: 'Expected price (₹)' }, { key: 'reports', label: 'Reports' }, { key: 'createdAt', label: 'Listed on' },
];

async function listingsRows(query) {
  if (query.status && !LISTING_STATUS.includes(query.status)) throw ApiError.validation([{ field: 'status', message: 'Not a listing status' }]);
  const range = monitors.dateRange(query);
  // Drafts are private to their owner, so they are only included when asked for.
  const filter = { status: query.status || { $ne: 'draft' } };
  if (query.category) filter.category = query.category;
  if (range) filter.createdAt = range;
  const rows = await DeviceListing.find(filter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(MAX_ROWS + 1)
    .populate([{ path: 'category', select: 'name' }, { path: 'owner', select: 'name' }])
    .select('title brand model condition preferredService status owner category addressArea city expectedPrice reportCount createdAt') // no exact location
    .lean();
  const items = rows.slice(0, MAX_ROWS).map((l) => ({
    title: l.title, category: l.category?.name || '', brand: l.brand || '', model: l.model || '', condition: l.condition, service: l.preferredService,
    status: l.status, owner: name(l.owner), area: l.addressArea || '', city: l.city || '', price: l.expectedPrice ?? '', reports: l.reportCount || 0, createdAt: l.createdAt,
  }));
  return { columns: LISTING_COLUMNS, items, truncated: rows.length > MAX_ROWS };
}

/**
 * Builds one CSV. Returns { filename, csv, rows, truncated }.
 * @throws 404 for an unknown export, 422 for a filter it does not use or a value it does not accept
 */
async function build(admin, kind, query = {}, ip) {
  if (!KINDS.includes(kind)) throw ApiError.notFound('Unknown export');
  refuseUnusedFilters(kind, query);

  let result;
  if (kind === 'users') result = await usersRows(query);
  else if (kind === 'listings') result = await listingsRows(query);
  else {
    const m = await monitors.exportRows(kind, query, MAX_ROWS);
    result = { columns: m.columns, items: m.items, truncated: m.truncated };
  }

  const filters = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined && v !== ''));
  await audit.record(admin, 'export.downloaded', { targetType: 'Export', after: { kind, filters, rows: result.items.length, truncated: result.truncated }, ip });
  return { filename: `${kind}-${day(new Date())}.csv`, csv: toCsv(result.columns, result.items), rows: result.items.length, truncated: result.truncated };
}

module.exports = { build, KINDS, MAX_ROWS };

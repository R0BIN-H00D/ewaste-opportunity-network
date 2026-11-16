'use strict';
// Read-only monitors (FR-ADM-006): one flat, filterable table per flow so an administrator can see what is going on across
// the platform without opening each person's screens. Nothing here changes anything, and exact addresses are never included
// (BR-08): only names, statuses, dates and amounts. There are no links to the records, because the detail pages belong to the
// people taking part and an administrator is not one of them.
const ApiError = require('../utils/ApiError');
const ServiceRequest = require('../models/ServiceRequest');
const Donation = require('../models/Donation');
const RefurbishmentJob = require('../models/RefurbishmentJob');
const RecyclingRecord = require('../models/RecyclingRecord');
const Transaction = require('../models/Transaction');
const { SERVICE_REQUEST_STATUS, DONATION_STATUS, REFURB_JOB_STATUS, RECYCLING_STATUS } = require('../config/constants');
const { parsePagination, buildMeta } = require('../utils/pagination');

const short = (id) => String(id).slice(-6).toUpperCase();
const person = (role, u) => (u && u.name ? { role, name: u.name, id: u._id } : { role, name: 'Removed account', id: null });

const KINDS = {
  repairs: {
    Model: ServiceRequest,
    statuses: SERVICE_REQUEST_STATUS,
    populate: [{ path: 'listing', select: 'title' }, { path: 'customer', select: 'name' }, { path: 'technician', select: 'name' }],
    present: (r) => ({
      reference: `REQ-${short(r._id)}`,
      title: r.listing?.title || 'Device',
      parties: [person('Customer', r.customer), ...(r.technician ? [person('Technician', r.technician)] : [])],
    }),
  },
  donations: {
    Model: Donation,
    statuses: DONATION_STATUS,
    populate: [{ path: 'listing', select: 'title' }, { path: 'donor', select: 'name' }, { path: 'acceptedRequest', select: 'requester', populate: { path: 'requester', select: 'name' } }],
    present: (r) => ({
      reference: r.confirmation?.refNo || `DON-${short(r._id)}`,
      title: r.listing?.title || 'Device',
      parties: [person('Donor', r.donor), ...(r.acceptedRequest?.requester ? [person('Recipient', r.acceptedRequest.requester)] : [])],
    }),
  },
  refurbishment: {
    Model: RefurbishmentJob,
    statuses: REFURB_JOB_STATUS,
    populate: [{ path: 'listing', select: 'title' }, { path: 'owner', select: 'name' }, { path: 'refurbisher', select: 'name' }],
    present: (r) => ({
      reference: `JOB-${short(r._id)}`,
      title: r.listing?.title || 'Device',
      parties: [person('Owner', r.owner), person('Refurbisher', r.refurbisher)],
      amount: r.offer?.amount ?? null,
    }),
    exportColumns: [{ key: 'amount', label: 'Offer (₹)' }],
    exportExtra: (r) => ({ amount: r.offer?.amount ?? '' }),
  },
  recycling: {
    Model: RecyclingRecord,
    statuses: RECYCLING_STATUS,
    populate: [{ path: 'requester', select: 'name' }, { path: 'center', select: 'name' }],
    present: (r) => ({
      reference: r.refNo || `REC-${short(r._id)}`,
      title: `${r.deviceCount || 1} ${(r.deviceCount || 1) === 1 ? 'device' : 'devices'}`,
      parties: [person('Requester', r.requester), { role: 'Centre', name: r.center?.name || 'Removed centre', id: r.center?._id || null }],
    }),
    // Weighed and estimated amounts stay in separate columns and are never added together (BR-06).
    exportColumns: [{ key: 'devices', label: 'Devices' }, { key: 'weighedKg', label: 'Weighed (kg)' }, { key: 'estimatedKg', label: 'Estimated (kg)' }],
    exportExtra: (r) => {
      const sum = (field) => Math.round((r.materials || []).reduce((n, m) => n + (m[field] || 0), 0) * 100) / 100;
      return { devices: r.deviceCount || 1, weighedKg: sum('actualKg'), estimatedKg: sum('estimatedKg') };
    },
  },
  transactions: {
    Model: Transaction,
    statuses: ['recorded', 'confirmed', 'disputed'],
    populate: [{ path: 'payer', select: 'name' }, { path: 'payee', select: 'name' }],
    present: (r) => ({
      reference: r.reference || `TXN-${short(r._id)}`,
      title: { repair: 'Repair', order: 'Marketplace order', refurb_purchase: 'Refurbishment', donation: 'Donation', recycling: 'Recycling' }[r.type] || r.type,
      parties: [person('Payer', r.payer), person('Payee', r.payee)],
      amount: r.amount ?? 0,
      method: r.method,
    }),
    exportColumns: [{ key: 'amount', label: 'Amount (₹)' }, { key: 'method', label: 'Method' }],
    exportExtra: (r) => ({ amount: r.amount ?? 0, method: r.method || '' }),
  },
};

const KIND_NAMES = Object.keys(KINDS);

/** `from` and `to` are whole days (YYYY-MM-DD) and `to` includes that day. */
function dateRange(query) {
  const range = {};
  if (query.from) range.$gte = new Date(`${query.from}T00:00:00.000Z`);
  if (query.to) range.$lt = new Date(new Date(`${query.to}T00:00:00.000Z`).getTime() + 24 * 3600 * 1000);
  if (query.from && query.to && range.$gte >= range.$lt) throw ApiError.validation([{ field: 'to', message: 'The end date must not be before the start date' }]);
  return Object.keys(range).length ? range : null;
}

const EXPORT_COLUMNS = [
  { key: 'reference', label: 'Reference' }, { key: 'title', label: 'What' }, { key: 'status', label: 'Status' },
  { key: 'people', label: 'People' }, { key: 'createdAt', label: 'Created' }, { key: 'updatedAt', label: 'Last updated' },
];

/**
 * The same rows as `list`, with the same filters, but not paged: for the CSV export. It reads one row more than `cap` so the
 * caller can say the file was cut short instead of silently handing over a partial file.
 */
async function exportRows(kind, query = {}, cap = 10000) {
  const spec = KINDS[kind];
  if (!spec) throw ApiError.notFound('Unknown monitor');
  if (query.status && !spec.statuses.includes(query.status)) {
    throw ApiError.validation([{ field: 'status', message: 'Not a status used by this list' }]);
  }
  const range = dateRange(query);
  const base = range ? { createdAt: range } : {};
  const filter = query.status ? { ...base, status: query.status } : base;
  const rows = await spec.Model.find(filter).sort({ createdAt: -1, _id: -1 }).limit(cap + 1).populate(spec.populate).lean();
  const items = rows.slice(0, cap).map((r) => {
    const p = spec.present(r);
    return {
      reference: p.reference,
      title: p.title,
      status: r.status,
      people: p.parties.map((x) => `${x.role}: ${x.name}`).join('; '),
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      ...(spec.exportExtra ? spec.exportExtra(r) : {}),
    };
  });
  return { items, truncated: rows.length > cap, columns: [...EXPORT_COLUMNS, ...(spec.exportColumns || [])] };
}

async function list(kind, query = {}) {
  const spec = KINDS[kind];
  if (!spec) throw ApiError.notFound('Unknown monitor');
  if (query.status && !spec.statuses.includes(query.status)) {
    throw ApiError.validation([{ field: 'status', message: 'Not a status used by this list' }]);
  }
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const range = dateRange(query);
  const base = range ? { createdAt: range } : {};
  const filter = query.status ? { ...base, status: query.status } : base;

  // The counts per status ignore the status filter, so the chips above the table always show the whole picture for the period.
  const [total, rows, grouped] = await Promise.all([
    spec.Model.countDocuments(filter),
    spec.Model.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).populate(spec.populate).lean(),
    spec.Model.aggregate([{ $match: { ...base, deletedAt: null } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);

  const items = rows.map((r) => ({ _id: r._id, kind, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt, ...spec.present(r) }));
  const counts = Object.fromEntries(spec.statuses.map((s) => [s, 0]));
  grouped.forEach((g) => { counts[g._id] = g.n; });
  return { items, meta: { ...buildMeta({ page, limit }, total), byStatus: counts, statuses: spec.statuses } };
}

module.exports = { list, exportRows, dateRange, KIND_NAMES };

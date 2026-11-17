'use strict';
// Recycling requests (FR-REC-002..006). Rules live in services/workflow/recycling.js; this file loads data, applies a rule,
// writes the change atomically (only if the status is still what we read) and runs the side effects.
const crypto = require('crypto');
const mongoose = require('mongoose');
const RecyclingRecord = require('../models/RecyclingRecord');
const RecyclingCenter = require('../models/RecyclingCenter');
const DeviceListing = require('../models/DeviceListing');
const PickupSchedule = require('../models/PickupSchedule');
const { reschedule } = require('./pickupRules');
const impact = require('./impactService');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const storage = require('./integrations/storage');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { notify } = require('./notificationService');
const { assertSelectable } = require('./recyclingCenterService');
const { serializeRequest } = require('../serializers/recycling');
const workflow = require('./workflow/recycling');
const { MAX_REQUEST_PHOTOS } = require('../validators/recycling.validators');
const { MATERIAL_TYPES } = require('../config/constants');

const { ACTORS } = workflow;
const idOf = (v) => String(v && v._id ? v._id : v);
const linkTo = (id) => `/dashboard/recycling/${id}`;
const newRefNo = () => `REC-${new Date().getUTCFullYear()}-${crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;
const historyEntry = (status, by, note) => ({ status, at: new Date(), by, ...(note ? { note } : {}) });
const stale = () => ApiError.conflict('This request was just changed. Reload the page and try again.', 'STALE_STATE');

const POPULATE = [
  { path: 'center', select: 'name city user verification.status' },
  { path: 'requester', select: 'name avatar' },
  { path: 'categories', select: 'name slug icon' },
  { path: 'listing', select: 'title' },
  { path: 'pickup', select: 'date timeSlot notes status rescheduleCount' },
];

async function unlockListing(listingId, status = 'listed') {
  if (!listingId) return;
  await DeviceListing.updateOne({ _id: idOf(listingId), 'lockedBy.kind': 'recycling' }, { $set: { status }, $unset: { lockedBy: '' } });
}

/* ---------- loading ---------- */

async function loadRequest(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Recycling request not found');
  const r = await RecyclingRecord.findById(id).populate(POPULATE);
  if (!r) throw ApiError.notFound('Recycling request not found');
  return r;
}

function roleOf(r, user) {
  if (user.role === 'admin') return ACTORS.ADMIN;
  if (idOf(r.requester) === user.id) return ACTORS.REQUESTER;
  if (r.center && idOf(r.center.user) === user.id) return ACTORS.CENTER;
  return null;
}

/** Loads a request for someone who takes part in it. Strangers get 404 so ids cannot be probed. */
async function loadParticipant(id, user, { roles } = {}) {
  const request = await loadRequest(id);
  const role = roleOf(request, user);
  if (!role) throw ApiError.notFound('Recycling request not found');
  if (roles && !roles.includes(role)) throw ApiError.forbidden('You cannot do this on this request');
  // A centre may only act while it is verified (BR-01).
  if (role === ACTORS.CENTER && roles && request.center?.verification?.status !== 'approved') {
    throw ApiError.forbidden('Your account must be verified by an administrator first', 'NOT_VERIFIED');
  }
  return { request, role };
}

const viewOf = (r, user) => serializeRequest(r, { role: roleOf(r, user) });
const fetchView = async (id, user) => viewOf(await loadRequest(id), user);

/* ---------- creating ---------- */

async function createRequest(user, input, files = []) {
  if (files.length > MAX_REQUEST_PHOTOS) throw ApiError.validation([{ field: 'photos', message: `At most ${MAX_REQUEST_PHOTOS} photos` }]);
  const center = await assertSelectable(input.centerId, input.categories, user.id);
  const cats = await Category.countDocuments({ _id: { $in: input.categories } });
  if (cats !== new Set(input.categories.map(String)).size) throw ApiError.validation([{ field: 'categories', message: 'Choose valid categories' }]);
  if (input.preferredDate && input.preferredDate.getTime() <= Date.now()) {
    throw ApiError.validation([{ field: 'preferredDate', message: 'Choose a date in the future' }]);
  }

  const _id = new mongoose.Types.ObjectId();
  let listing = null;
  if (input.listingId) {
    // The device is held while the request is open so nobody else can act on it (BR-03).
    listing = await DeviceListing.findOneAndUpdate(
      { _id: input.listingId, owner: user.id, status: 'listed', 'lockedBy.refId': { $exists: false } },
      { $set: { status: 'in_service', lockedBy: { kind: 'recycling', refId: _id } } },
    );
    if (!listing) throw ApiError.conflict('That device is not available to recycle', 'LISTING_UNAVAILABLE');
  }

  let stored = [];
  try {
    stored = files.length ? await storage.saveMany(files, { folder: `recycling/${_id}` }) : [];
    const r = await RecyclingRecord.create({
      _id,
      refNo: newRefNo(),
      requester: user.id,
      center: center._id,
      listing: listing?._id,
      categories: input.categories,
      deviceCount: input.deviceCount || 1,
      photos: stored.map(storage.toPhoto),
      pickupAddressArea: input.pickupAddressArea,
      pickupAddress: input.pickupAddress,
      preferredDate: input.preferredDate,
      notes: input.notes,
      status: 'requested',
      history: [historyEntry('requested', user.id, 'Request sent')],
    });
    await notify(center.user, { type: 'recycling.requested', title: 'New recycling request', body: `${r.deviceCount} device(s) in ${r.pickupAddressArea}`, data: { id: r._id, deepLink: linkTo(r._id) } });
    return fetchView(r._id, user);
  } catch (err) {
    await Promise.all(stored.map((s) => storage.remove(s.publicId)));
    if (listing) await unlockListing(listing._id);
    throw err;
  }
}

/* ---------- reading ---------- */

async function myCenter(user) {
  const center = await RecyclingCenter.findOne({ user: user.id }).select('_id').lean();
  if (!center) throw ApiError.forbidden('You do not run a recycling centre');
  return center;
}

async function listRequests(user, query) {
  const pg = parsePagination(query, { defaultLimit: 10 });
  const as = query.as || (user.role === 'recycler' ? 'center' : 'requester');
  const filter = as === 'center' ? { center: (await myCenter(user))._id } : { requester: user.id };
  if (query.status) filter.status = query.status;
  if (query.from || query.to) {
    filter.createdAt = { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) };
  }
  const [rows, total] = await Promise.all([
    RecyclingRecord.find(filter).populate(POPULATE).sort({ updatedAt: -1 }).skip(pg.skip).limit(pg.limit),
    RecyclingRecord.countDocuments(filter),
  ]);
  const role = as === 'center' ? ACTORS.CENTER : ACTORS.REQUESTER;
  return { items: rows.map((r) => serializeRequest(r, { role, detail: false })), meta: buildMeta(pg, total) };
}

async function getRequest(id, user) {
  const { request } = await loadParticipant(id, user);
  return viewOf(request, user);
}

/* ---------- the centre decides and moves things on ---------- */

async function setStatus(id, user, { status, reason }) {
  if (status === 'cancelled') return cancelRequest(id, user, { reason });
  const { request, role } = await loadParticipant(id, user, { roles: [ACTORS.CENTER] });
  workflow.assertTransition(request.status, status, role);

  const set = { status };
  if (status === 'rejected') set.cancelReason = reason || 'The centre declined the request';
  if (status === 'received_at_center') set.receivedAt = new Date();
  if (status === 'processed' && (request.materials || []).length === 0) {
    throw ApiError.validation([{ field: 'materials', message: 'Record the recovered materials before marking the request processed' }]);
  }
  if (status === 'completed') set.completedAt = new Date();

  const updated = await RecyclingRecord.findOneAndUpdate(
    { _id: request._id, status: request.status },
    { $set: set, $push: { history: historyEntry(status, user.id, status === 'rejected' ? reason : undefined) } },
    { new: true },
  );
  if (!updated) throw stale();

  if (status === 'rejected') await unlockListing(request.listing);
  if (status === 'completed') await completeSideEffects(updated, request, user.id);

  const titles = {
    accepted: 'Your recycling request was accepted',
    rejected: 'Your recycling request was declined',
    received_at_center: 'The centre received your devices',
    processed: 'Your devices were processed',
    completed: 'Recycling completed',
  };
  await notify(idOf(request.requester), { type: `recycling.${status}`, title: titles[status], body: status === 'rejected' ? reason : request.refNo, data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user);
}

/** Totals on the centre and one verified impact event, written only now the centre has completed the request (BR-05, BR-06). */
async function completeSideEffects(done, request, centerUserId) {
  const actual = {};
  const estimated = {};
  let actualKg = 0;
  let estimatedKg = 0;
  for (const m of done.materials || []) {
    if (typeof m.actualKg === 'number') { actual[m.type] = m.actualKg; actualKg += m.actualKg; }
    if (typeof m.estimatedKg === 'number') { estimated[m.type] = m.estimatedKg; estimatedKg += m.estimatedKg; }
  }
  try {
    await Promise.all([
      unlockListing(done.listing, 'completed'),
      RecyclingCenter.updateOne({ _id: idOf(done.center) }, { $inc: { 'totals.actualKg': actualKg, 'totals.estimatedKg': estimatedKg } }),
      // No measured weight means nothing was verified, so no impact is recorded.
      actualKg > 0
        ? impact.record({
          user: idOf(done.requester), type: 'recycling', refType: 'RecyclingRecord', refId: done._id,
          category: idOf((request.categories || [])[0]), devices: done.deviceCount, materials: { actual, estimated }, verifiedBy: centerUserId,
        })
        : null,
    ]);
  } catch (err) {
    logger.error({ err: err.message, requestId: String(done._id) }, 'recycling completion side effects failed');
  }
}

/* ---------- pickup and handover ---------- */

async function schedulePickup(id, user, input) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.CENTER] });
  if (!['accepted', 'pickup_scheduled'].includes(request.status)) throw ApiError.conflict('A pickup can only be arranged for an accepted request', 'INVALID_TRANSITION');
  if (input.date.getTime() <= Date.now()) throw ApiError.validation([{ field: 'date', message: 'Choose a date and time in the future' }]);
  if (request.handover?.byUser || request.handover?.byCenter) {
    throw ApiError.conflict('The handover has already started and can no longer be rescheduled', 'HANDOVER_IN_PROGRESS');
  }

  if (request.status === 'accepted') {
    const pickup = await PickupSchedule.create({
      contextType: 'recycling', contextId: request._id, requester: idOf(request.requester), provider: request.center.user,
      date: input.date, timeSlot: input.timeSlot, notes: input.notes, addressArea: request.pickupAddressArea, exactAddressShared: true, status: 'confirmed', proposedBy: user.id,
    });
    const updated = await RecyclingRecord.findOneAndUpdate(
      { _id: request._id, status: 'accepted', pickup: { $exists: false } },
      { $set: { status: 'pickup_scheduled', pickup: pickup._id }, $push: { history: historyEntry('pickup_scheduled', user.id, 'Pickup scheduled') } },
    );
    if (!updated) {
      await PickupSchedule.deleteOne({ _id: pickup._id });
      throw stale();
    }
  } else {
    const pickup = await PickupSchedule.findById(idOf(request.pickup));
    if (!pickup) throw ApiError.notFound('Pickup not found');
    await reschedule(pickup, input, 'pickup', user.id);
  }
  await notify(idOf(request.requester), { type: 'recycling.pickup', title: 'Pickup scheduled', body: input.date.toISOString(), data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user);
}

/** The requester and the centre each confirm the devices changed hands. The requester ticks the data-protection checklist first (BR-12). */
async function confirmHandover(id, user, input) {
  const { request, role } = await loadParticipant(id, user, { roles: [ACTORS.REQUESTER, ACTORS.CENTER] });
  if (request.status !== 'pickup_scheduled') throw ApiError.conflict('There is no handover to confirm right now', 'INVALID_TRANSITION');
  const field = role === ACTORS.REQUESTER ? 'byUser' : 'byCenter';
  if (request.handover?.[field]) return viewOf(request, user); // already confirmed: nothing to do
  if (role === ACTORS.REQUESTER && !input.acknowledgeChecklist) {
    throw ApiError.validation([{ field: 'acknowledgeChecklist', message: 'Please confirm the data-protection checklist before handing over your devices' }]);
  }
  const now = new Date();
  const set = { [`handover.${field}`]: now };
  if (role === ACTORS.REQUESTER) set.checklistAcknowledgedAt = now;
  const updated = await RecyclingRecord.findOneAndUpdate(
    { _id: request._id, status: 'pickup_scheduled', [`handover.${field}`]: { $exists: false } },
    { $set: set },
    { new: true },
  );
  if (!updated) throw stale();

  if (updated.handover.byUser && updated.handover.byCenter) {
    const done = await RecyclingRecord.findOneAndUpdate(
      { _id: updated._id, status: 'pickup_scheduled' },
      { $set: { status: 'collected' }, $push: { history: historyEntry('collected', user.id, 'Both sides confirmed the handover') } },
      { new: true },
    );
    if (done) {
      await PickupSchedule.updateOne({ _id: idOf(request.pickup) }, { $set: { status: 'collected', 'handoverConfirmed.byOwner': done.handover.byUser, 'handoverConfirmed.byProvider': done.handover.byCenter, checklistAcknowledgedAt: done.checklistAcknowledgedAt } });
      await notify([idOf(request.requester), request.center.user], { type: 'recycling.collected', title: 'Devices handed over', body: request.refNo, data: { id: request._id, deepLink: linkTo(request._id) } });
    }
  } else {
    const other = role === ACTORS.REQUESTER ? request.center.user : idOf(request.requester);
    await notify(other, { type: 'recycling.handover', title: 'The other side confirmed the handover', data: { id: request._id, deepLink: linkTo(request._id) } });
  }
  return fetchView(id, user);
}

/* ---------- recovered materials (FR-REC-005) ---------- */

/** The centre records what came out of the devices. Actual and estimated weights are stored in separate fields (BR-06). */
async function recordMaterials(id, user, { materials, reportNotes }) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.CENTER] });
  if (!workflow.MATERIAL_EDITABLE.includes(request.status)) {
    throw ApiError.conflict('Materials can be recorded once the devices reach the centre and until the request is completed', 'INVALID_TRANSITION');
  }
  const now = new Date();
  const rows = materials.map((m) => ({
    type: m.type,
    ...(m.actualKg !== undefined ? { actualKg: m.actualKg, measuredBy: user.id, measuredAt: now } : {}),
    ...(m.estimatedKg !== undefined ? { estimatedKg: m.estimatedKg } : {}),
  }));
  const updated = await RecyclingRecord.findOneAndUpdate(
    { _id: request._id, status: { $in: workflow.MATERIAL_EDITABLE } },
    { $set: { materials: rows, ...(reportNotes !== undefined ? { reportNotes } : {}) } },
  );
  if (!updated) throw stale();
  return fetchView(id, user);
}

/* ---------- cancel ---------- */

async function cancelRequest(id, user, { reason } = {}) {
  const { request, role } = await loadParticipant(id, user, { roles: [ACTORS.REQUESTER, ACTORS.CENTER, ACTORS.ADMIN] });
  workflow.assertTransition(request.status, 'cancelled', role);
  if (request.handover?.byUser || request.handover?.byCenter) {
    throw ApiError.conflict('The handover has already started and the request can no longer be cancelled', 'HANDOVER_IN_PROGRESS');
  }
  const updated = await RecyclingRecord.findOneAndUpdate(
    { _id: request._id, status: request.status },
    { $set: { status: 'cancelled', cancelReason: reason }, $push: { history: historyEntry('cancelled', user.id, reason || 'Cancelled') } },
  );
  if (!updated) throw stale();
  await unlockListing(request.listing);
  if (request.pickup) await PickupSchedule.updateOne({ _id: idOf(request.pickup) }, { $set: { status: 'cancelled' } });
  const notice = { type: 'recycling.cancelled', title: 'A recycling request was cancelled', body: reason, data: { id: request._id, deepLink: linkTo(request._id) } };
  if (role === ACTORS.REQUESTER) await notify(request.center.user, notice);
  else if (role === ACTORS.CENTER) await notify(idOf(request.requester), notice);
  else await notify([idOf(request.requester), request.center.user], notice);
  return fetchView(id, user);
}

/* ---------- reports (FR-REC-006) ---------- */

const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/**
 * A centre's activity report. Request counts cover requests created in the range; weights, devices and the item list cover
 * requests completed in the range. Actual and estimated kilograms are totalled separately and never added together.
 */
async function report(user, query) {
  const center = await RecyclingCenter.findOne({ user: user.id }).select('name').lean();
  if (!center) throw ApiError.forbidden('You do not run a recycling centre');
  const range = (field) => (query.from || query.to ? { [field]: { ...(query.from ? { $gte: query.from } : {}), ...(query.to ? { $lte: query.to } : {}) } } : {});
  let categoryId = null;
  if (query.category) {
    const cat = await Category.findOne({ slug: query.category }).select('_id').lean();
    categoryId = cat ? cat._id : undefined;
  }
  const catFilter = query.category ? { categories: categoryId || null } : {};

  const [created, completed] = await Promise.all([
    RecyclingRecord.find({ center: center._id, ...catFilter, ...range('createdAt') }).select('status').lean(),
    RecyclingRecord.find({ center: center._id, status: 'completed', ...catFilter, ...range('completedAt') }).populate('categories', 'name slug').sort({ completedAt: -1 }).lean(),
  ]);

  const byStatus = {};
  for (const r of created) byStatus[r.status] = (byStatus[r.status] || 0) + 1;

  const mat = Object.fromEntries(MATERIAL_TYPES.map((t) => [t, { type: t, actualKg: 0, estimatedKg: 0 }]));
  const cat = new Map();
  let devices = 0;
  for (const r of completed) {
    devices += r.deviceCount || 0;
    for (const m of r.materials || []) {
      if (typeof m.actualKg === 'number') mat[m.type].actualKg += m.actualKg;
      if (typeof m.estimatedKg === 'number') mat[m.type].estimatedKg += m.estimatedKg;
    }
    for (const c of r.categories || []) {
      const row = cat.get(String(c._id)) || { category: { _id: c._id, name: c.name, slug: c.slug }, requests: 0, devices: 0 };
      row.requests += 1;
      row.devices += r.deviceCount || 0;
      cat.set(String(c._id), row);
    }
  }
  const round = (n) => Math.round(n * 1000) / 1000;
  const materials = Object.values(mat).map((m) => ({ type: m.type, actualKg: round(m.actualKg), estimatedKg: round(m.estimatedKg) }));
  const items = completed.map((r) => ({
    _id: r._id,
    refNo: r.refNo,
    completedAt: r.completedAt,
    deviceCount: r.deviceCount,
    categories: (r.categories || []).map((c) => c.name),
    materials: (r.materials || []).map((m) => ({ type: m.type, actualKg: m.actualKg ?? null, estimatedKg: m.estimatedKg ?? null })),
  }));
  return {
    center: center.name,
    range: { from: query.from || null, to: query.to || null },
    requests: { total: created.length, byStatus },
    completed: { count: completed.length, devices },
    materials,
    totals: { actualKg: round(materials.reduce((t, m) => t + m.actualKg, 0)), estimatedKg: round(materials.reduce((t, m) => t + m.estimatedKg, 0)) },
    byCategory: [...cat.values()],
    items,
  };
}

/** The same report as a CSV file: one row per completed request, then a totals row. Actual and estimated stay in separate columns. */
function reportCsv(rep) {
  const head = ['Reference', 'Completed', 'Devices', 'Categories', ...MATERIAL_TYPES.flatMap((t) => [`${t} actual kg`, `${t} estimated kg`])];
  const rows = rep.items.map((i) => {
    const by = Object.fromEntries(i.materials.map((m) => [m.type, m]));
    return [i.refNo, i.completedAt ? new Date(i.completedAt).toISOString().slice(0, 10) : '', i.deviceCount, i.categories.join('; '), ...MATERIAL_TYPES.flatMap((t) => [by[t]?.actualKg ?? '', by[t]?.estimatedKg ?? ''])];
  });
  const totals = ['Total', '', rep.completed.devices, '', ...rep.materials.flatMap((m) => [m.actualKg, m.estimatedKg])];
  return [head, ...rows, totals].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

module.exports = {
  createRequest, listRequests, getRequest, setStatus, schedulePickup, confirmHandover, recordMaterials, cancelRequest, report, reportCsv,
};

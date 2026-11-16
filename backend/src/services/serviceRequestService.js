'use strict';
// Repair workflow orchestration (FR-SVC-*). Rules live in services/workflow/serviceRequest.js; this file loads data,
// applies a rule, writes the change atomically (only if the status is still what we read) and runs side effects.
const { isValidObjectId } = require('mongoose');
const ServiceRequest = require('../models/ServiceRequest');
const Quotation = require('../models/Quotation');
const DeviceListing = require('../models/DeviceListing');
const TechnicianProfile = require('../models/TechnicianProfile');
const User = require('../models/User');
const PickupSchedule = require('../models/PickupSchedule');
const { reschedule } = require('./pickupRules');
const Transaction = require('../models/Transaction');
const EnvironmentalImpact = require('../models/EnvironmentalImpact');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { parsePagination, buildMeta } = require('../utils/pagination');
const storage = require('./integrations/storage');
const { notify } = require('./notificationService');
const matching = require('./matching');
const { serializeRequest } = require('../serializers/serviceRequest');
const workflow = require('./workflow/serviceRequest');

const { ACTORS } = workflow;
const MAX_PROGRESS_PHOTOS = 20;

const POPULATE = [
  {
    path: 'listing',
    select: 'title brand model condition description category device addressArea city status location publicLocation owner',
    populate: [{ path: 'device', select: 'photos' }, { path: 'category', select: 'name slug icon' }],
  },
  { path: 'customer', select: 'name avatar' },
  { path: 'technician', select: 'name avatar' },
  { path: 'activeQuotation' },
  { path: 'pickup', select: 'date timeSlot status rescheduleCount' },
];

const idOf = (v) => String(v && v._id ? v._id : v);
const linkTo = (id) => `/dashboard/requests/${id}`;

/* ---------- helpers ---------- */

/** BR-01: provider actions need admin approval. Returns the technician's profile and account. */
async function assertVerifiedTechnician(user) {
  if (user.role !== 'technician') throw ApiError.forbidden('Only technicians can do this');
  const [profile, account] = await Promise.all([
    TechnicianProfile.findOne({ user: user.id }).lean(),
    User.findById(user.id).select('status role').lean(),
  ]);
  if (profile?.verification?.status !== 'approved' || account?.status !== 'active') {
    throw ApiError.forbidden('Your account must be verified by an administrator first', 'NOT_VERIFIED');
  }
  return { profile, account };
}

/** Loads a request for someone who is part of it. Strangers get 404 so ids cannot be probed (NFR-SEC). */
async function loadParticipant(id, user, { roles } = {}) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Request not found');
  const request = await ServiceRequest.findById(id);
  if (!request) throw ApiError.notFound('Request not found');
  let role = null;
  if (user.role === 'admin') role = ACTORS.ADMIN;
  else if (String(request.customer) === user.id) role = ACTORS.CUSTOMER;
  else if (request.technician && String(request.technician) === user.id) role = ACTORS.TECHNICIAN;
  if (!role) throw ApiError.notFound('Request not found');
  if (roles && !roles.includes(role)) throw ApiError.forbidden('You are not allowed to make this change');
  if (role === ACTORS.TECHNICIAN) await assertVerifiedTechnician(user);
  return { request, role };
}

/**
 * Moves a request along one or more steps in a single atomic write. `to` may be a list (e.g. quotation submitted,
 * then waiting for the customer). Fails with 409 if someone else changed the request in the meantime.
 */
async function applyTransition(request, to, actor, { by, note, photos, set = {}, push = {} } = {}) {
  const steps = Array.isArray(to) ? to : [to];
  let shadow = { status: request.status, onSite: request.onSite };
  const entries = steps.map((step, i) => {
    workflow.assertTransition(shadow, step, i === 0 ? actor : ACTORS.SYSTEM);
    shadow = { ...shadow, status: step };
    return { status: step, at: new Date(), ...(i === 0 ? { by, note, photos } : {}) };
  });
  const updated = await ServiceRequest.findOneAndUpdate(
    { _id: request._id, status: request.status },
    { $set: { status: steps[steps.length - 1], ...set }, $push: { statusHistory: { $each: entries }, ...push } },
    { new: true },
  );
  if (!updated) throw ApiError.conflict('This request was just changed. Reload the page and try again.', 'STALE_STATE');
  return updated;
}

const unlockListing = (request) =>
  DeviceListing.updateOne({ _id: request.listing, 'lockedBy.refId': request._id, status: 'in_service' }, { $set: { status: 'listed' }, $unset: { lockedBy: '' } });

async function fetchView(id, viewer, access) {
  const r = await ServiceRequest.findById(id).populate(POPULATE).lean();
  return serializeRequest(r, access);
}

const accessFromRole = (role) => ({ role, invited: false });

async function acceptedQuotation(request) {
  const q = request.activeQuotation && (await Quotation.findById(request.activeQuotation));
  if (!q || q.status !== 'accepted') throw ApiError.conflict('The customer has not approved a quotation yet', 'QUOTATION_NOT_APPROVED'); // BR-02
  return q;
}

/* ---------- create / read ---------- */

async function createRequest(user, input) {
  if (!isValidObjectId(input.listingId)) throw ApiError.notFound('Listing not found');
  const listing = await DeviceListing.findById(input.listingId);
  if (!listing || String(listing.owner) !== user.id) throw ApiError.notFound('Listing not found');
  if (listing.preferredService !== 'repair') {
    throw ApiError.conflict('Set the service for this device to "Repair" before asking a technician', 'LISTING_NOT_FOR_REPAIR');
  }
  if (listing.status !== 'listed' || listing.lockedBy?.refId) {
    throw ApiError.conflict('This listing already has an active service or is not published', 'LISTING_UNAVAILABLE');
  }

  let technicianId;
  if (input.technicianId) {
    const [profile, tech] = await Promise.all([
      TechnicianProfile.findOne({ user: input.technicianId }).lean(),
      User.findOne({ _id: input.technicianId, role: 'technician' }).select('name status').lean(),
    ]);
    const ranked = profile && tech ? matching.rankCandidates([{ profile, user: tech }], { listing: listing.toObject() }) : [];
    if (ranked.length === 0) {
      throw ApiError.validation([{ field: 'technicianId', message: 'This technician cannot take this device (not verified, unavailable, or outside their service area)' }]);
    }
    technicianId = String(tech._id);
  }

  const request = new ServiceRequest({
    listing: listing._id,
    customer: user.id,
    technician: technicianId,
    mode: technicianId ? 'targeted' : 'open',
    invitedTechnicians: technicianId ? [technicianId] : [],
    issueDescription: input.issueDescription,
    onSite: Boolean(input.onSite),
    statusHistory: [{ status: 'request_submitted', by: user.id, at: new Date(), note: input.issueDescription }],
  });

  // BR-03: lock the listing. The conditional update makes two simultaneous requests impossible.
  const locked = await DeviceListing.findOneAndUpdate(
    { _id: listing._id, status: 'listed', 'lockedBy.refId': { $exists: false } },
    { $set: { status: 'in_service', lockedBy: { kind: 'service', refId: request._id } } },
  );
  if (!locked) throw ApiError.conflict('This listing already has an active service', 'LISTING_UNAVAILABLE');
  try {
    await request.save();
  } catch (err) {
    await unlockListing(request);
    throw err;
  }

  if (technicianId) {
    await notify(technicianId, { type: 'request.new', title: 'New repair request', body: `${listing.title} needs a repair.`, data: { id: request._id, deepLink: linkTo(request._id) } });
  }
  return fetchView(request._id, user, accessFromRole(ACTORS.CUSTOMER));
}

async function accessFor(request, user) {
  if (user.role === 'admin') return { role: ACTORS.ADMIN };
  if (idOf(request.customer) === user.id) return { role: ACTORS.CUSTOMER };
  if (request.technician && idOf(request.technician) === user.id) return { role: ACTORS.TECHNICIAN, invited: request.status === 'request_submitted' };
  // Open requests are visible on the board to technicians who could actually take the job.
  if (request.mode === 'open' && request.status === 'request_submitted' && !request.technician && user.role === 'technician') {
    try {
      const { profile, account } = await assertVerifiedTechnician(user);
      const listing = await DeviceListing.findById(idOf(request.listing)).lean();
      const ok = matching.rankCandidates([{ profile, user: { _id: user.id, status: account.status } }], { listing }).length > 0;
      if (ok) return { role: ACTORS.TECHNICIAN, invited: true };
    } catch {
      return null;
    }
  }
  return null;
}

async function getRequest(id, user) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Request not found');
  const r = await ServiceRequest.findById(id).populate(POPULATE).lean();
  if (!r) throw ApiError.notFound('Request not found');
  const access = await accessFor(r, user);
  if (!access) throw ApiError.notFound('Request not found');
  return serializeRequest(r, access);
}

async function listRequests(user, query) {
  const pg = parsePagination(query, { defaultLimit: 10 });
  const as = query.as || (user.role === 'technician' ? 'technician' : 'customer');

  if (as === 'board') {
    const { profile, account } = await assertVerifiedTechnician(user);
    const rows = await ServiceRequest.find({
      status: 'request_submitted',
      $or: [{ mode: 'open', technician: null }, { mode: 'targeted', technician: user.id }],
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .populate(POPULATE)
      .lean();
    const mine = rows.filter((r) => r.listing && matching.checkEligibility(
      { profile, user: { _id: user.id, status: account.status }, distanceKm: matching.distanceBetween(profile, r.listing) },
      { listing: r.listing },
    ).ok || (r.mode === 'targeted'));
    const page = mine.slice(pg.skip, pg.skip + pg.limit);
    return { items: page.map((r) => serializeRequest(r, { role: ACTORS.TECHNICIAN, invited: true })), meta: buildMeta(pg, mine.length) };
  }

  const filter = {};
  if (user.role === 'admin') {
    if (query.as === 'customer' || query.as === 'technician') filter[query.as] = { $exists: true };
  } else if (as === 'technician') {
    if (user.role !== 'technician') throw ApiError.forbidden('Only technicians can view jobs');
    await assertVerifiedTechnician(user);
    filter.technician = user.id;
  } else {
    filter.customer = user.id;
  }
  if (query.status) filter.status = query.status;
  if (query.active === 'true') filter.status = { $nin: workflow.FINAL };

  const [rows, total] = await Promise.all([
    ServiceRequest.find(filter).sort({ updatedAt: -1 }).skip(pg.skip).limit(pg.limit).populate(POPULATE).lean(),
    ServiceRequest.countDocuments(filter),
  ]);
  const role = user.role === 'admin' ? ACTORS.ADMIN : as === 'technician' ? ACTORS.TECHNICIAN : ACTORS.CUSTOMER;
  // a technician who was asked but has not accepted yet sees the Accept / Decline actions
  return { items: rows.map((r) => serializeRequest(r, { role, invited: role === ACTORS.TECHNICIAN && r.status === 'request_submitted' })), meta: buildMeta(pg, total) };
}

/* ---------- technician: accept / reject / diagnose ---------- */

async function acceptRequest(id, user) {
  const { profile, account } = await assertVerifiedTechnician(user);
  if (!isValidObjectId(id)) throw ApiError.notFound('Request not found');
  const request = await ServiceRequest.findById(id);
  if (!request || (request.mode === 'targeted' && String(request.technician) !== user.id)) throw ApiError.notFound('Request not found');
  workflow.assertTransition(request, 'technician_assigned', ACTORS.TECHNICIAN);

  const listing = await DeviceListing.findById(request.listing).lean();
  const eligible = listing && matching.rankCandidates([{ profile, user: { _id: user.id, status: account.status } }], { listing }).length > 0;
  if (!eligible) throw ApiError.forbidden('This job is outside your categories or service area', 'NOT_ELIGIBLE');

  const now = new Date();
  const updated = await ServiceRequest.findOneAndUpdate(
    { _id: id, status: 'request_submitted', $or: [{ mode: 'targeted', technician: user.id }, { mode: 'open', technician: null }] },
    { $set: { technician: user.id, status: 'technician_assigned' }, $push: { statusHistory: { status: 'technician_assigned', by: user.id, at: now } } },
    { new: true },
  );
  if (!updated) throw ApiError.conflict('This request was just taken by someone else or changed', 'ALREADY_ASSIGNED');

  await notify(request.customer, { type: 'request.accepted', title: 'A technician accepted your request', body: listing.title, data: { id, deepLink: linkTo(id) } });
  return fetchView(id, user, { role: ACTORS.TECHNICIAN });
}

async function rejectRequest(id, user, note) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.TECHNICIAN] });
  if (request.mode !== 'targeted') throw ApiError.conflict('Open requests cannot be rejected, simply ignore them', 'INVALID_TRANSITION');
  if (!note) throw ApiError.validation([{ field: 'note', message: 'Please give a short reason' }]);
  await applyTransition(request, 'rejected', ACTORS.TECHNICIAN, { by: user.id, note });
  await unlockListing(request);
  await notify(request.customer, { type: 'request.rejected', title: 'A technician declined your request', body: note, data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user, { role: ACTORS.TECHNICIAN });
}

async function startDiagnosis(id, user, note) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.TECHNICIAN] });
  await applyTransition(request, 'diagnosis_in_progress', ACTORS.TECHNICIAN, { by: user.id, note });
  await notify(request.customer, { type: 'request.status', title: 'Diagnosis started', body: 'The technician is inspecting your device.', data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user, { role: ACTORS.TECHNICIAN });
}

/* ---------- pickup and handover ---------- */

async function schedulePickup(id, user, input) {
  const { request, role } = await loadParticipant(id, user, { roles: [ACTORS.CUSTOMER, ACTORS.TECHNICIAN] });
  if (request.onSite) throw ApiError.conflict('This is an on-site repair, no pickup is needed', 'INVALID_TRANSITION');
  if (input.date.getTime() <= Date.now()) throw ApiError.validation([{ field: 'date', message: 'Choose a date and time in the future' }]);

  const listing = await DeviceListing.findById(request.listing).select('addressArea').lean();
  let pickup;
  if (request.status === 'technician_assigned') {
    pickup = await PickupSchedule.create({
      contextType: 'service', contextId: request._id, requester: request.customer, provider: request.technician,
      date: input.date, timeSlot: input.timeSlot, notes: input.notes, addressArea: listing?.addressArea, exactAddressShared: true, status: 'confirmed',
    });
    await applyTransition(request, 'device_collection_pending', role, { by: user.id, note: 'Pickup scheduled', set: { pickup: pickup._id } });
  } else if (request.status === 'device_collection_pending') {
    pickup = await PickupSchedule.findById(request.pickup);
    if (!pickup) throw ApiError.notFound('Pickup not found');
    await reschedule(pickup, input, 'pickup');
  } else {
    throw ApiError.conflict('A pickup cannot be scheduled at this stage', 'INVALID_TRANSITION');
  }
  const other = role === ACTORS.CUSTOMER ? request.technician : request.customer;
  await notify(other, { type: 'pickup.scheduled', title: 'Pickup scheduled', body: input.date.toISOString(), data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user, { role });
}

/** Both sides confirm the handover. The data-protection checklist must be acknowledged by the owner (NFR-SEC-14). */
async function confirmHandover(id, user, input) {
  const { request, role } = await loadParticipant(id, user, { roles: [ACTORS.CUSTOMER, ACTORS.TECHNICIAN] });
  const phase = { device_collection_pending: 'collect', device_delivery_pending: 'delivery' }[request.status];
  if (!phase) throw ApiError.conflict('There is no handover to confirm right now', 'INVALID_TRANSITION');
  const who = role === ACTORS.CUSTOMER ? 'byOwner' : 'byProvider';
  if (phase === 'collect' && role === ACTORS.CUSTOMER && !input.acknowledgeChecklist) {
    throw ApiError.validation([{ field: 'acknowledgeChecklist', message: 'Please confirm the data-protection checklist before handing over your device' }]);
  }

  const now = new Date();
  const set = { [`handover.${phase}.${who}`]: now };
  if (phase === 'collect' && role === ACTORS.CUSTOMER) set['handover.collect.checklistAcknowledgedAt'] = now;
  const updated = await ServiceRequest.findOneAndUpdate({ _id: request._id, status: request.status }, { $set: set }, { new: true });
  if (!updated) throw ApiError.conflict('This request was just changed. Reload the page and try again.', 'STALE_STATE');

  const h = updated.handover[phase];
  const both = h.byOwner && h.byProvider && (phase !== 'collect' || h.checklistAcknowledgedAt);
  if (both) {
    const to = phase === 'collect' ? 'device_collected' : 'device_delivered';
    await applyTransition(updated, to, ACTORS.SYSTEM, { by: user.id, note: 'Handover confirmed by both sides' });
    if (phase === 'collect' && updated.pickup) {
      await PickupSchedule.updateOne({ _id: updated.pickup }, { $set: { status: 'collected', 'handoverConfirmed.byOwner': h.byOwner, 'handoverConfirmed.byProvider': h.byProvider, checklistAcknowledgedAt: h.checklistAcknowledgedAt } });
    }
  }
  const other = role === ACTORS.CUSTOMER ? request.technician : request.customer;
  await notify(other, { type: 'handover.confirmed', title: both ? 'Handover complete' : 'Handover confirmed by the other side', data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user, { role });
}

/* ---------- quotation ---------- */

// Amounts as people read them in the history and notifications: ₹2,500, ₹1,25,000 (Indian grouping, paise only when present).
const rupees = (amount) => `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(amount)}`;

async function submitQuotation(id, user, input) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.TECHNICIAN] });
  workflow.assertTransition(request, 'quotation_submitted', ACTORS.TECHNICIAN); // diagnosis, or a revision during repair

  const sum = (input.breakdown || []).reduce((acc, b) => acc + b.amount, 0);
  if (input.breakdown?.length && Math.abs(sum - input.amount) > 0.01) {
    throw ApiError.validation([{ field: 'amount', message: 'The total must equal the sum of the breakdown lines' }]);
  }
  if (input.validUntil && input.validUntil.getTime() <= Date.now()) {
    throw ApiError.validation([{ field: 'validUntil', message: 'The offer must be valid until a future date' }]);
  }

  const last = await Quotation.findOne({ serviceRequest: request._id }).sort({ version: -1 }).select('version').lean();
  const quotation = new Quotation({
    serviceRequest: request._id, technician: user.id, version: (last?.version || 0) + 1,
    amount: input.amount, breakdown: input.breakdown, parts: input.parts, etaDays: input.etaDays, validUntil: input.validUntil, notes: input.notes,
  });
  try {
    await quotation.save();
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('Another quotation was just submitted, reload and try again', 'STALE_STATE');
    throw err;
  }
  try {
    await applyTransition(request, ['quotation_submitted', 'customer_approval_pending'], ACTORS.TECHNICIAN, {
      by: user.id, note: quotation.version > 1 ? `Revised quote: ${rupees(input.amount)}` : `${rupees(input.amount)} quote`, set: { activeQuotation: quotation._id },
    });
  } catch (err) {
    await Quotation.deleteOne({ _id: quotation._id });
    throw err;
  }
  await Quotation.updateMany({ serviceRequest: request._id, _id: { $ne: quotation._id }, status: { $in: ['submitted', 'accepted'] } }, { $set: { status: 'superseded' } });
  await notify(request.customer, { type: 'quotation.new', title: 'New quotation to review', body: `${rupees(input.amount)}. Nothing starts until you approve it.`, data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user, { role: ACTORS.TECHNICIAN });
}

async function listQuotations(id, user) {
  const { request } = await loadParticipant(id, user);
  return Quotation.find({ serviceRequest: request._id }).sort({ version: -1 }).lean();
}

async function decideQuotation(id, quotationId, user, { decision, reason, cancel }) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.CUSTOMER] });
  if (!isValidObjectId(quotationId)) throw ApiError.notFound('Quotation not found');
  const quotation = await Quotation.findOne({ _id: quotationId, serviceRequest: request._id });
  if (!quotation) throw ApiError.notFound('Quotation not found');
  if (!request.activeQuotation || String(request.activeQuotation) !== String(quotation._id)) {
    throw ApiError.conflict('This quotation has been replaced by a newer one', 'QUOTATION_SUPERSEDED');
  }
  if (quotation.status !== 'submitted') throw ApiError.conflict('This quotation was already decided', 'QUOTATION_DECIDED');
  if (quotation.validUntil && quotation.validUntil.getTime() < Date.now()) {
    await Quotation.updateOne({ _id: quotation._id }, { $set: { status: 'expired' } });
    throw ApiError.conflict('This quotation has expired. Ask the technician for a new one', 'QUOTATION_EXPIRED');
  }

  const decidedAt = new Date();
  if (decision === 'accept') {
    await applyTransition(request, 'repair_in_progress', ACTORS.CUSTOMER, { by: user.id, note: 'Quotation approved' }); // BR-02: work starts only now
    await Quotation.updateOne({ _id: quotation._id, status: 'submitted' }, { $set: { status: 'accepted', decidedAt } });
    await notify(request.technician, { type: 'quotation.accepted', title: 'Quotation approved, you can start the repair', data: { id: request._id, deepLink: linkTo(request._id) } });
  } else {
    await applyTransition(request, cancel ? 'cancelled' : 'diagnosis_in_progress', ACTORS.CUSTOMER, { by: user.id, note: reason });
    await Quotation.updateOne({ _id: quotation._id, status: 'submitted' }, { $set: { status: 'rejected', decidedAt } });
    if (cancel) await unlockListing(request);
    await notify(request.technician, { type: 'quotation.rejected', title: cancel ? 'The request was cancelled' : 'Quotation declined', body: reason, data: { id: request._id, deepLink: linkTo(request._id) } });
  }
  return fetchView(id, user, { role: ACTORS.CUSTOMER });
}

/* ---------- repair progress and completion ---------- */

async function addProgress(id, user, { note }, files = []) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.TECHNICIAN] });
  if (!['diagnosis_in_progress', 'repair_in_progress'].includes(request.status)) {
    throw ApiError.conflict('Progress can only be added during diagnosis or repair', 'INVALID_TRANSITION');
  }
  if (request.status === 'repair_in_progress') await acceptedQuotation(request); // BR-02
  if (!note && files.length === 0) throw ApiError.validation([{ field: 'note', message: 'Add a note or at least one photo' }]);
  if (request.progressPhotos.length + files.length > MAX_PROGRESS_PHOTOS) {
    throw ApiError.validation([{ field: 'photos', message: `At most ${MAX_PROGRESS_PHOTOS} progress photos per request` }]);
  }
  const stored = await storage.saveMany(files, { folder: `service/${request._id}` });
  const at = new Date();
  const photos = stored.map(storage.toPhoto);
  const update = {
    $push: {
      ...(note ? { repairNotes: { text: note, by: user.id, at } } : {}),
      ...(photos.length ? { progressPhotos: { $each: photos } } : {}),
      progressUpdates: { ...(note ? { text: note } : {}), photos, by: user.id, at },
    },
  };
  const updated = await ServiceRequest.findOneAndUpdate({ _id: request._id, status: request.status }, update, { new: true });
  if (!updated) {
    await Promise.all(stored.map((s) => storage.remove(s.publicId)));
    throw ApiError.conflict('This request was just changed. Reload the page and try again.', 'STALE_STATE');
  }
  await notify(request.customer, { type: 'request.progress', title: 'Repair update', body: note, data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user, { role: ACTORS.TECHNICIAN });
}

async function completeRepair(id, user, { note }, files = []) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.TECHNICIAN] });
  workflow.assertTransition(request, 'repair_completed', ACTORS.TECHNICIAN);
  await acceptedQuotation(request); // BR-02
  if (files.length === 0 && request.completionPhotos.length === 0) {
    throw ApiError.validation([{ field: 'photos', message: 'Add at least one photo of the repaired device' }]);
  }
  const stored = await storage.saveMany(files, { folder: `service/${request._id}` });
  try {
    await applyTransition(request, 'repair_completed', ACTORS.TECHNICIAN, {
      by: user.id, note, photos: stored.map(storage.toPhoto), push: stored.length ? { completionPhotos: { $each: stored.map(storage.toPhoto) } } : {},
    });
  } catch (err) {
    await Promise.all(stored.map((s) => storage.remove(s.publicId)));
    throw err;
  }
  await notify(request.customer, { type: 'request.status', title: 'Repair completed', body: 'Your device has been repaired.', data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user, { role: ACTORS.TECHNICIAN });
}

async function startDelivery(id, user, { note, returnDate, returnSlot } = {}) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.TECHNICIAN] });
  if (returnDate && returnDate.getTime() <= Date.now()) {
    throw ApiError.validation([{ field: 'returnDate', message: 'The return time must be in the future' }]);
  }
  const set = returnDate ? { returnSchedule: { date: returnDate, ...(returnSlot ? { timeSlot: returnSlot } : {}) } } : {};
  await applyTransition(request, 'device_delivery_pending', ACTORS.TECHNICIAN, { by: user.id, note, set });
  await notify(request.customer, { type: 'request.status', title: 'Your device is ready for delivery', data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user, { role: ACTORS.TECHNICIAN });
}

/* ---------- finish or cancel ---------- */

/** Customer confirms the work is done. Records the offline payment and the verified impact event (BR-05, BR-10). */
async function confirmCompletion(id, user) {
  const { request } = await loadParticipant(id, user, { roles: [ACTORS.CUSTOMER] });
  workflow.assertTransition(request, 'service_completed', ACTORS.CUSTOMER);
  const quotation = await acceptedQuotation(request);
  const done = await applyTransition(request, 'service_completed', ACTORS.CUSTOMER, { by: user.id, set: { customerConfirmedAt: new Date() } });

  try {
    const listing = await DeviceListing.findById(done.listing).select('category').lean();
    await Promise.all([
      Transaction.findOneAndUpdate(
        { refType: 'ServiceRequest', refId: done._id },
        { $setOnInsert: { type: 'repair', refType: 'ServiceRequest', refId: done._id, payer: done.customer, payee: done.technician, amount: quotation.amount, method: 'offline', status: 'recorded' } },
        { upsert: true },
      ),
      TechnicianProfile.updateOne({ user: done.technician }, { $inc: { completedJobs: 1, earningsTotal: quotation.amount } }),
      DeviceListing.updateOne({ _id: done.listing }, { $set: { status: 'completed' } }),
      EnvironmentalImpact.create({ user: done.customer, type: 'repair', refType: 'ServiceRequest', refId: done._id, category: listing?.category, devices: 1, verifiedBy: user.id })
        .catch((err) => { if (err.code !== 11000) throw err; }), // already recorded: idempotent
    ]);
  } catch (err) {
    logger.error({ err: err.message, requestId: String(done._id) }, 'service completion side effects failed');
  }
  await notify(done.technician, { type: 'request.completed', title: 'Service completed', body: 'The customer confirmed the work.', data: { id: done._id, deepLink: linkTo(done._id) } });
  return fetchView(id, user, { role: ACTORS.CUSTOMER });
}

async function cancelRequest(id, user, reason) {
  const { request, role } = await loadParticipant(id, user, { roles: [ACTORS.CUSTOMER, ACTORS.ADMIN] });
  await applyTransition(request, 'cancelled', role, { by: user.id, note: reason });
  await Quotation.updateMany({ serviceRequest: request._id, status: 'submitted' }, { $set: { status: 'rejected', decidedAt: new Date() } });
  await unlockListing(request);
  // Cancelled while the technician holds the device (allowed up to quote approval): ask them to give it back.
  const holdsDevice = !request.onSite && request.handover?.collect?.byOwner && request.handover?.collect?.byProvider;
  const body = [reason, holdsDevice ? 'You still have the device. Please arrange to return it to the owner.' : null].filter(Boolean).join(' ') || undefined;
  if (request.technician) await notify(request.technician, { type: 'request.cancelled', title: 'A request was cancelled', body, data: { id: request._id, deepLink: linkTo(request._id) } });
  return fetchView(id, user, { role });
}

/** PUT /:id/status: the simple moves, mapped onto the dedicated operations above. */
async function changeStatus(id, user, { status, note, returnDate, returnSlot }, files = []) {
  switch (status) {
    case 'technician_assigned': return acceptRequest(id, user);
    case 'rejected': return rejectRequest(id, user, note);
    case 'diagnosis_in_progress': return startDiagnosis(id, user, note);
    case 'repair_completed': return completeRepair(id, user, { note }, files);
    case 'device_delivery_pending': return startDelivery(id, user, { note, returnDate, returnSlot });
    case 'cancelled': return cancelRequest(id, user, note);
    default: throw ApiError.conflict(`Use the dedicated endpoint to reach "${workflow.label(status)}"`, 'INVALID_TRANSITION');
  }
}

module.exports = {
  createRequest, getRequest, listRequests, acceptRequest, rejectRequest, startDiagnosis, schedulePickup, confirmHandover,
  submitQuotation, listQuotations, decideQuotation, addProgress, completeRepair, startDelivery, confirmCompletion, cancelRequest, changeStatus,
};

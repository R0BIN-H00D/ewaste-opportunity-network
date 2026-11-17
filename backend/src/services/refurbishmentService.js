'use strict';
// Refurbishment jobs (FR-MKT-001..003). Rules live in services/workflow/refurbishment.js; this file loads data,
// applies a rule, writes the change atomically (only if the status is still what we read) and runs side effects.
const { isValidObjectId } = require('mongoose');
const RefurbishmentJob = require('../models/RefurbishmentJob');
const RefurbisherProfile = require('../models/RefurbisherProfile');
const DeviceListing = require('../models/DeviceListing');
const Category = require('../models/Category');
const PickupSchedule = require('../models/PickupSchedule');
const { reschedule } = require('./pickupRules');
const Transaction = require('../models/Transaction');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const storage = require('./integrations/storage');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { notify } = require('./notificationService');
const { serializeJob, serializeOpportunity } = require('../serializers/refurbishment');
const workflow = require('./workflow/refurbishment');

const { ACTORS } = workflow;
const MAX_STAGE_PHOTOS = 8;
const idOf = (v) => String(v && v._id ? v._id : v);
const linkTo = (id) => `/dashboard/refurbishment/${id}`;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const POPULATE = [
  {
    path: 'listing',
    select: 'title brand model condition description category device addressArea city location publicLocation owner preferredService status lockedBy',
    populate: [{ path: 'device', select: 'photos' }, { path: 'category', select: 'name slug icon' }],
  },
  { path: 'owner', select: 'name avatar' },
  { path: 'refurbisher', select: 'name avatar' },
  { path: 'pickup', select: 'date timeSlot notes status rescheduleCount' },
];

const historyEntry = (status, by, note) => ({ status, at: new Date(), by, ...(note ? { note } : {}) });
const stale = () => ApiError.conflict('This job was just changed. Reload the page and try again.', 'STALE_STATE');

async function unlockListing(listingId, status = 'listed') {
  await DeviceListing.updateOne({ _id: listingId }, { $set: { status }, $unset: { lockedBy: '' } });
}

/* ---------- loading ---------- */

async function loadJob(id) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Job not found');
  const job = await RefurbishmentJob.findById(id).populate(POPULATE);
  if (!job) throw ApiError.notFound('Job not found');
  return job;
}

function roleOf(job, user) {
  if (user.role === 'admin') return ACTORS.ADMIN;
  if (idOf(job.owner) === user.id) return ACTORS.OWNER;
  if (idOf(job.refurbisher) === user.id) return ACTORS.REFURBISHER;
  return null;
}

/** Loads a job for someone who takes part in it. Strangers get 404 so ids cannot be probed. */
async function loadParticipant(id, user, { roles } = {}) {
  const job = await loadJob(id);
  const role = roleOf(job, user);
  if (!role) throw ApiError.notFound('Job not found');
  if (roles && !roles.includes(role)) throw ApiError.forbidden('You cannot do this on this job');
  return { job, role };
}

async function viewOf(job, user) {
  const role = roleOf(job, user);
  const profile = await RefurbisherProfile.findOne({ user: idOf(job.refurbisher) }).select('businessName city').lean();
  return serializeJob(job, { role, profile });
}
const fetchView = async (id, user) => viewOf(await loadJob(id), user);

/* ---------- opportunities and offers ---------- */

/** Reusable devices owners have listed for refurbishment. Only the fuzzed location is shown (BR-08). */
async function listOpportunities(user, query) {
  const pg = parsePagination(query, { defaultLimit: 12 });
  const filter = { status: 'listed', preferredService: 'refurbishment', owner: { $ne: user.id }, 'lockedBy.refId': { $exists: false } };
  if (query.condition) filter.condition = query.condition;
  if (query.city) filter.city = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.q) filter.$or = ['title', 'brand', 'model'].map((f) => ({ [f]: new RegExp(escapeRegex(query.q), 'i') }));
  if (query.category) {
    const cat = await Category.findOne({ slug: query.category }).select('_id').lean();
    filter.category = cat ? cat._id : null;
  }
  const [rows, total] = await Promise.all([
    DeviceListing.find(filter)
      .select('title brand model condition description category device addressArea city publicLocation preferredService createdAt')
      .populate([{ path: 'device', select: 'photos' }, { path: 'category', select: 'name slug icon' }])
      .sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(),
    DeviceListing.countDocuments(filter),
  ]);
  const mine = await RefurbishmentJob.find({ refurbisher: user.id, listing: { $in: rows.map((r) => r._id) }, status: { $ne: 'cancelled' } }).select('listing').lean();
  const offered = new Set(mine.map((m) => String(m.listing)));
  return { items: rows.map((r) => serializeOpportunity(r, { hasOffered: offered.has(String(r._id)) })), meta: buildMeta(pg, total) };
}

async function makeOffer(user, input) {
  const listing = await DeviceListing.findById(input.listingId).select('owner status preferredService lockedBy title').lean();
  if (!listing) throw ApiError.notFound('Listing not found');
  if (String(listing.owner) === user.id) throw ApiError.conflict('You cannot make an offer on your own device', 'OWN_LISTING');
  if (listing.preferredService !== 'refurbishment') throw ApiError.conflict('The owner did not choose refurbishment for this device', 'LISTING_NOT_FOR_REFURBISHMENT');
  if (listing.status !== 'listed' || listing.lockedBy?.refId) throw ApiError.conflict('This device is no longer available', 'LISTING_UNAVAILABLE');
  const existing = await RefurbishmentJob.exists({ listing: listing._id, refurbisher: user.id, status: { $ne: 'cancelled' } });
  if (existing) throw ApiError.conflict('You already made an offer on this device', 'ALREADY_OFFERED');

  const job = await RefurbishmentJob.create({
    listing: listing._id,
    owner: listing.owner,
    refurbisher: user.id,
    offer: { amount: input.amount ?? 0, message: input.message, status: 'pending' },
    status: 'offered',
    history: [historyEntry('offered', user.id, 'Offer made')],
  });
  await notify(listing.owner, { type: 'refurbishment.offer', title: 'A refurbisher made an offer', body: listing.title, data: { id: job._id, deepLink: linkTo(job._id) } });
  return fetchView(job._id, user);
}

async function listJobs(user, query) {
  const pg = parsePagination(query, { defaultLimit: 10 });
  const as = query.as || (user.role === 'refurbisher' ? 'refurbisher' : 'owner');
  const filter = { [as]: user.id, ...(query.status ? { status: query.status } : {}) };
  const [rows, total] = await Promise.all([
    RefurbishmentJob.find(filter).populate(POPULATE).sort({ updatedAt: -1 }).skip(pg.skip).limit(pg.limit),
    RefurbishmentJob.countDocuments(filter),
  ]);
  const role = as === 'owner' ? ACTORS.OWNER : ACTORS.REFURBISHER;
  return { items: rows.map((j) => serializeJob(j, { role, detail: false })), meta: buildMeta(pg, total) };
}

async function getJob(id, user) {
  const { job } = await loadParticipant(id, user);
  return viewOf(job, user);
}

/* ---------- the offer ---------- */

async function decideOffer(id, user, { decision }) {
  const { job } = await loadParticipant(id, user, { roles: [ACTORS.OWNER] });
  if (decision === 'reject') {
    workflow.assertTransition(job.status, 'cancelled', ACTORS.OWNER);
    const updated = await RefurbishmentJob.findOneAndUpdate(
      { _id: job._id, status: 'offered' },
      { $set: { status: 'cancelled', 'offer.status': 'rejected', cancelReason: 'The owner declined the offer' }, $push: { history: historyEntry('cancelled', user.id, 'Offer declined') } },
    );
    if (!updated) throw stale();
    await notify(job.refurbisher, { type: 'refurbishment.rejected', title: 'Your offer was declined', body: job.listing?.title, data: { id: job._id, deepLink: linkTo(job._id) } });
    return fetchView(id, user);
  }

  workflow.assertTransition(job.status, 'accepted', ACTORS.OWNER);
  // Lock the device so nobody else can be chosen or change it (BR-03).
  const locked = await DeviceListing.findOneAndUpdate(
    { _id: idOf(job.listing), status: 'listed', 'lockedBy.refId': { $exists: false } },
    { $set: { status: 'in_service', lockedBy: { kind: 'refurbishment', refId: job._id } } },
  );
  if (!locked) throw ApiError.conflict('This device is no longer available', 'LISTING_UNAVAILABLE');
  const updated = await RefurbishmentJob.findOneAndUpdate(
    { _id: job._id, status: 'offered' },
    { $set: { status: 'accepted', 'offer.status': 'accepted' }, $push: { history: historyEntry('accepted', user.id, 'Offer accepted') } },
  );
  if (!updated) {
    await unlockListing(idOf(job.listing));
    throw stale();
  }
  const others = await RefurbishmentJob.find({ listing: idOf(job.listing), _id: { $ne: job._id }, status: 'offered' }).select('refurbisher').lean();
  if (others.length) {
    await RefurbishmentJob.updateMany(
      { _id: { $in: others.map((o) => o._id) }, status: 'offered' },
      { $set: { status: 'cancelled', 'offer.status': 'rejected', cancelReason: 'The owner chose another refurbisher' }, $push: { history: historyEntry('cancelled', user.id, 'Another offer was chosen') } },
    );
    await notify(others.map((o) => o.refurbisher), { type: 'refurbishment.rejected', title: 'The owner chose another refurbisher', body: job.listing?.title, data: { deepLink: '/dashboard/refurbishment' } });
  }
  await notify(job.refurbisher, { type: 'refurbishment.accepted', title: 'Your offer was accepted', body: job.listing?.title, data: { id: job._id, deepLink: linkTo(job._id) } });
  return fetchView(id, user);
}

async function withdrawOffer(id, user) {
  const { job } = await loadParticipant(id, user, { roles: [ACTORS.REFURBISHER] });
  workflow.assertTransition(job.status, 'cancelled', ACTORS.REFURBISHER);
  const updated = await RefurbishmentJob.findOneAndUpdate(
    { _id: job._id, status: 'offered' },
    { $set: { status: 'cancelled', 'offer.status': 'withdrawn', cancelReason: 'The refurbisher withdrew the offer' }, $push: { history: historyEntry('cancelled', user.id, 'Offer withdrawn') } },
  );
  if (!updated) throw stale();
  return fetchView(id, user);
}

/* ---------- handover ---------- */

async function scheduleHandover(id, user, input) {
  const { job, role } = await loadParticipant(id, user, { roles: [ACTORS.OWNER, ACTORS.REFURBISHER] });
  if (job.status !== 'accepted') throw ApiError.conflict('A handover can only be arranged once an offer is accepted', 'INVALID_TRANSITION');
  if (input.date.getTime() <= Date.now()) throw ApiError.validation([{ field: 'date', message: 'Choose a date and time in the future' }]);
  if (job.confirmations?.ownerAt || job.confirmations?.refurbisherAt) {
    throw ApiError.conflict('The handover has already started and can no longer be rescheduled', 'HANDOVER_IN_PROGRESS');
  }

  if (!job.pickup) {
    const pickup = await PickupSchedule.create({
      contextType: 'offer', contextId: job._id, requester: idOf(job.owner), provider: idOf(job.refurbisher),
      date: input.date, timeSlot: input.timeSlot, notes: input.notes, addressArea: job.listing?.addressArea, exactAddressShared: true, status: 'confirmed', proposedBy: user.id,
    });
    const updated = await RefurbishmentJob.findOneAndUpdate({ _id: job._id, status: 'accepted', pickup: { $exists: false } }, { $set: { pickup: pickup._id } });
    if (!updated) {
      await PickupSchedule.deleteOne({ _id: pickup._id });
      throw stale();
    }
  } else {
    const pickup = await PickupSchedule.findById(job.pickup._id || job.pickup);
    if (!pickup) throw ApiError.notFound('Handover not found');
    await reschedule(pickup, input, 'handover', user.id);
  }
  const other = role === ACTORS.OWNER ? job.refurbisher : job.owner;
  await notify(other, { type: 'refurbishment.handover', title: 'Collection scheduled', body: input.date.toISOString(), data: { id: job._id, deepLink: linkTo(job._id) } });
  return fetchView(id, user);
}

/** Both sides confirm the device changed hands. The owner must tick the data-protection checklist first (BR-12). */
async function confirmHandover(id, user, input) {
  const { job, role } = await loadParticipant(id, user, { roles: [ACTORS.OWNER, ACTORS.REFURBISHER] });
  if (job.status !== 'accepted') throw ApiError.conflict('There is no handover to confirm right now', 'INVALID_TRANSITION');
  if (!job.pickup) throw ApiError.conflict('Arrange the collection time first', 'NO_HANDOVER');
  const field = role === ACTORS.OWNER ? 'ownerAt' : 'refurbisherAt';
  if (job.confirmations?.[field]) return viewOf(job, user); // already confirmed
  if (role === ACTORS.OWNER && !input.acknowledgeChecklist) {
    throw ApiError.validation([{ field: 'acknowledgeChecklist', message: 'Please confirm the data-protection checklist before handing over your device' }]);
  }
  const now = new Date();
  const set = { [`confirmations.${field}`]: now };
  if (role === ACTORS.OWNER) set['confirmations.checklistAcknowledgedAt'] = now;
  const updated = await RefurbishmentJob.findOneAndUpdate(
    { _id: job._id, status: 'accepted', [`confirmations.${field}`]: { $exists: false } },
    { $set: set },
    { new: true },
  );
  if (!updated) throw stale();

  if (updated.confirmations.ownerAt && updated.confirmations.refurbisherAt) {
    await markCollected(updated, job, user.id);
  } else {
    const other = role === ACTORS.OWNER ? job.refurbisher : job.owner;
    await notify(other, { type: 'refurbishment.handover', title: 'The other side confirmed the handover', data: { id: job._id, deepLink: linkTo(job._id) } });
  }
  return fetchView(id, user);
}

async function markCollected(updated, job, byUserId) {
  const done = await RefurbishmentJob.findOneAndUpdate(
    { _id: updated._id, status: 'accepted' },
    { $set: { status: 'collected' }, $push: { history: historyEntry('collected', byUserId, 'Both sides confirmed the handover') } },
    { new: true },
  );
  if (!done) return;
  try {
    await Promise.all([
      PickupSchedule.updateOne({ _id: idOf(job.pickup) }, { $set: { status: 'collected', 'handoverConfirmed.byOwner': done.confirmations.ownerAt, 'handoverConfirmed.byProvider': done.confirmations.refurbisherAt, checklistAcknowledgedAt: done.confirmations.checklistAcknowledgedAt } }),
      // The agreed price is paid offline between the two people; we only keep a record (BR-10, FR-TXN-001).
      (done.offer?.amount || 0) > 0
        ? Transaction.findOneAndUpdate(
          { refType: 'RefurbishmentJob', refId: done._id },
          { $setOnInsert: { type: 'refurb_purchase', refType: 'RefurbishmentJob', refId: done._id, payer: idOf(done.refurbisher), payee: idOf(done.owner), amount: done.offer.amount, method: 'offline', status: 'recorded' } },
          { upsert: true },
        )
        : null,
    ]);
  } catch (err) {
    logger.error({ err: err.message, jobId: String(done._id) }, 'refurbishment collection side effects failed');
  }
  await notify([idOf(job.owner), idOf(job.refurbisher)], { type: 'refurbishment.collected', title: 'Device handed over', body: job.listing?.title, data: { id: done._id, deepLink: linkTo(done._id) } });
}

/* ---------- the refurbisher's work ---------- */

async function advance(id, user, { status, note }) {
  const { job } = await loadParticipant(id, user, { roles: [ACTORS.REFURBISHER] });
  workflow.assertTransition(job.status, status, ACTORS.REFURBISHER);
  if (status === 'ready_to_list') {
    const problems = [];
    if ((job.beforePhotos || []).length === 0) problems.push({ field: 'photos', message: 'Add at least one "before" photo' });
    if ((job.afterPhotos || []).length === 0) problems.push({ field: 'photos', message: 'Add at least one "after" photo' });
    if (problems.length) throw ApiError.validation(problems);
  }
  const updated = await RefurbishmentJob.findOneAndUpdate(
    { _id: job._id, status: job.status },
    { $set: { status }, $push: { history: historyEntry(status, user.id, note), ...(note ? { workLog: { text: note, at: new Date() } } : {}) } },
  );
  if (!updated) throw stale();
  await notify(job.owner, { type: 'refurbishment.progress', title: 'Refurbishment update', body: job.listing?.title, data: { id: job._id, deepLink: linkTo(job._id) } });
  return fetchView(id, user);
}

async function addPhotos(id, user, { stage, note }, files = []) {
  const { job } = await loadParticipant(id, user, { roles: [ACTORS.REFURBISHER] });
  const allowed = stage === 'before' ? workflow.BEFORE_PHOTO_STATUSES : workflow.AFTER_PHOTO_STATUSES;
  if (!allowed.includes(job.status)) {
    throw ApiError.conflict(`"${stage}" photos cannot be added at this stage`, 'INVALID_TRANSITION');
  }
  if (files.length === 0) throw ApiError.validation([{ field: 'photos', message: 'Choose at least one photo' }]);
  const key = stage === 'before' ? 'beforePhotos' : 'afterPhotos';
  if ((job[key] || []).length + files.length > MAX_STAGE_PHOTOS) {
    throw ApiError.validation([{ field: 'photos', message: `At most ${MAX_STAGE_PHOTOS} "${stage}" photos per job` }]);
  }
  const stored = await storage.saveMany(files, { folder: `refurbishment/${job._id}` });
  const updated = await RefurbishmentJob.findOneAndUpdate(
    { _id: job._id, status: job.status },
    { $push: { [key]: { $each: stored.map(storage.toPhoto) }, ...(note ? { workLog: { text: note, at: new Date() } } : {}) } },
  );
  if (!updated) {
    await Promise.all(stored.map((s) => storage.remove(s.publicId)));
    throw stale();
  }
  return fetchView(id, user);
}

/* ---------- cancel ---------- */

async function cancelJob(id, user, { reason } = {}) {
  const { job, role } = await loadParticipant(id, user, { roles: [ACTORS.OWNER, ACTORS.REFURBISHER, ACTORS.ADMIN] });
  workflow.assertTransition(job.status, 'cancelled', role);
  if (job.confirmations?.ownerAt || job.confirmations?.refurbisherAt) {
    throw ApiError.conflict('The handover has already started and the job can no longer be cancelled', 'HANDOVER_IN_PROGRESS');
  }
  const wasAccepted = job.status === 'accepted';
  const updated = await RefurbishmentJob.findOneAndUpdate(
    { _id: job._id, status: job.status },
    { $set: { status: 'cancelled', 'offer.status': job.status === 'offered' ? 'withdrawn' : job.offer?.status, cancelReason: reason }, $push: { history: historyEntry('cancelled', user.id, reason || 'Cancelled') } },
  );
  if (!updated) throw stale();
  if (wasAccepted) {
    await unlockListing(idOf(job.listing));
    if (job.pickup) await PickupSchedule.updateOne({ _id: idOf(job.pickup) }, { $set: { status: 'cancelled' } });
  }
  const other = role === ACTORS.REFURBISHER ? job.owner : job.refurbisher;
  await notify(role === ACTORS.ADMIN ? [idOf(job.owner), idOf(job.refurbisher)] : other, { type: 'refurbishment.cancelled', title: 'A refurbishment job was cancelled', body: reason, data: { id: job._id, deepLink: linkTo(job._id) } });
  return fetchView(id, user);
}

module.exports = {
  listOpportunities, makeOffer, listJobs, getJob, decideOffer, withdrawOffer,
  scheduleHandover, confirmHandover, advance, addPhotos, cancelJob,
};

'use strict';
// Donations (FR-DON-*). Rules live in services/workflow/donation.js; this file loads data, applies a rule, writes the
// change atomically (only if the status is still what we read) and runs the side effects.
const { isValidObjectId } = require('mongoose');
const crypto = require('crypto');
const Donation = require('../models/Donation');
const DonationRequest = require('../models/DonationRequest');
const DeviceListing = require('../models/DeviceListing');
const Category = require('../models/Category');
const UserProfile = require('../models/UserProfile');
const PickupSchedule = require('../models/PickupSchedule');
const { reschedule } = require('./pickupRules');
const Transaction = require('../models/Transaction');
const impact = require('./impactService');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { notify } = require('./notificationService');
const { serializeDonation } = require('../serializers/donation');
const workflow = require('./workflow/donation');

const { ACTORS } = workflow;
const idOf = (v) => String(v && v._id ? v._id : v);
const linkTo = (id) => `/dashboard/donations/${id}`;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PUBLIC_STATUSES = ['open', 'requested'];

const POPULATE = [
  {
    path: 'listing',
    select: 'title brand model condition description category device addressArea city location publicLocation owner',
    populate: [{ path: 'device', select: 'photos' }, { path: 'category', select: 'name slug icon' }],
  },
  { path: 'donor', select: 'name avatar' },
  { path: 'acceptedRequest', select: 'requester status', populate: { path: 'requester', select: 'name avatar' } },
  { path: 'pickup', select: 'date timeSlot notes status rescheduleCount' },
];

/* ---------- recipient organisations (A-02, FR-DON-003) ---------- */

async function recipientStatus(userId) {
  const profile = await UserProfile.findOne({ user: userId }).select('orgProfile').lean();
  const org = profile?.orgProfile || {};
  return {
    isOrg: Boolean(org.isOrg),
    orgType: org.orgType,
    orgName: org.orgName,
    registrationNo: org.registrationNo,
    status: org.recipientVerification?.status || 'not_submitted',
    reason: org.recipientVerification?.reason,
    reviewedAt: org.recipientVerification?.reviewedAt,
  };
}

async function isVerifiedRecipient(user) {
  if (user.role !== 'user' || user.status !== 'active') return false;
  return (await recipientStatus(user.id)).status === 'approved';
}

/** An organisation asks to be allowed to request donations. An administrator approves it (Phase 6). */
async function applyAsRecipient(user, input) {
  if (user.role !== 'user') throw ApiError.forbidden('Only general user accounts can register as a recipient organisation');
  const current = await recipientStatus(user.id);
  if (current.status === 'approved') throw ApiError.conflict('Your organisation is already verified', 'ALREADY_VERIFIED');
  await UserProfile.findOneAndUpdate(
    { user: user.id },
    {
      $set: {
        'orgProfile.isOrg': true,
        'orgProfile.orgType': input.orgType,
        'orgProfile.orgName': input.orgName,
        'orgProfile.registrationNo': input.registrationNo,
        'orgProfile.recipientVerification': { status: 'pending' },
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return recipientStatus(user.id);
}

/* ---------- loading ---------- */

async function loadDonation(id) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Donation not found');
  const donation = await Donation.findById(id).populate(POPULATE);
  if (!donation) throw ApiError.notFound('Donation not found');
  return donation;
}

function roleOf(donation, user) {
  if (!user) return 'visitor';
  if (user.role === 'admin') return ACTORS.ADMIN;
  if (idOf(donation.donor) === user.id) return ACTORS.DONOR;
  if (donation.acceptedRequest?.requester && idOf(donation.acceptedRequest.requester) === user.id) return ACTORS.RECIPIENT;
  return 'visitor';
}

/** Loads a donation for someone who takes part in it. Strangers get 404 so ids cannot be probed. */
async function loadParticipant(id, user, { roles } = {}) {
  const donation = await loadDonation(id);
  const role = roleOf(donation, user);
  if (role === 'visitor') throw ApiError.notFound('Donation not found');
  if (roles && !roles.includes(role)) throw ApiError.forbidden('You are not allowed to make this change');
  return { donation, role };
}

async function profilesFor(ids) {
  const list = [...new Set(ids.filter(Boolean).map(idOf))];
  if (!list.length) return new Map();
  const rows = await UserProfile.find({ user: { $in: list } }).select('user orgProfile').lean();
  return new Map(rows.map((p) => [String(p.user), p]));
}

async function viewOf(donation, user) {
  let role = roleOf(donation, user);
  const [myRequest, canRequest] = await Promise.all([
    user ? DonationRequest.findOne({ donation: donation._id, requester: user.id }).lean() : null,
    user ? isVerifiedRecipient(user) : false,
  ]);
  // Anyone may open an open donation. Later stages are private to the people in them, plus anyone who asked.
  if (role === 'visitor' && !PUBLIC_STATUSES.includes(donation.status) && !myRequest) throw ApiError.notFound('Donation not found');
  if (role === 'visitor' && myRequest) role = 'requester';
  const showRequests = role === ACTORS.DONOR || role === ACTORS.ADMIN;
  const requests = showRequests ? await DonationRequest.find({ donation: donation._id }).sort({ createdAt: -1 }).populate('requester', 'name').lean() : null;
  const profiles = await profilesFor([
    ...(requests ? requests.map((r) => r.requester) : []),
    donation.acceptedRequest?.requester,
  ]);
  return serializeDonation(donation, {
    role,
    myRequest,
    requests,
    profiles,
    canRequest: canRequest && idOf(donation.donor) !== user?.id,
  });
}

const fetchView = async (id, user) => viewOf(await loadDonation(id), user);

const historyEntry = (status, by, note) => ({ status, at: new Date(), by, ...(note ? { note } : {}) });

async function unlockListing(listingId, status = 'listed') {
  await DeviceListing.updateOne({ _id: listingId }, { $set: { status }, $unset: { lockedBy: '' } });
}

/* ---------- create / browse ---------- */

async function createDonation(user, input) {
  if (!isValidObjectId(input.listingId)) throw ApiError.notFound('Listing not found');
  const listing = await DeviceListing.findById(input.listingId);
  if (!listing || String(listing.owner) !== user.id) throw ApiError.notFound('Listing not found');
  if (listing.preferredService !== 'donation') {
    throw ApiError.conflict('Set the service for this device to "Donation" before offering it', 'LISTING_NOT_FOR_DONATION');
  }
  if (listing.condition === 'for_spare_parts') {
    throw ApiError.conflict('Only working or repairable devices can be donated. Choose recycling for spare parts.', 'NOT_DONATABLE');
  }
  if (listing.status !== 'listed' || listing.lockedBy?.refId) {
    throw ApiError.conflict('This listing already has an active service or is not published', 'LISTING_UNAVAILABLE');
  }

  const donation = new Donation({
    listing: listing._id,
    donor: user.id,
    description: input.description,
    history: [historyEntry('open', user.id, 'Donation offered')],
  });
  // BR-03: lock the listing; the conditional update makes two simultaneous offers impossible.
  const locked = await DeviceListing.findOneAndUpdate(
    { _id: listing._id, status: 'listed', 'lockedBy.refId': { $exists: false } },
    { $set: { status: 'in_service', lockedBy: { kind: 'donation', refId: donation._id } } },
  );
  if (!locked) throw ApiError.conflict('This listing already has an active service', 'LISTING_UNAVAILABLE');
  try {
    await donation.save();
  } catch (err) {
    await unlockListing(listing._id);
    throw err;
  }
  return fetchView(donation._id, user);
}

/** Donation marketplace (FR-DON-002) plus "my donations" and "donations I asked for" (FR-DON-007). */
async function listDonations(user, query) {
  const pg = parsePagination(query, { defaultLimit: 12 });
  if (query.as && !user) throw ApiError.unauthorized();

  const listingFilter = {};
  if (query.condition) listingFilter.condition = query.condition;
  if (query.city) listingFilter.city = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.q) listingFilter.$text = { $search: query.q };
  if (query.category) {
    const cat = await Category.findOne({ slug: String(query.category).toLowerCase() }).select('_id').lean();
    listingFilter.category = cat ? cat._id : null;
  }

  const filter = {};
  if (query.as === 'donor') filter.donor = user.id;
  else if (query.as === 'recipient') {
    const mine = await DonationRequest.find({ requester: user.id }).select('donation').lean();
    filter._id = { $in: mine.map((r) => r.donation) };
  } else {
    filter.status = { $in: PUBLIC_STATUSES };
  }
  if (Object.keys(listingFilter).length) {
    const ids = await DeviceListing.find({ 'lockedBy.kind': 'donation', ...listingFilter }).select('_id').limit(2000).lean();
    filter.listing = { $in: ids.map((l) => l._id) };
  }

  const [rows, total] = await Promise.all([
    Donation.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate(POPULATE),
    Donation.countDocuments(filter),
  ]);

  const ids = rows.map((d) => d._id);
  const [mine, pending] = await Promise.all([
    user && ids.length ? DonationRequest.find({ donation: { $in: ids }, requester: user.id }).lean() : [],
    query.as === 'donor' && ids.length
      ? DonationRequest.aggregate([{ $match: { donation: { $in: ids }, status: 'pending' } }, { $group: { _id: '$donation', n: { $sum: 1 } } }])
      : [],
  ]);
  const myBy = new Map(mine.map((r) => [String(r.donation), r]));
  const pendingBy = new Map(pending.map((p) => [String(p._id), p.n]));

  const items = rows.map((d) => {
    const role = roleOf(d, user);
    const out = serializeDonation(d, { role: role === 'visitor' && myBy.has(String(d._id)) ? 'requester' : role, myRequest: myBy.get(String(d._id)), requests: null, detail: false });
    if (query.as === 'donor') out.pendingRequests = pendingBy.get(String(d._id)) || 0;
    return out;
  });
  return { items, meta: buildMeta(pg, total) };
}

async function getDonation(id, user) {
  const donation = await loadDonation(id);
  return viewOf(donation, user);
}

/* ---------- requests from recipients ---------- */

async function requestDonation(id, user, input) {
  const donation = await loadDonation(id);
  if (idOf(donation.donor) === user.id) throw ApiError.forbidden('You cannot request your own donation');
  if (!(await isVerifiedRecipient(user))) {
    throw ApiError.forbidden('Only verified recipient organisations can request donations', 'NOT_VERIFIED');
  }
  if (!PUBLIC_STATUSES.includes(donation.status)) throw ApiError.conflict('This donation is no longer taking requests', 'DONATION_CLOSED');

  const existing = await DonationRequest.findOne({ donation: donation._id, requester: user.id });
  if (existing && existing.status !== 'withdrawn') throw ApiError.conflict('You have already asked for this donation', 'ALREADY_REQUESTED');
  if (existing) {
    existing.set({ status: 'pending', justification: input.justification, intendedUse: input.intendedUse, decidedAt: undefined });
    await existing.save();
  } else {
    await DonationRequest.create({ donation: donation._id, requester: user.id, justification: input.justification, intendedUse: input.intendedUse });
  }
  await Donation.updateOne(
    { _id: donation._id, status: 'open' },
    { $set: { status: 'requested' }, $push: { history: historyEntry('requested', user.id, 'First request received') } },
  );
  await notify(donation.donor, { type: 'donation.request', title: 'Someone asked for your donation', body: donation.listing?.title, data: { id: donation._id, deepLink: linkTo(donation._id) } });
  return fetchView(id, user);
}

/** Back to "open" when nobody is waiting any more. */
async function reopenIfNoPending(donationId, by) {
  const pending = await DonationRequest.countDocuments({ donation: donationId, status: 'pending' });
  if (pending === 0) {
    await Donation.updateOne({ _id: donationId, status: 'requested' }, { $set: { status: 'open' }, $push: { history: historyEntry('open', by, 'No pending requests') } });
  }
}

async function withdrawRequest(id, user) {
  const donation = await loadDonation(id);
  const request = await DonationRequest.findOneAndUpdate(
    { donation: donation._id, requester: user.id, status: 'pending' },
    { $set: { status: 'withdrawn', decidedAt: new Date() } },
    { new: true },
  );
  if (!request) throw ApiError.notFound('You have no pending request for this donation');
  await reopenIfNoPending(donation._id, user.id);
  return fetchView(id, user);
}

/** The donor accepts one request; every other pending request is rejected at once (FR-DON-004). */
async function decideRequest(id, rid, user, { decision }) {
  const { donation } = await loadParticipant(id, user, { roles: [ACTORS.DONOR] });
  if (!isValidObjectId(rid)) throw ApiError.notFound('Request not found');
  const request = await DonationRequest.findOne({ _id: rid, donation: donation._id });
  if (!request) throw ApiError.notFound('Request not found');
  if (request.status !== 'pending') throw ApiError.conflict('This request was already decided or withdrawn', 'REQUEST_NOT_PENDING');

  if (decision === 'accept') {
    workflow.assertTransition(donation.status, 'accepted', ACTORS.DONOR);
    const updated = await Donation.findOneAndUpdate(
      { _id: donation._id, status: 'requested' },
      { $set: { status: 'accepted', acceptedRequest: request._id }, $push: { history: historyEntry('accepted', user.id, 'Recipient chosen') } },
      { new: true },
    );
    if (!updated) throw ApiError.conflict('This donation was just changed. Reload the page and try again.', 'STALE_STATE');
    const now = new Date();
    const others = await DonationRequest.find({ donation: donation._id, status: 'pending', _id: { $ne: request._id } }).select('requester').lean();
    await Promise.all([
      DonationRequest.updateOne({ _id: request._id }, { $set: { status: 'accepted', decidedAt: now } }),
      DonationRequest.updateMany({ _id: { $in: others.map((o) => o._id) } }, { $set: { status: 'rejected', decidedAt: now } }),
    ]);
    await notify(request.requester, { type: 'donation.accepted', title: 'Your donation request was accepted', body: donation.listing?.title, data: { id: donation._id, deepLink: linkTo(donation._id) } });
    await notify(others.map((o) => o.requester), { type: 'donation.rejected', title: 'The donor chose another recipient', body: donation.listing?.title, data: { id: donation._id, deepLink: linkTo(donation._id) } });
  } else {
    if (donation.status !== 'requested') throw ApiError.conflict('This donation is not waiting for a decision', 'INVALID_TRANSITION');
    await DonationRequest.updateOne({ _id: request._id }, { $set: { status: 'rejected', decidedAt: new Date() } });
    await reopenIfNoPending(donation._id, user.id);
    await notify(request.requester, { type: 'donation.rejected', title: 'Your donation request was declined', body: donation.listing?.title, data: { id: donation._id, deepLink: linkTo(donation._id) } });
  }
  return fetchView(id, user);
}

/* ---------- handover ---------- */

async function scheduleHandover(id, user, input) {
  const { donation, role } = await loadParticipant(id, user, { roles: [ACTORS.DONOR, ACTORS.RECIPIENT] });
  if (input.date.getTime() <= Date.now()) throw ApiError.validation([{ field: 'date', message: 'Choose a date and time in the future' }]);
  const recipientId = donation.acceptedRequest?.requester ? idOf(donation.acceptedRequest.requester) : null;

  if (donation.status === 'accepted') {
    workflow.assertTransition('accepted', 'handover_scheduled', role);
    const pickup = await PickupSchedule.create({
      contextType: 'donation', contextId: donation._id, requester: donation.donor, provider: recipientId,
      date: input.date, timeSlot: input.timeSlot, notes: input.notes, addressArea: donation.listing?.addressArea, exactAddressShared: true, status: 'confirmed', proposedBy: user.id,
    });
    const updated = await Donation.findOneAndUpdate(
      { _id: donation._id, status: 'accepted' },
      { $set: { status: 'handover_scheduled', pickup: pickup._id }, $push: { history: historyEntry('handover_scheduled', user.id, 'Handover scheduled') } },
    );
    if (!updated) {
      await PickupSchedule.deleteOne({ _id: pickup._id });
      throw ApiError.conflict('This donation was just changed. Reload the page and try again.', 'STALE_STATE');
    }
  } else if (donation.status === 'handover_scheduled') {
    if (donation.confirmations?.donorAt || donation.confirmations?.recipientAt) {
      throw ApiError.conflict('The handover has already started and can no longer be rescheduled', 'HANDOVER_IN_PROGRESS');
    }
    const pickup = await PickupSchedule.findById(donation.pickup);
    if (!pickup) throw ApiError.notFound('Handover not found');
    await reschedule(pickup, input, 'handover', user.id);
  } else {
    throw ApiError.conflict('A handover cannot be scheduled at this stage', 'INVALID_TRANSITION');
  }
  const other = role === ACTORS.DONOR ? recipientId : donation.donor;
  await notify(other, { type: 'donation.handover', title: 'Handover scheduled', body: input.date.toISOString(), data: { id: donation._id, deepLink: linkTo(donation._id) } });
  return fetchView(id, user);
}

/** A fresh, hard-to-guess reference such as DON-2026-7K2QXM. The unique index guards against the rare collision. */
const newRefNo = () => `DON-${new Date().getUTCFullYear()}-${crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;

/** Both sides confirm the handover. The donor must tick the data-protection checklist first (BR-12). */
async function confirmHandover(id, user, input) {
  const { donation, role } = await loadParticipant(id, user, { roles: [ACTORS.DONOR, ACTORS.RECIPIENT] });
  if (donation.status !== 'handover_scheduled') throw ApiError.conflict('There is no handover to confirm right now', 'INVALID_TRANSITION');
  const field = role === ACTORS.DONOR ? 'donorAt' : 'recipientAt';
  if (donation.confirmations?.[field]) return fetchView(id, user); // already confirmed: nothing to do
  if (role === ACTORS.DONOR && !input.acknowledgeChecklist) {
    throw ApiError.validation([{ field: 'acknowledgeChecklist', message: 'Please confirm the data-protection checklist before handing over your device' }]);
  }

  const now = new Date();
  const set = { [`confirmations.${field}`]: now };
  if (role === ACTORS.DONOR) set['confirmations.checklistAcknowledgedAt'] = now;
  const updated = await Donation.findOneAndUpdate(
    { _id: donation._id, status: 'handover_scheduled', [`confirmations.${field}`]: { $exists: false } },
    { $set: set },
    { new: true },
  );
  if (!updated) throw ApiError.conflict('This donation was just changed. Reload the page and try again.', 'STALE_STATE');

  const recipientId = idOf(donation.acceptedRequest.requester);
  if (updated.confirmations.donorAt && updated.confirmations.recipientAt) {
    await completeDonation(updated, donation, recipientId, user.id);
  } else {
    const other = role === ACTORS.DONOR ? recipientId : donation.donor;
    await notify(other, { type: 'donation.handover', title: 'The other side confirmed the handover', data: { id: donation._id, deepLink: linkTo(donation._id) } });
  }
  return fetchView(id, user);
}

async function completeDonation(updated, donation, recipientId, byUserId) {
  let done = null;
  for (let attempt = 0; attempt < 3 && !done; attempt += 1) {
    try {
      done = await Donation.findOneAndUpdate(
        { _id: updated._id, status: 'handover_scheduled' },
        {
          $set: { status: 'completed', confirmation: { refNo: newRefNo(), issuedAt: new Date() } },
          $push: { history: historyEntry('completed', byUserId, 'Both sides confirmed the handover') },
        },
        { new: true },
      );
      if (!done) return; // someone else completed it first
    } catch (err) {
      if (err.code !== 11000) throw err; // reference collision: try another
    }
  }
  if (!done) throw ApiError.conflict('Could not issue the confirmation. Please try again.', 'REF_COLLISION');

  try {
    await Promise.all([
      DeviceListing.updateOne({ _id: done.listing }, { $set: { status: 'completed' } }),
      PickupSchedule.updateOne({ _id: done.pickup }, { $set: { status: 'collected', 'handoverConfirmed.byOwner': done.confirmations.donorAt, 'handoverConfirmed.byProvider': done.confirmations.recipientAt, checklistAcknowledgedAt: done.confirmations.checklistAcknowledgedAt } }),
      // A zero-value record keeps the donation in both people's history (FR-TXN-001); no money moves (BR-10).
      Transaction.findOneAndUpdate(
        { refType: 'Donation', refId: done._id },
        { $setOnInsert: { type: 'donation', refType: 'Donation', refId: done._id, payer: recipientId, payee: done.donor, amount: 0, method: 'offline', status: 'confirmed' } },
        { upsert: true },
      ),
      // Verified impact: written only now that the recipient has confirmed (BR-05).
      impact.record({ user: done.donor, type: 'donation', refType: 'Donation', refId: done._id, category: donation.listing?.category?._id || donation.listing?.category, devices: 1, verifiedBy: recipientId }),
    ]);
  } catch (err) {
    logger.error({ err: err.message, donationId: String(done._id) }, 'donation completion side effects failed');
  }
  await notify([done.donor, recipientId], { type: 'donation.completed', title: 'Donation completed', body: `Reference ${done.confirmation.refNo}`, data: { id: done._id, deepLink: linkTo(done._id) } });
}

/* ---------- cancel ---------- */

async function cancelDonation(id, user, reason) {
  const { donation, role } = await loadParticipant(id, user, { roles: [ACTORS.DONOR, ACTORS.ADMIN] });
  workflow.assertTransition(donation.status, 'cancelled', role);
  const updated = await Donation.findOneAndUpdate(
    { _id: donation._id, status: donation.status },
    { $set: { status: 'cancelled', cancelReason: reason }, $push: { history: historyEntry('cancelled', user.id, reason) } },
    { new: true },
  );
  if (!updated) throw ApiError.conflict('This donation was just changed. Reload the page and try again.', 'STALE_STATE');

  const open = await DonationRequest.find({ donation: donation._id, status: { $in: ['pending', 'accepted'] } }).select('requester').lean();
  await Promise.all([
    DonationRequest.updateMany({ _id: { $in: open.map((r) => r._id) } }, { $set: { status: 'rejected', decidedAt: new Date() } }),
    unlockListing(donation.listing._id || donation.listing),
    donation.pickup ? PickupSchedule.updateOne({ _id: donation.pickup._id || donation.pickup }, { $set: { status: 'cancelled' } }) : null,
  ]);
  await notify(open.map((r) => r.requester), { type: 'donation.cancelled', title: 'A donation was withdrawn', body: reason, data: { id: donation._id, deepLink: linkTo(donation._id) } });
  return fetchView(id, user);
}

/* ---------- confirmation document (FR-DON-006) ---------- */

async function getConfirmation(id, user) {
  const { donation } = await loadParticipant(id, user);
  if (donation.status !== 'completed') throw ApiError.conflict('The confirmation is issued once both sides have confirmed the handover', 'NOT_COMPLETED');
  const recipientUser = donation.acceptedRequest?.requester;
  const profiles = await profilesFor([recipientUser]);
  const org = profiles.get(idOf(recipientUser))?.orgProfile || {};
  return {
    refNo: donation.confirmation.refNo,
    issuedAt: donation.confirmation.issuedAt,
    device: {
      title: donation.listing?.title,
      brand: donation.listing?.brand,
      model: donation.listing?.model,
      condition: donation.listing?.condition,
      category: donation.listing?.category?.name,
    },
    donor: { name: donation.donor?.name },
    recipient: { name: recipientUser?.name, orgName: org.orgName, orgType: org.orgType },
    handoverDate: donation.pickup?.date,
    confirmedAt: { donor: donation.confirmations?.donorAt, recipient: donation.confirmations?.recipientAt },
    statement: 'This document records a free transfer of the device named above between the donor and the recipient organisation. No payment was made or processed.',
  };
}

module.exports = {
  recipientStatus, applyAsRecipient, createDonation, listDonations, getDonation, requestDonation, withdrawRequest,
  decideRequest, scheduleHandover, confirmHandover, cancelDonation, getConfirmation,
};

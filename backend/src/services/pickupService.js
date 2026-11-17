'use strict';
// One place to see every pickup, collection and handover the signed-in person is part of (P5-26). Repairs, donations,
// refurbishment and recycling each create their own PickupSchedule; this only reads them. Only the area is shown, never
// the exact address (BR-08) — the exact address stays on the request itself, released only after acceptance.
const PickupSchedule = require('../models/PickupSchedule');
const ServiceRequest = require('../models/ServiceRequest');
const Donation = require('../models/Donation');
const RefurbishmentJob = require('../models/RefurbishmentJob');
const RecyclingRecord = require('../models/RecyclingRecord');
const User = require('../models/User');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { MAX_RESCHEDULES, RESCHEDULE_CUTOFF_MS } = require('./pickupRules');
const { SLOTS, SLOT_DAYS, IST_OFFSET_MS, slotStart, istDay } = require('../config/pickupSlots');
const ApiError = require('../utils/ApiError');
const { notify } = require('./notificationService');

const ACTIVE = ['requested', 'confirmed', 'rescheduled'];
const idOf = (v) => String(v && v._id ? v._id : v);

// contextType -> how it is called, where it lives in the web app, and how to load its title.
const KINDS = {
  service: { kind: 'repair', link: (id) => `/dashboard/requests/${id}`, load: (ids) => titlesFromListing(ServiceRequest, ids) },
  donation: { kind: 'donation', link: (id) => `/dashboard/donations/${id}`, load: (ids) => titlesFromListing(Donation, ids) },
  offer: { kind: 'refurbishment', link: (id) => `/dashboard/refurbishment/${id}`, load: (ids) => titlesFromListing(RefurbishmentJob, ids) },
  recycling: { kind: 'recycling', link: (id) => `/dashboard/recycling/${id}`, load: loadRecyclingTitles },
};

async function titlesFromListing(Model, ids) {
  const rows = await Model.find({ _id: { $in: ids } }).select('listing').populate('listing', 'title');
  return new Map(rows.map((r) => [idOf(r._id), r.listing?.title || 'Device']));
}
async function loadRecyclingTitles(ids) {
  const rows = await RecyclingRecord.find({ _id: { $in: ids } }).select('refNo');
  return new Map(rows.map((r) => [idOf(r._id), `Recycling request ${r.refNo || ''}`.trim()]));
}

/** `when` is 'upcoming' (default: not finished and not yet past) or 'past' (collected, cancelled or already gone by). */
async function listPickups(user, query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const now = new Date();
  const mine = { $or: [{ requester: user.id }, { provider: user.id }] };
  const upcoming = query.when !== 'past';
  const filter = upcoming
    ? { ...mine, status: { $in: ACTIVE }, date: { $gte: now } }
    : { $and: [mine, { $or: [{ status: { $in: ['collected', 'cancelled'] } }, { date: { $lt: now } }] }] };

  const [total, rows] = await Promise.all([
    PickupSchedule.countDocuments(filter),
    PickupSchedule.find(filter).sort({ date: upcoming ? 1 : -1 }).skip(skip).limit(limit),
  ]);

  const byType = {};
  rows.forEach((p) => { (byType[p.contextType] ||= []).push(p.contextId); });
  const titles = {};
  await Promise.all(Object.entries(byType).map(async ([type, ids]) => { titles[type] = KINDS[type] ? await KINDS[type].load(ids) : new Map(); }));

  const otherIds = [...new Set(rows.map((p) => (idOf(p.requester) === user.id ? idOf(p.provider) : idOf(p.requester))))];
  const people = new Map((await User.find({ _id: { $in: otherIds } }).select('name')).map((u) => [idOf(u._id), u.name]));

  const items = rows.map((p) => {
    const asRequester = idOf(p.requester) === user.id;
    const otherId = asRequester ? idOf(p.provider) : idOf(p.requester);
    const spec = KINDS[p.contextType] || { kind: p.contextType, link: () => '/dashboard' };
    return {
      _id: p._id,
      kind: spec.kind,
      contextId: p.contextId,
      title: titles[p.contextType]?.get(idOf(p.contextId)) || 'Pickup',
      link: spec.link(idOf(p.contextId)),
      date: p.date,
      timeSlot: p.timeSlot || '',
      notes: p.notes || '',
      addressArea: p.addressArea || '',
      status: p.status,
      rescheduleCount: p.rescheduleCount || 0,
      reschedulesLeft: Math.max(0, MAX_RESCHEDULES - (p.rescheduleCount || 0)),
      changeableUntil: new Date(p.date.getTime() - RESCHEDULE_CUTOFF_MS),
      canChange: ACTIVE.includes(p.status) && (p.rescheduleCount || 0) < MAX_RESCHEDULES && p.date.getTime() - now.getTime() >= RESCHEDULE_CUTOFF_MS,
      viewerRole: asRequester ? 'requester' : 'provider',
      // A time somebody else set or changed, waiting for this person to confirm it (or to answer with a new time).
      awaitingMe: ['requested', 'rescheduled'].includes(p.status) && Boolean(p.proposedBy) && idOf(p.proposedBy) !== user.id,
      proposedByMe: Boolean(p.proposedBy) && idOf(p.proposedBy) === user.id,
      counterpart: { _id: otherId, name: people.get(otherId) || '' },
    };
  });
  return { items, meta: buildMeta({ page, limit }, total) };
}

const pad = (n) => String(n).padStart(2, '0');

/**
 * The next SLOT_DAYS days of collection windows (FR-PICK-001). A window is open unless it starts less than the change cutoff
 * from now, or the signed-in person already has a pickup in it (`busy`) — nobody can be in two places at once.
 */
async function listSlots(user, now = new Date()) {
  const today = istDay(now);
  const mine = await PickupSchedule.find({
    $or: [{ requester: user.id }, { provider: user.id }],
    status: { $in: ACTIVE },
    date: { $gte: now, $lt: new Date(now.getTime() + (SLOT_DAYS + 1) * 24 * 3600 * 1000) },
  }).select('date');
  const taken = new Set(mine.map((p) => {
    const t = new Date(p.date.getTime() + IST_OFFSET_MS);
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}-${t.getUTCHours()}`;
  }));

  const days = [];
  for (let i = 0; i <= SLOT_DAYS; i += 1) {
    const base = new Date(Date.UTC(today.y, today.m - 1, today.d + i));
    const y = base.getUTCFullYear(); const m = base.getUTCMonth() + 1; const d = base.getUTCDate();
    const slots = SLOTS.map((s) => {
      const start = slotStart(y, m, d, s);
      const tooSoon = start.getTime() - now.getTime() < RESCHEDULE_CUTOFF_MS;
      const busy = [...Array(s.end - s.start).keys()].some((h) => taken.has(`${y}-${pad(m)}-${pad(d)}-${s.start + h}`));
      return { key: s.key, label: s.label, start, available: !tooSoon && !busy, ...(tooSoon ? { reason: 'too_soon' } : busy ? { reason: 'busy' } : {}) };
    });
    if (slots.some((s) => s.available) || i > 0) days.push({ date: `${y}-${pad(m)}-${pad(d)}`, slots });
  }
  return { timezone: 'Asia/Kolkata', cutoffHours: RESCHEDULE_CUTOFF_MS / 3600000, maxReschedules: MAX_RESCHEDULES, days };
}

/**
 * The other side accepts the time that was set or changed (FR-PICK-002). Only the person who did NOT propose it can, only while
 * it is waiting, and not after it has passed. To suggest another time instead, they use the request's own "reschedule".
 */
async function confirmPickup(user, id, now = new Date()) {
  const p = await PickupSchedule.findById(id);
  if (!p || ![idOf(p.requester), idOf(p.provider)].includes(user.id)) throw ApiError.notFound('Pickup not found');
  if (!['requested', 'rescheduled'].includes(p.status)) throw ApiError.conflict('This time does not need confirming', 'NOT_AWAITING');
  if (p.proposedBy && idOf(p.proposedBy) === user.id) throw ApiError.conflict('You suggested this time; the other person confirms it', 'OWN_PROPOSAL');
  if (p.date.getTime() <= now.getTime()) throw ApiError.conflict('This time has already passed', 'TIME_PASSED');
  const done = await PickupSchedule.findOneAndUpdate({ _id: p._id, status: p.status }, { $set: { status: 'confirmed' } }, { new: true });
  if (!done) throw ApiError.conflict('This pickup was just changed. Reload and try again.', 'STALE_STATE');
  const spec = KINDS[p.contextType];
  const proposer = p.proposedBy || (idOf(p.requester) === user.id ? p.provider : p.requester);
  await notify(proposer, {
    type: 'pickup.confirmed', title: 'Pickup time confirmed', body: `${p.date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' })}${p.timeSlot ? ` (${p.timeSlot})` : ''}`,
    data: { id: p.contextId, deepLink: spec ? spec.link(idOf(p.contextId)) : '/dashboard/pickups' },
  });
  return { _id: done._id, status: done.status };
}

module.exports = { listPickups, listSlots, confirmPickup };

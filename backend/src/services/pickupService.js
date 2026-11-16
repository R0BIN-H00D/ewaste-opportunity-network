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
      viewerRole: asRequester ? 'requester' : 'provider',
      counterpart: { _id: otherId, name: people.get(otherId) || '' },
    };
  });
  return { items, meta: buildMeta({ page, limit }, total) };
}

module.exports = { listPickups };

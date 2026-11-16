'use strict';
// Announcements (FR-ADM-011): short messages from the administrators that show as a banner. Each one has an audience (everyone,
// or chosen roles) and an optional window. `publicFeed` is what a visitor or signed-in person sees; the rest is the admin side.
const Announcement = require('../models/Announcement');
const ApiError = require('../utils/ApiError');
const audit = require('./auditService');
const { parsePagination, buildMeta } = require('../utils/pagination');

const stateOf = (a, now = new Date()) => {
  if (a.startsAt && a.startsAt > now) return 'scheduled';
  if (a.endsAt && a.endsAt <= now) return 'ended';
  return 'current';
};

const present = (a) => ({
  _id: a._id,
  title: a.title,
  body: a.body,
  audience: a.audience,
  startsAt: a.startsAt,
  endsAt: a.endsAt || null,
  state: stateOf(a),
  createdBy: a.createdBy && a.createdBy.name ? { _id: a.createdBy._id, name: a.createdBy.name } : null,
  createdAt: a.createdAt,
});

/** "All" wins: choosing everyone and a role is the same as choosing everyone. */
const normaliseAudience = (list) => {
  const unique = [...new Set(list)];
  return unique.includes('all') ? ['all'] : unique;
};

function checkWindow(startsAt, endsAt) {
  if (endsAt && startsAt && endsAt <= startsAt) {
    throw ApiError.validation([{ field: 'endsAt', message: 'The end must be after the start' }]);
  }
}

async function adminList(query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const now = new Date();
  const filter = {};
  if (query.state === 'scheduled') filter.startsAt = { $gt: now };
  else if (query.state === 'ended') filter.endsAt = { $lte: now };
  else if (query.state === 'current') Object.assign(filter, { startsAt: { $lte: now }, $or: [{ endsAt: null }, { endsAt: { $gt: now } }] });
  const [total, rows] = await Promise.all([
    Announcement.countDocuments(filter),
    Announcement.find(filter).sort({ startsAt: -1, _id: -1 }).skip(skip).limit(limit).populate('createdBy', 'name').lean(),
  ]);
  return { items: rows.map(present), meta: buildMeta({ page, limit }, total) };
}

async function create(admin, input, ip) {
  const startsAt = input.startsAt || new Date();
  if (input.endsAt && input.endsAt <= new Date()) throw ApiError.validation([{ field: 'endsAt', message: 'The end must be in the future' }]);
  checkWindow(startsAt, input.endsAt);
  const doc = await Announcement.create({
    title: input.title,
    body: input.body,
    audience: normaliseAudience(input.audience || ['all']),
    startsAt,
    endsAt: input.endsAt || undefined,
    createdBy: admin.id || admin._id,
  });
  await audit.record(admin, 'announcement.created', { targetType: 'Announcement', targetId: doc._id, after: { title: doc.title, audience: doc.audience, startsAt: doc.startsAt, endsAt: doc.endsAt }, ip });
  return present(doc.toObject());
}

async function update(admin, id, input, ip) {
  const doc = await Announcement.findById(id);
  if (!doc) throw ApiError.notFound('Announcement not found');
  const before = { title: doc.title, body: doc.body, audience: doc.audience, startsAt: doc.startsAt, endsAt: doc.endsAt || null };
  const next = { ...before };
  if (input.title !== undefined) next.title = input.title;
  if (input.body !== undefined) next.body = input.body;
  if (input.audience !== undefined) next.audience = normaliseAudience(input.audience);
  if (input.startsAt !== undefined) next.startsAt = input.startsAt;
  if (input.endsAt !== undefined) next.endsAt = input.endsAt; // null clears the end
  const same = JSON.stringify(next) === JSON.stringify(before);
  if (same) throw ApiError.conflict('Nothing was changed', 'NO_CHANGE');
  checkWindow(next.startsAt, next.endsAt);
  doc.set({ ...next, endsAt: next.endsAt || undefined });
  await doc.save();
  await audit.record(admin, 'announcement.updated', { targetType: 'Announcement', targetId: id, before, after: next, ip });
  return present(doc.toObject());
}

async function remove(admin, id, ip) {
  const doc = await Announcement.findById(id).lean();
  if (!doc) throw ApiError.notFound('Announcement not found');
  await Announcement.deleteOne({ _id: id });
  await audit.record(admin, 'announcement.deleted', { targetType: 'Announcement', targetId: id, before: { title: doc.title, audience: doc.audience, startsAt: doc.startsAt, endsAt: doc.endsAt || null }, ip });
  return { _id: id };
}

/** What shows as a banner right now. Visitors see the ones for everyone; a signed-in person also sees those for their role. */
async function publicFeed(user) {
  const now = new Date();
  const audience = user ? ['all', user.role] : ['all'];
  const rows = await Announcement.find({
    startsAt: { $lte: now },
    $and: [{ $or: [{ endsAt: null }, { endsAt: { $gt: now } }] }, { audience: { $in: audience } }],
  }).sort({ startsAt: -1, _id: -1 }).limit(5).select('title body startsAt').lean();
  return rows.map((a) => ({ _id: a._id, title: a.title, body: a.body, startsAt: a.startsAt }));
}

module.exports = { adminList, create, update, remove, publicFeed };

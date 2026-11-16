'use strict';
// Complaints, the person's side (FR-CMP-001, FR-CMP-002). A signed-in person files a complaint and follows it; what the
// administrators write to each other while handling it (internal notes, who took it) stays on the admin side.
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { notify } = require('./notificationService');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { ROLES, ACCOUNT_STATUS } = require('../config/constants');

const ACTIVE = ['open', 'assigned', 'in_review'];
const MAX_ACTIVE_PER_PERSON = 5; // a simple guard against a flood of complaints from one account

const idOf = (v) => String(v && v._id ? v._id : v);

/** What the person who filed it may see: the outcome the administrator wrote, and when each step happened. */
function present(c, against) {
  const closed = !ACTIVE.includes(c.status);
  return {
    _id: c._id,
    subject: c.subject,
    description: c.description,
    refType: c.refType,
    status: c.status,
    against: against || null,
    resolution: closed ? c.resolution || '' : '',
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    timeline: (c.history || []).map((h) => ({ status: h.status, at: h.at })),
  };
}

async function againstMap(complaints) {
  const ids = [...new Set(complaints.map((c) => c.against).filter(Boolean).map(idOf))];
  if (!ids.length) return new Map();
  const users = await User.find({ _id: { $in: ids } }).select('name').lean();
  return new Map(users.map((u) => [idOf(u._id), { _id: u._id, name: u.name }]));
}

async function create(user, input) {
  if (user.role === ROLES.ADMIN) throw ApiError.forbidden('Administrators handle complaints and cannot file them');
  if (await Complaint.countDocuments({ filedBy: user.id, status: { $in: ACTIVE } }) >= MAX_ACTIVE_PER_PERSON) {
    throw ApiError.conflict('You already have several complaints being looked at. Please wait for an answer before filing another.', 'TOO_MANY_OPEN');
  }
  let againstUser = null;
  if (input.against) {
    if (String(input.against) === String(user.id)) throw ApiError.validation([{ field: 'against', message: 'You cannot file a complaint about yourself' }]);
    againstUser = await User.findOne({ _id: input.against, status: { $ne: ACCOUNT_STATUS.DELETED }, role: { $ne: ROLES.ADMIN } }).select('name').lean();
    if (!againstUser) throw ApiError.validation([{ field: 'against', message: 'We could not find that person' }]);
  }
  const complaint = await Complaint.create({
    filedBy: user.id,
    against: againstUser?._id,
    refType: input.refType || 'other',
    refId: input.refId,
    subject: input.subject,
    description: input.description,
    history: [{ status: 'open', at: new Date(), by: user.id, note: 'Filed' }],
  });
  const admins = await User.find({ role: ROLES.ADMIN, status: ACCOUNT_STATUS.ACTIVE }).select('_id').lean();
  await notify(admins.map((a) => a._id), {
    type: 'complaint.new',
    title: 'A new complaint was filed',
    body: complaint.subject,
    data: { deepLink: '/dashboard/admin/complaints' },
  });
  return present(complaint.toObject(), againstUser && { _id: againstUser._id, name: againstUser.name });
}

async function listMine(user, query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const filter = { filedBy: user.id };
  if (query.status === 'active') filter.status = { $in: ACTIVE };
  else if (query.status === 'closed') filter.status = { $nin: ACTIVE };
  else if (query.status) filter.status = query.status;
  const [total, rows] = await Promise.all([
    Complaint.countDocuments(filter),
    Complaint.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
  ]);
  const people = await againstMap(rows);
  return { items: rows.map((c) => present(c, people.get(idOf(c.against)))), meta: buildMeta({ page, limit }, total) };
}

/** Only the person who filed it can open it; anyone else gets the same "not found" as for an id that does not exist. */
async function getMine(user, id) {
  const complaint = await Complaint.findOne({ _id: id, filedBy: user.id }).lean();
  if (!complaint) throw ApiError.notFound('Complaint not found');
  const people = await againstMap([complaint]);
  return present(complaint, people.get(idOf(complaint.against)));
}

module.exports = { create, listMine, getMine, ACTIVE };

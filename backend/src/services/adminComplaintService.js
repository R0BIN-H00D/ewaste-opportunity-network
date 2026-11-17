'use strict';
// Complaints, the administrator's side (FR-ADM-007): the queue, who is handling each one, the status changes and the history.
// Lifecycle: open -> assigned -> in_review -> resolved | rejected. A closed complaint stays on record and is not reopened;
// if the matter comes back, the person files a new one that points to it.
const Complaint = require('../models/Complaint');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const audit = require('./auditService');
const { notify } = require('./notificationService');
const { ACTIVE } = require('./complaintService');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { ROLES, ACCOUNT_STATUS } = require('../config/constants');
const logger = require('../utils/logger');
const impact = require('./impactService');

/** Which impact events a complaint about each kind of thing can undo (the `refType` the event was written with). */
const IMPACT_REF = { service: 'ServiceRequest', order: 'Order', donation: 'Donation', recycling: 'RecyclingRecord' };

const idOf = (v) => String(v && v._id ? v._id : v);
const person = (u) => (u ? { _id: u._id, name: u.name, role: u.role } : null);

function actionsFor(c, adminId) {
  if (!ACTIVE.includes(c.status)) return [];
  const out = [];
  if (!c.assignedTo || idOf(c.assignedTo) !== String(adminId)) out.push('assign');
  if (c.status !== 'in_review') out.push('start_review');
  out.push('resolve', 'reject');
  return out;
}

async function peopleFor(rows) {
  const ids = [...new Set(rows.flatMap((c) => [c.filedBy, c.against, c.assignedTo, ...(c.history || []).map((h) => h.by)]).filter(Boolean).map(idOf))];
  const users = await User.find({ _id: { $in: ids } }).select('name role').lean();
  return new Map(users.map((u) => [idOf(u._id), u]));
}

const present = (c, people, adminId, { full = false } = {}) => ({
  _id: c._id,
  subject: c.subject,
  status: c.status,
  refType: c.refType,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
  filedBy: person(people.get(idOf(c.filedBy))),
  against: c.against ? person(people.get(idOf(c.against))) : null,
  assignedTo: c.assignedTo ? person(people.get(idOf(c.assignedTo))) : null,
  actions: actionsFor(c, adminId),
  ...(full ? {
    description: c.description,
    refId: c.refId || null,
    resolution: c.resolution || '',
    history: (c.history || []).map((h) => ({ status: h.status, at: h.at, note: h.note || '', by: person(people.get(idOf(h.by))) })),
  } : {}),
});

async function list(admin, query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const status = query.status || 'active';
  const filter = {};
  if (status === 'active') filter.status = { $in: ACTIVE };
  else if (status === 'closed') filter.status = { $nin: ACTIVE };
  else if (status !== 'all') filter.status = status;
  if (query.assigned === 'me') filter.assignedTo = admin.id;
  else if (query.assigned === 'unassigned') filter.assignedTo = null;
  // Waiting complaints: oldest first so nothing is left behind. Closed ones: newest first.
  const dir = ACTIVE.includes(status) || status === 'active' ? 1 : -1;
  const [total, rows, counts] = await Promise.all([
    Complaint.countDocuments(filter),
    Complaint.find(filter).sort({ createdAt: dir, _id: dir }).skip(skip).limit(limit).lean(),
    Complaint.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  const people = await peopleFor(rows);
  const byStatus = Object.fromEntries(counts.map((c) => [c._id, c.n]));
  return { items: rows.map((c) => present(c, people, admin.id)), meta: { ...buildMeta({ page, limit }, total), byStatus } };
}

async function get(admin, id) {
  const complaint = await Complaint.findById(id).lean();
  if (!complaint) throw ApiError.notFound('Complaint not found');
  const people = await peopleFor([complaint]);
  return present(complaint, people, admin.id, { full: true });
}

const MESSAGES = {
  assign: { title: 'Your complaint has been picked up', body: 'An administrator is now looking after it.' },
  start_review: { title: 'Your complaint is being reviewed', body: 'We are looking into what happened. We will tell you the outcome.' },
  resolve: { title: 'Your complaint was resolved' },
  reject: { title: 'We reviewed your complaint' },
};

/**
 * One move on a complaint. `assign` hands it to an administrator (yourself unless `assignee` is given), `start_review` moves it
 * to in_review, `resolve` and `reject` close it and need a note, which the person who filed it will read.
 */
async function act(admin, id, { action, note, assignee }, ip) {
  const complaint = await Complaint.findById(id).lean();
  if (!complaint) throw ApiError.notFound('Complaint not found');
  if (!ACTIVE.includes(complaint.status)) throw ApiError.conflict('This complaint is already closed', 'ALREADY_CLOSED');
  const me = String(admin.id || admin._id);
  const closing = action === 'resolve' || action === 'reject';
  if (closing && !String(note || '').trim()) {
    throw ApiError.validation([{ field: 'note', message: 'Write the outcome, so the person who filed it can read it' }]);
  }

  const set = {};
  let status = complaint.status;
  let assignedTo = complaint.assignedTo ? idOf(complaint.assignedTo) : null;

  if (action === 'assign') {
    const target = assignee || me;
    const handler = await User.findOne({ _id: target, role: ROLES.ADMIN, status: ACCOUNT_STATUS.ACTIVE }).select('name').lean();
    if (!handler) throw ApiError.validation([{ field: 'assignee', message: 'Choose an active administrator' }]);
    if (assignedTo === String(target)) throw ApiError.conflict('It is already assigned to this administrator', 'NO_CHANGE');
    assignedTo = String(target);
    if (status === 'open') status = 'assigned';
  } else if (action === 'start_review') {
    if (status === 'in_review') throw ApiError.conflict('It is already being reviewed', 'NO_CHANGE');
    status = 'in_review';
    if (!assignedTo) assignedTo = me;
  } else {
    status = action === 'resolve' ? 'resolved' : 'rejected';
    set.resolution = String(note).trim();
    if (!assignedTo) assignedTo = me;
  }
  set.status = status;
  set.assignedTo = assignedTo;

  const changed = await Complaint.updateOne(
    { _id: id, status: complaint.status },
    { $set: set, $push: { history: { status, at: new Date(), by: me, note: String(note || '').trim() || undefined } } },
  );
  if (!changed.modifiedCount) throw ApiError.conflict('Someone else changed this complaint a moment ago. Open it again to see the latest.', 'CHANGED');

  const auditName = { assign: 'assigned', start_review: 'review_started', resolve: 'resolved', reject: 'rejected' }[action];
  await audit.record(admin, `complaint.${auditName}`, {
    targetType: 'Complaint',
    targetId: id,
    before: { status: complaint.status, assignedTo: complaint.assignedTo ? idOf(complaint.assignedTo) : null },
    after: { status, assignedTo },
    reason: note,
    ip,
  });

  // An upheld complaint about a completed activity takes its Green Score points back, once (BR-05). It never fails the decision.
  if (action === 'resolve' && complaint.refId && IMPACT_REF[complaint.refType]) {
    await impact.reverse({ refType: IMPACT_REF[complaint.refType], refId: complaint.refId }).catch((err) => logger.warn({ err: err.message }, 'impact not reversed'));
  }

  // Both people are told (FR-CMP-002). The other person is only told that a complaint involving them moved, never what it says.
  const msg = MESSAGES[action];
  await notify(complaint.filedBy, {
    type: `complaint.${action}`,
    title: msg.title,
    body: closing ? String(note).trim() : msg.body,
    data: { deepLink: `/dashboard/complaints/${id}` },
  });
  if (complaint.against && (closing || action === 'start_review')) {
    await notify(complaint.against, {
      type: 'complaint.involved',
      title: closing ? 'A complaint involving you was closed' : 'A complaint involving you is being reviewed',
      body: closing ? 'An administrator has finished looking at it.' : 'You may be contacted for your side of it.',
      data: { deepLink: '/dashboard' },
    });
  }
  return get(admin, id);
}

module.exports = { list, get, act };

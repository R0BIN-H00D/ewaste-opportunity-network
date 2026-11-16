'use strict';
// Administrator tools for accounts: find people, see their state, suspend or reactivate them (BR-09, FR-ADM-003).
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const { ACCOUNT_STATUS: S, ROLES, PROVIDER_ROLES } = require('../config/constants');
const { ROLE_PROFILE_MODEL } = require('./profileModels');
const { transition } = require('./accountStatus');
const { notify } = require('./notificationService');
const audit = require('./auditService');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { escapeRegex } = require('../utils/regex');

const idOf = (v) => String(v && v._id ? v._id : v);

/** Verification status of every provider in the list, one query per provider role. */
async function providerStatuses(users) {
  const out = new Map();
  await Promise.all(PROVIDER_ROLES.map(async (role) => {
    const ids = users.filter((u) => u.role === role).map((u) => u._id);
    if (!ids.length) return;
    const rows = await ROLE_PROFILE_MODEL[role].find({ user: { $in: ids } }).select('user verification.status').lean();
    rows.forEach((r) => out.set(idOf(r.user), r.verification?.status || 'not_submitted'));
  }));
  return out;
}

const present = (u, verification) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone || '',
  role: u.role,
  status: u.status,
  emailVerified: !!u.emailVerified,
  lastLoginAt: u.lastLoginAt || null,
  createdAt: u.createdAt,
  verificationStatus: verification || null,
  suspension: u.status === S.SUSPENDED && u.suspension ? { reason: u.suspension.reason, at: u.suspension.at } : null,
});

/** `q` matches name or email; deleted accounts only show when asked for. */
async function listUsers(query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const filter = {};
  if (query.role) filter.role = query.role;
  filter.status = query.status || { $ne: S.DELETED };
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q.trim()), 'i');
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [total, rows] = await Promise.all([
    User.countDocuments(filter),
    User.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).lean(),
  ]);
  const statuses = await providerStatuses(rows);
  return { items: rows.map((u) => present(u, statuses.get(idOf(u._id)))), meta: buildMeta({ page, limit }, total) };
}

/** What an administrator may do to this account right now. The web draws its buttons from this list only. */
function actionsFor(user, adminId) {
  if (user.role === ROLES.ADMIN || idOf(user._id) === adminId || user.status === S.DELETED) return [];
  return user.status === S.SUSPENDED ? ['reactivate'] : ['suspend'];
}

async function getUser(id, adminId) {
  const user = await User.findById(id).lean();
  if (!user) throw ApiError.notFound('User not found');
  const [statuses, profile, history] = await Promise.all([
    providerStatuses([user]),
    UserProfile.findOne({ user: user._id }).select('city state orgProfile').lean(),
    audit.historyFor('user', user._id),
  ]);
  const org = profile?.orgProfile?.isOrg ? profile.orgProfile : null;
  return {
    ...present(user, statuses.get(idOf(user._id))),
    city: profile?.city || '',
    state: profile?.state || '',
    organisation: org ? { name: org.orgName || '', type: org.orgType || '', registrationNo: org.registrationNo || '', recipientStatus: org.recipientVerification?.status || 'not_submitted' } : null,
    actions: actionsFor(user, adminId),
    history,
  };
}

/**
 * Suspend or reactivate. A provider whose documents were never approved goes back to "pending verification", not to active,
 * so reactivating can never be a way round BR-01.
 */
async function setStatus(admin, id, { status, reason }, ip) {
  const target = await User.findById(id);
  if (!target) throw ApiError.notFound('User not found');
  if (idOf(target._id) === admin.id) throw ApiError.forbidden('You cannot change your own account', 'SELF_ACTION');
  if (target.role === ROLES.ADMIN) throw ApiError.forbidden('Administrator accounts are not changed from here', 'ADMIN_PROTECTED');
  if (target.status === S.DELETED) throw ApiError.conflict('This account was deleted', 'INVALID_TRANSITION');

  let to = status === 'suspended' ? S.SUSPENDED : S.ACTIVE;
  if (to === S.ACTIVE && PROVIDER_ROLES.includes(target.role)) {
    const profile = await ROLE_PROFILE_MODEL[target.role].findOne({ user: target._id }).select('verification.status').lean();
    if (profile?.verification?.status !== 'approved') to = S.PENDING;
  }
  if (target.status === to) throw ApiError.conflict(`This account is already ${to === S.PENDING ? 'waiting for verification' : to}`, 'NO_CHANGE');

  const before = target.status;
  const updated = await transition(target._id, to, { by: admin.id, reason });
  await audit.record(admin, to === S.SUSPENDED ? 'user.suspended' : 'user.reactivated', {
    targetType: 'user', targetId: target._id, before: { status: before }, after: { status: updated.status }, reason, ip,
  });
  await notify(target._id, to === S.SUSPENDED
    ? { type: 'account.suspended', title: 'Your account was suspended', body: reason, data: { deepLink: '/contact' } }
    : { type: 'account.reactivated', title: 'Your account is active again', body: to === S.PENDING ? 'Your documents still need to be approved before you can offer services.' : '', data: { deepLink: '/dashboard' } });
  return getUser(target._id, admin.id);
}

module.exports = { listUsers, getUser, setStatus, providerStatuses };

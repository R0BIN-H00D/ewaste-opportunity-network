'use strict';
// The administrator's verification queue (BR-01, FR-ADM-004): providers' documents and donation-recipient organisations.
// Nothing a provider can do depends on anything but the decision made here.
const { Types } = require('mongoose');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const VerificationDocument = require('../models/VerificationDocument');
const { ACCOUNT_STATUS: S, PROVIDER_ROLES } = require('../config/constants');
const { ROLE_PROFILE_MODEL } = require('./profileModels');
const { transition } = require('./accountStatus');
const { notify } = require('./notificationService');
const { toDoc } = require('./verificationService');
const storage = require('./integrations/storage');
const audit = require('./auditService');
const { parsePagination, buildMeta } = require('../utils/pagination');

const idOf = (v) => String(v && v._id ? v._id : v);
const DECISIONS = { approved: 'approved', rejected: 'rejected', resubmission_required: 'resubmission_required' };

const docUrl = (id) => `/api/admin/verifications/documents/${id}/file`;
const presentDoc = (d) => ({ ...toDoc(d), viewUrl: docUrl(d._id) });

/** The few facts an administrator needs to judge a provider, per role. */
function providerFacts(role, p = {}) {
  switch (role) {
    case 'technician':
      return { headline: p.headline || '', city: p.city || '', experienceYears: p.experienceYears || 0, specializations: p.specializations || [], qualifications: (p.qualifications || []).map((q) => ({ title: q.title, institution: q.institution, year: q.year })) };
    case 'refurbisher':
      return { businessName: p.businessName || '', registrationNo: p.registrationNo || '', city: p.city || '', description: p.description || '' };
    case 'recycler':
      return { centreName: p.name || '', authorizationNo: p.authorizationNo || '', authorizingBody: p.authorizingBody || '', city: p.city || '' };
    default:
      return {};
  }
}

/**
 * A page of the queue. `type` is `provider` (default) or `recipient`; `status` defaults to `pending`, oldest first
 * (so nobody waits behind newer arrivals); decided items are newest first.
 */
async function listQueue(query = {}) {
  const status = query.status || 'pending';
  const type = query.type || 'provider';
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const dir = status === 'pending' ? 1 : -1;
  let total = 0;
  let rows = [];

  if (type === 'recipient') {
    const filter = { 'orgProfile.isOrg': true };
    filter['orgProfile.recipientVerification.status'] = status === 'all' ? { $ne: 'not_submitted' } : status;
    const [count, found] = await Promise.all([
      UserProfile.countDocuments(filter),
      UserProfile.find(filter).sort({ updatedAt: dir, _id: dir }).skip(skip).limit(limit).select('user orgProfile updatedAt').lean(),
    ]);
    total = count;
    rows = found.map((p) => ({ userId: idOf(p.user), role: 'user', at: p.updatedAt, status: p.orgProfile.recipientVerification?.status, reason: p.orgProfile.recipientVerification?.reason, reviewedAt: p.orgProfile.recipientVerification?.reviewedAt, organisation: { name: p.orgProfile.orgName || '', type: p.orgProfile.orgType || '', registrationNo: p.orgProfile.registrationNo || '' } }));
  } else {
    const roles = query.role ? PROVIDER_ROLES.filter((r) => r === query.role) : PROVIDER_ROLES;
    const filter = { 'verification.status': status === 'all' ? { $ne: 'not_submitted' } : status };
    // One small query per role; merge by time. Plenty for the size of a review queue.
    const parts = await Promise.all(roles.map(async (role) => {
      const Model = ROLE_PROFILE_MODEL[role];
      const [count, found] = await Promise.all([
        Model.countDocuments(filter),
        Model.find(filter).sort({ updatedAt: dir, _id: dir }).limit(skip + limit).select('user verification updatedAt').lean(),
      ]);
      return { count, found: found.map((p) => ({ userId: idOf(p.user), role, at: p.updatedAt, status: p.verification?.status, reason: p.verification?.reason, reviewedAt: p.verification?.reviewedAt })) };
    }));
    total = parts.reduce((n, p) => n + p.count, 0);
    rows = parts.flatMap((p) => p.found).sort((a, b) => (dir === 1 ? a.at - b.at : b.at - a.at)).slice(skip, skip + limit);
  }

  const ids = rows.map((r) => r.userId);
  const [users, docCounts] = await Promise.all([
    User.find({ _id: { $in: ids } }).select('name email').lean(),
    type === 'recipient' ? [] : VerificationDocument.aggregate([{ $match: { owner: { $in: ids.map((i) => new Types.ObjectId(i)) } } }, { $group: { _id: '$owner', n: { $sum: 1 } } }]),
  ]);
  const byUser = new Map(users.map((u) => [idOf(u._id), u]));
  const counts = new Map(docCounts.map((d) => [idOf(d._id), d.n]));
  const items = rows.map((r) => ({
    userId: r.userId,
    type,
    role: r.role,
    name: byUser.get(r.userId)?.name || '',
    email: byUser.get(r.userId)?.email || '',
    status: r.status,
    reason: r.reason || '',
    submittedAt: r.at,
    reviewedAt: r.reviewedAt || null,
    documentCount: counts.get(r.userId) || 0,
    ...(r.organisation ? { organisation: r.organisation } : {}),
  }));
  return { items, meta: buildMeta({ page, limit }, total) };
}

async function loadSubject(userId, type) {
  const user = await User.findById(userId).select('name email phone role status emailVerified createdAt').lean();
  if (!user) throw ApiError.notFound('User not found');
  if (type === 'recipient') {
    const profile = await UserProfile.findOne({ user: user._id }).select('city state orgProfile').lean();
    if (!profile?.orgProfile?.isOrg) throw ApiError.notFound('This person has not registered an organisation');
    return { user, kind: 'recipient', profile, verification: profile.orgProfile.recipientVerification || {}, facts: { organisationName: profile.orgProfile.orgName || '', organisationType: profile.orgProfile.orgType || '', registrationNo: profile.orgProfile.registrationNo || '', city: profile.city || '', state: profile.state || '' } };
  }
  if (!PROVIDER_ROLES.includes(user.role)) throw ApiError.notFound('This person is not a provider');
  const profile = await ROLE_PROFILE_MODEL[user.role].findOne({ user: user._id }).lean();
  if (!profile) throw ApiError.notFound('Provider profile not found');
  return { user, kind: 'provider', profile, verification: profile.verification || {}, facts: providerFacts(user.role, profile) };
}

async function getSubmission(userId, type = 'provider') {
  const { user, kind, verification, facts } = await loadSubject(userId, type);
  const [docs, history, reviewer] = await Promise.all([
    kind === 'provider' ? VerificationDocument.find({ owner: user._id }).sort({ submittedAt: -1 }).lean() : [],
    audit.historyFor('verification', user._id),
    verification.reviewedBy ? User.findById(verification.reviewedBy).select('name').lean() : null,
  ]);
  const status = verification.status || 'not_submitted';
  return {
    userId: idOf(user._id),
    type: kind,
    role: kind === 'recipient' ? 'user' : user.role,
    user: { name: user.name, email: user.email, phone: user.phone || '', status: user.status, emailVerified: !!user.emailVerified, joinedAt: user.createdAt },
    status,
    reason: verification.reason || '',
    reviewedAt: verification.reviewedAt || null,
    reviewedBy: reviewer ? { _id: reviewer._id, name: reviewer.name } : null,
    facts,
    documents: docs.map(presentDoc),
    actions: status === 'pending' ? ['approve', 'reject', 'request_resubmission'] : [],
    history,
  };
}

/** Approve, reject or ask for new documents. Only a submission that is waiting can be decided. */
async function decide(admin, userId, { type = 'provider', decision, reason }, ip) {
  const status = DECISIONS[decision];
  const subject = await loadSubject(userId, type);
  const current = subject.verification.status || 'not_submitted';
  if (current !== 'pending') throw ApiError.conflict('This submission is not waiting for review', 'NOT_PENDING');
  if (status !== 'approved' && !String(reason || '').trim()) throw ApiError.validation([{ field: 'reason', message: 'Tell the applicant what to fix or why it was refused' }]);

  const now = new Date();
  const result = { status, reviewedBy: admin.id, reviewedAt: now, reason: status === 'approved' ? undefined : reason.trim() };

  if (subject.kind === 'recipient') {
    await UserProfile.updateOne({ user: userId }, { $set: { 'orgProfile.recipientVerification': result } });
  } else {
    await ROLE_PROFILE_MODEL[subject.user.role].updateOne({ user: userId }, { $set: { verification: result } });
    await VerificationDocument.updateMany(
      { owner: userId, status: 'pending' },
      { $set: { status: status === 'approved' ? 'approved' : 'rejected', reviewedBy: admin.id, reviewedAt: now, reason: result.reason } },
    );
    // First approval is what turns a waiting provider account into an active one.
    if (status === 'approved' && subject.user.status === S.PENDING) await transition(userId, S.ACTIVE, { by: admin.id });
  }

  await audit.record(admin, `verification.${status}`, {
    targetType: 'verification', targetId: userId, before: { status: current }, after: { status, type: subject.kind, role: subject.kind === 'recipient' ? 'user' : subject.user.role }, reason: result.reason, ip,
  });

  const who = subject.kind === 'recipient' ? 'organisation' : 'account';
  const copy = {
    approved: [`Your ${who} is verified`, subject.kind === 'recipient' ? 'You can now request donated devices.' : 'You can now offer your services on the platform.'],
    rejected: [`Your ${who} was not approved`, result.reason],
    resubmission_required: ['We need new documents from you', result.reason],
  }[status];
  await notify(userId, { type: `verification.${status}`, title: copy[0], body: copy[1], data: { deepLink: '/dashboard/settings' } });
  return getSubmission(userId, type);
}

/** Opens a stored private document for an administrator. The view is itself written to the audit trail. */
async function openDocument(admin, docId, ip) {
  const doc = await VerificationDocument.findById(docId);
  if (!doc) throw ApiError.notFound('Document not found');
  const opened = await storage.openPrivate(doc.file.publicId);
  await audit.record(admin, 'verification.document_viewed', { targetType: 'verification', targetId: doc.owner, after: { documentId: idOf(doc._id), docType: doc.docType }, ip });
  return { ...opened, mime: doc.file.mime, name: doc.file.originalName || `${doc.docType}` };
}

module.exports = { listQueue, getSubmission, decide, openDocument };

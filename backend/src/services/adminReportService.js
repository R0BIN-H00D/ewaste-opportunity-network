'use strict';
// The report queue (FR-ADM-009): what people flagged, what it points at, and the three things an administrator can do:
// take the item down, note that it was dealt with elsewhere, or dismiss the report.
const Report = require('../models/Report');
const DeviceListing = require('../models/DeviceListing');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const Review = require('../models/Review');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const audit = require('./auditService');
const mod = require('./moderationService');
const { notify } = require('./notificationService');
const { parsePagination, buildMeta } = require('../utils/pagination');

const idOf = (v) => String(v && v._id ? v._id : v);
const key = (type, id) => `${type}:${idOf(id)}`;
const excerpt = (s = '') => (s.length > 200 ? `${s.slice(0, 200)}…` : s);

/** Loads what each report points at, one query per kind. Anything deleted since shows as no longer available. */
async function loadTargets(reports) {
  const ids = (type) => [...new Set(reports.filter((r) => r.targetType === type).map((r) => idOf(r.targetId)))];
  const some = (list, query) => (list.length ? query(list) : []);
  const [listings, products, reviews, users] = await Promise.all([
    some(ids('listing'), (l) => DeviceListing.find({ _id: { $in: l } }).select('title status owner').populate('owner', 'name').lean()),
    some(ids('product'), (l) => MarketplaceProduct.find({ _id: { $in: l } }).select('title status seller').populate('seller', 'name').lean()),
    some(ids('review'), (l) => Review.find({ _id: { $in: l } }).select('rating comment status reviewer target').populate('reviewer', 'name').populate('target', 'name').lean()),
    some(ids('user'), (l) => User.find({ _id: { $in: l } }).select('name role status').lean()),
  ]);
  const map = new Map();
  listings.forEach((t) => map.set(key('listing', t._id), { title: t.title, status: t.status, owner: t.owner?.name || '' }));
  products.forEach((t) => map.set(key('product', t._id), { title: t.title, status: t.status, owner: t.seller?.name || '' }));
  reviews.forEach((t) => map.set(key('review', t._id), { title: `${t.rating}-star review of ${t.target?.name || 'a provider'}`, status: t.status, owner: t.reviewer?.name || '', excerpt: excerpt(t.comment) }));
  users.forEach((t) => map.set(key('user', t._id), { title: t.name, status: t.status, owner: '', role: t.role }));
  return map;
}

/** How many reports (of any state) point at the same item, so a repeatedly flagged item stands out. */
async function countPerTarget(reports) {
  if (!reports.length) return new Map();
  const rows = await Report.aggregate([
    { $match: { $or: reports.map((r) => ({ targetType: r.targetType, targetId: r.targetId })) } },
    { $group: { _id: { t: '$targetType', i: '$targetId' }, n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [key(r._id.t, r._id.i), r.n]));
}

function actionsFor(report, target) {
  if (report.status !== 'open') return [];
  const out = ['dismiss', 'resolve'];
  const takeDownable = target && ((report.targetType === 'listing' && target.status !== 'removed_by_admin')
    || (report.targetType === 'product' && target.status !== 'removed')
    || (report.targetType === 'review' && target.status !== 'removed' && target.status !== 'hidden'));
  if (takeDownable) out.unshift('take_down');
  return out;
}

const present = (r, targets, counts, reporters) => {
  const t = targets.get(key(r.targetType, r.targetId));
  return {
    _id: r._id,
    status: r.status,
    reason: r.reason,
    details: r.details || '',
    createdAt: r.createdAt,
    reviewedAt: r.reviewedAt || null,
    decisionNote: r.decisionNote || '',
    reporter: reporters.get(idOf(r.reporter)) || null,
    target: { type: r.targetType, id: r.targetId, exists: Boolean(t), ...(t || { title: 'No longer available', status: '', owner: '' }) },
    reportsOnItem: counts.get(key(r.targetType, r.targetId)) || 1,
    actions: actionsFor(r, t),
  };
};

async function reporterMap(reports) {
  const ids = [...new Set(reports.map((r) => idOf(r.reporter)))];
  const users = await User.find({ _id: { $in: ids } }).select('name').lean();
  return new Map(users.map((u) => [idOf(u._id), { _id: u._id, name: u.name }]));
}

async function listReports(query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const status = query.status || 'open';
  const filter = {};
  if (status !== 'all') filter.status = status;
  if (query.targetType) filter.targetType = query.targetType;
  if (query.reason) filter.reason = query.reason;
  // Waiting reports: oldest first, so nothing is left behind. Decided ones: newest first.
  const dir = status === 'open' ? 1 : -1;
  const [total, rows] = await Promise.all([
    Report.countDocuments(filter),
    Report.find(filter).sort({ createdAt: dir, _id: dir }).skip(skip).limit(limit).lean(),
  ]);
  const [targets, counts, reporters] = await Promise.all([loadTargets(rows), countPerTarget(rows), reporterMap(rows)]);
  return { items: rows.map((r) => present(r, targets, counts, reporters)), meta: buildMeta({ page, limit }, total) };
}

async function getReport(id) {
  const report = await Report.findById(id).lean();
  if (!report) throw ApiError.notFound('Report not found');
  const [targets, counts, reporters, history] = await Promise.all([loadTargets([report]), countPerTarget([report]), reporterMap([report]), audit.historyFor('Report', report._id)]);
  return { ...present(report, targets, counts, reporters), history };
}

async function decide(admin, id, { decision, reason }, ip) {
  const report = await Report.findById(id).lean();
  if (!report) throw ApiError.notFound('Report not found');
  if (report.status !== 'open') throw ApiError.conflict('This report has already been decided', 'NOT_OPEN');
  if (decision !== 'dismiss' && !String(reason || '').trim()) {
    throw ApiError.validation([{ field: 'reason', message: 'Write what was done, so the record is clear' }]);
  }

  if (decision === 'take_down') {
    const args = { reason, ip };
    if (report.targetType === 'listing') await mod.removeListing(admin, report.targetId, args);
    else if (report.targetType === 'product') await mod.removeProduct(admin, report.targetId, args);
    else if (report.targetType === 'review') await mod.setReviewStatus(admin, report.targetId, { ...args, status: 'hidden' });
    else throw ApiError.validation([{ field: 'decision', message: 'Reports about a person are handled from their account page' }]);
  }

  const status = decision === 'dismiss' ? 'dismissed' : 'actioned';
  await Report.updateOne({ _id: id }, { $set: { status, reviewedBy: admin.id || admin._id, reviewedAt: new Date(), decisionNote: reason || '' } });
  await audit.record(admin, `report.${status}`, { targetType: 'Report', targetId: id, before: { status: 'open' }, after: { status, decision, item: `${report.targetType}:${report.targetId}` }, reason, ip });
  await notify(report.reporter, {
    type: 'report.reviewed',
    title: 'We reviewed your report',
    body: status === 'actioned' ? 'Thank you. We took action on what you reported.' : 'We looked at your report and decided no action was needed.',
    data: { deepLink: '/dashboard' },
  });
  return getReport(id);
}

module.exports = { listReports, getReport, decide };

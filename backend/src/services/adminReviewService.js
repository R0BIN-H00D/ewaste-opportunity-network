'use strict';
// Review moderation (FR-ADM-009). Reviews are public, so what an administrator can do is limited to hiding, removing and
// bringing back. The text is never edited.
const Review = require('../models/Review');
const Report = require('../models/Report');
const mod = require('./moderationService');
const { parsePagination, buildMeta } = require('../utils/pagination');

const actionsFor = (status) => ({ visible: ['hide', 'remove'], hidden: ['restore', 'remove'], removed: ['restore'] }[status] || []);

async function listReviews(query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const filter = {};
  if (query.status) filter.status = query.status;
  if (query.rating) filter.rating = query.rating;
  if (query.reported === 'true') {
    filter._id = { $in: await Report.distinct('targetId', { targetType: 'review', status: 'open' }) };
  }
  const [total, rows] = await Promise.all([
    Review.countDocuments(filter),
    Review.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit)
      .populate('reviewer', 'name').populate('target', 'name').lean(),
  ]);

  const ids = rows.map((r) => r._id);
  const open = ids.length ? await Report.aggregate([{ $match: { targetType: 'review', targetId: { $in: ids }, status: 'open' } }, { $group: { _id: '$targetId', n: { $sum: 1 } } }]) : [];
  const openBy = new Map(open.map((o) => [String(o._id), o.n]));

  const items = rows.map((r) => ({
    _id: r._id,
    rating: r.rating,
    quality: r.quality || null,
    communication: r.communication || null,
    timeliness: r.timeliness || null,
    comment: r.comment || '',
    status: r.status,
    contextType: r.contextType,
    reviewer: r.reviewer ? { _id: r.reviewer._id, name: r.reviewer.name } : null,
    target: r.target ? { _id: r.target._id, name: r.target.name, role: r.targetRole } : null,
    openReports: openBy.get(String(r._id)) || 0,
    createdAt: r.createdAt,
    actions: actionsFor(r.status),
  }));
  return { items, meta: buildMeta({ page, limit }, total) };
}

module.exports = { listReviews, setStatus: mod.setReviewStatus };

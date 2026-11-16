'use strict';
// Listings as an administrator sees them (FR-ADM-005): every public listing, with its owner and how often it was reported.
// Only the area is shown, never the exact location (BR-08); the public page is already open to administrators for the rest.
const { Types } = require('mongoose');
const DeviceListing = require('../models/DeviceListing');
const Report = require('../models/Report');
const mod = require('./moderationService');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { escapeRegex } = require('../utils/regex');

/** What the administrator may do next, so the screen draws buttons from the server's word (as with every workflow). */
const actionsFor = (l) => {
  if (l.status === 'removed_by_admin') return ['restore'];
  if (['draft', 'listed', 'withdrawn'].includes(l.status) && !l.lockedBy?.refId) return ['remove'];
  return [];
};

async function listListings(query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const filter = {};
  // Drafts are private to their owner, so they only appear when asked for by name.
  filter.status = query.status || { $ne: 'draft' };
  if (query.category) filter.category = new Types.ObjectId(query.category);
  if (query.reported === 'true') filter.reportCount = { $gt: 0 };
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q.trim()), 'i');
    filter.$or = [{ title: rx }, { brand: rx }, { model: rx }];
  }
  const sort = query.reported === 'true' ? { reportCount: -1, createdAt: -1 } : { createdAt: -1, _id: -1 };

  const [total, rows] = await Promise.all([
    DeviceListing.countDocuments(filter),
    DeviceListing.find(filter).sort(sort).skip(skip).limit(limit)
      .select('title brand model condition preferredService status city addressArea reportCount lockedBy moderation owner category createdAt')
      .populate('owner', 'name').populate('category', 'name').lean(),
  ]);

  const ids = rows.map((r) => r._id);
  const open = ids.length ? await Report.aggregate([{ $match: { targetType: 'listing', targetId: { $in: ids }, status: 'open' } }, { $group: { _id: '$targetId', n: { $sum: 1 } } }]) : [];
  const openBy = new Map(open.map((o) => [String(o._id), o.n]));

  const items = rows.map((l) => ({
    _id: l._id,
    title: l.title,
    brand: l.brand || '',
    model: l.model || '',
    condition: l.condition,
    preferredService: l.preferredService,
    status: l.status,
    area: [l.addressArea, l.city].filter(Boolean).join(', '),
    owner: l.owner ? { _id: l.owner._id, name: l.owner.name } : null,
    category: l.category ? { _id: l.category._id, name: l.category.name } : null,
    reportCount: l.reportCount || 0,
    openReports: openBy.get(String(l._id)) || 0,
    locked: Boolean(l.lockedBy?.refId),
    removal: l.status === 'removed_by_admin' && l.moderation ? { reason: l.moderation.reason || '', at: l.moderation.at || null } : null,
    createdAt: l.createdAt,
    actions: actionsFor(l),
  }));
  return { items, meta: buildMeta({ page, limit }, total) };
}

module.exports = {
  listListings,
  removeListing: mod.removeListing,
  restoreListing: mod.restoreListing,
};

'use strict';
// Recycling centre directory (FR-REC-001, FR-REC-007). Only centres that are admin-approved, whose authorisation has not
// run out and whose account is active are listed or can be chosen for a request (BR-01, BR-09).
const { isValidObjectId } = require('mongoose');
const RecyclingCenter = require('../models/RecyclingCenter');
const Category = require('../models/Category');
const User = require('../models/User');
const RecyclingRecord = require('../models/RecyclingRecord');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { serializeCenter } = require('../serializers/recycling');
const { ACCOUNT_STATUS } = require('../config/constants');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const POPULATE = [{ path: 'acceptedCategories', select: 'name slug icon' }];

/** Base filter for every centre a visitor may see or pick. */
async function selectableFilter() {
  const activeUsers = await User.distinct('_id', { role: 'recycler', status: ACCOUNT_STATUS.ACTIVE });
  return {
    user: { $in: activeUsers },
    'verification.status': 'approved',
    $and: [{ $or: [{ validUntil: { $exists: false } }, { validUntil: null }, { validUntil: { $gt: new Date() } }] }],
  };
}

async function listCenters(query) {
  const pg = parsePagination(query, { defaultLimit: 12 });
  const filter = await selectableFilter();
  if (query.city) filter.city = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$and.push({ $or: [{ name: rx }, { city: rx }] });
  }
  if (query.category) {
    const cat = await Category.findOne({ slug: query.category }).select('_id').lean();
    filter.acceptedCategories = cat ? cat._id : null;
  }
  const [rows, total] = await Promise.all([
    RecyclingCenter.find(filter).populate(POPULATE).sort({ ratingAvg: -1, name: 1 }).skip(pg.skip).limit(pg.limit).lean(),
    RecyclingCenter.countDocuments(filter),
  ]);
  return { items: rows.map((c) => serializeCenter(c)), meta: buildMeta(pg, total) };
}

async function getCenter(id) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Recycling centre not found');
  const filter = { ...(await selectableFilter()), _id: id };
  const center = await RecyclingCenter.findOne(filter).populate(POPULATE).lean();
  if (!center) throw ApiError.notFound('Recycling centre not found');
  return serializeCenter(center, { detail: true });
}

/**
 * A public side-by-side of the selectable centres (P9-06): how many requests each has finished, and the kilograms that were
 * weighed kept apart from the kilograms that were only estimated (BR-06). Nothing is added across the two, and a centre with
 * nothing finished yet shows zeros rather than being left out.
 */
async function compareCenters(query) {
  const filter = await selectableFilter();
  if (query.city) filter.city = new RegExp(`^${escapeRegex(query.city)}$`, 'i');
  if (query.category) {
    const cat = await Category.findOne({ slug: query.category }).select('_id').lean();
    filter.acceptedCategories = cat ? cat._id : null;
  }
  const rows = await RecyclingCenter.find(filter).populate(POPULATE).lean();
  const done = await RecyclingRecord.aggregate([
    { $match: { center: { $in: rows.map((c) => c._id) }, status: 'completed' } },
    { $group: { _id: '$center', completed: { $sum: 1 }, devices: { $sum: '$deviceCount' } } },
  ]);
  const byCenter = new Map(done.map((d) => [String(d._id), d]));
  const items = rows.map((c) => ({
    ...serializeCenter(c, { detail: true }),
    completedRequests: byCenter.get(String(c._id))?.completed || 0,
    devicesRecycled: byCenter.get(String(c._id))?.devices || 0,
  }));
  const sorts = {
    rating: (a, b) => b.ratingAvg - a.ratingAvg,
    measured: (a, b) => b.totals.actualKg - a.totals.actualKg,
    completed: (a, b) => b.completedRequests - a.completedRequests,
  };
  items.sort((a, b) => (sorts[query.sort] || sorts.rating)(a, b) || a.name.localeCompare(b.name));
  return items.slice(0, query.limit || 20);
}

/**
 * Loads a centre a requester wants to use. Throws 409 when it cannot be chosen and 422 when it does not take a category.
 * @returns the centre document
 */
async function assertSelectable(centerId, categoryIds, requesterId) {
  const center = await RecyclingCenter.findOne({ ...(await selectableFilter()), _id: centerId }).select('name user acceptedCategories');
  if (!center) throw ApiError.conflict('This recycling centre is not available', 'CENTER_UNAVAILABLE');
  if (String(center.user) === String(requesterId)) throw ApiError.conflict('You cannot send a request to your own centre', 'OWN_CENTER');
  const accepted = new Set((center.acceptedCategories || []).map(String));
  const refused = categoryIds.filter((c) => !accepted.has(String(c)));
  if (refused.length) {
    throw ApiError.validation([{ field: 'categories', message: 'This centre does not accept every category you chose' }]);
  }
  return center;
}

module.exports = { listCenters, compareCenters, getCenter, assertSelectable, selectableFilter };

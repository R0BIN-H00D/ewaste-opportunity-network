'use strict';
// Reviews (FR-REV-*, BR-04). A review needs a completed transaction between the reviewer and the provider, one per
// transaction. Each kind of transaction registers a resolver below; new modules add theirs when they are built.
const mongoose = require('mongoose');
const Review = require('../models/Review');
const ServiceRequest = require('../models/ServiceRequest');
const TechnicianProfile = require('../models/TechnicianProfile');
const RefurbisherProfile = require('../models/RefurbisherProfile');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta } = require('../utils/pagination');

/** Which profile holds the aggregate rating for each provider role. */
const RATING_PROFILE = { technician: TechnicianProfile, refurbisher: RefurbisherProfile };

/** Returns { target, targetRole, done() } or throws. Strangers get 404 so ids cannot be probed. */
const RESOLVERS = {
  async service(contextId, reviewer) {
    const request = await ServiceRequest.findById(contextId).lean();
    if (!request || String(request.customer) !== reviewer.id || !request.technician) throw ApiError.notFound('Completed service not found');
    if (request.status !== 'service_completed') throw ApiError.conflict('You can review a service once it is completed', 'NOT_COMPLETED');
    return {
      target: request.technician,
      targetRole: 'technician',
      done: () => ServiceRequest.updateOne({ _id: request._id }, { $set: { reviewed: true } }),
    };
  },
  async order(contextId, reviewer) {
    const order = await Order.findById(contextId).lean();
    if (!order || String(order.buyer) !== reviewer.id) throw ApiError.notFound('Completed order not found');
    if (order.status !== 'completed') throw ApiError.conflict('You can review an order once you have received it', 'NOT_COMPLETED');
    return {
      target: order.seller,
      targetRole: 'refurbisher',
      done: () => Order.updateOne({ _id: order._id }, { $set: { reviewed: true } }),
    };
  },
};

/** "Asha Rao" -> "Asha R." Reviews are public, so only a short form of the name is shown. */
const shortName = (name = '') => {
  const [first, ...rest] = String(name).trim().split(/\s+/);
  return rest.length ? `${first} ${rest[rest.length - 1][0].toUpperCase()}.` : first || 'Customer';
};

function serialize(r) {
  return {
    _id: r._id,
    rating: r.rating,
    quality: r.quality,
    communication: r.communication,
    timeliness: r.timeliness,
    comment: r.comment,
    reviewer: { name: shortName(r.reviewer?.name), avatar: r.reviewer?.avatar },
    createdAt: r.createdAt,
  };
}

/** Recomputes mean and count from the visible reviews, so hiding or removing one (admin, Phase 6) keeps it correct. */
async function recomputeRating(target, role) {
  const Profile = RATING_PROFILE[role];
  if (!Profile) return;
  const [agg] = await Review.aggregate([
    { $match: { target: new mongoose.Types.ObjectId(String(target)), status: 'visible' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  await Profile.updateOne({ user: target }, { $set: { ratingAvg: agg ? Math.round(agg.avg * 100) / 100 : 0, ratingCount: agg ? agg.count : 0 } });
}

async function createReview(user, input) {
  const resolve = RESOLVERS[input.contextType];
  if (!resolve) throw ApiError.validation([{ field: 'contextType', message: 'Reviews for this kind of service are not available yet' }]);
  const { target, targetRole, done } = await resolve(input.contextId, user);

  let review;
  try {
    review = await Review.create({
      reviewer: user.id, target, targetRole, contextType: input.contextType, contextId: input.contextId,
      rating: input.rating, quality: input.quality, communication: input.communication, timeliness: input.timeliness, comment: input.comment || undefined,
    });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('You have already reviewed this service', 'ALREADY_REVIEWED'); // BR-04
    throw err;
  }
  await Promise.all([recomputeRating(target, targetRole), done()]);
  return serialize({ ...review.toObject(), reviewer: { name: user.name } });
}

/** Public: visible reviews of one provider with a rating summary. */
async function listReviews(query) {
  const pg = parsePagination(query, { defaultLimit: 10 });
  const filter = { target: query.target, status: 'visible' };
  const [rows, total, dist] = await Promise.all([
    Review.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate('reviewer', 'name avatar').lean(),
    Review.countDocuments(filter),
    Review.aggregate([{ $match: { target: new mongoose.Types.ObjectId(query.target), status: 'visible' } }, { $group: { _id: '$rating', n: { $sum: 1 } } }]),
  ]);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const d of dist) {
    distribution[d._id] = d.n;
    sum += d._id * d.n;
  }
  return {
    items: rows.map(serialize),
    meta: { ...buildMeta(pg, total), summary: { average: total ? Math.round((sum / total) * 100) / 100 : 0, count: total, distribution } },
  };
}

module.exports = { createReview, listReviews, recomputeRating, RESOLVERS };

'use strict';
// The few things an administrator can do to public content: take a listing or product down, bring a listing back, and hide
// or restore a review. They live here, not in the screens that trigger them, because both the list pages and the report queue
// need them, and each one must audit, notify the owner and settle any open reports about the same item.
const DeviceListing = require('../models/DeviceListing');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const Review = require('../models/Review');
const Report = require('../models/Report');
const ApiError = require('../utils/ApiError');
const audit = require('./auditService');
const { notify } = require('./notificationService');
const { recomputeRating } = require('./reviewService');

const GENERIC_NOTE = 'Closed together with another report about the same item';
const adminId = (admin) => admin.id || admin._id;

/** Reports about an item that has just been dealt with are closed with it, so the queue never shows stale work. */
const closeReports = (targetType, targetId, admin) => Report.updateMany(
  { targetType, targetId, status: 'open' },
  { $set: { status: 'actioned', reviewedBy: adminId(admin), reviewedAt: new Date(), decisionNote: GENERIC_NOTE } },
);

async function removeListing(admin, id, { reason, ip } = {}) {
  const listing = await DeviceListing.findById(id).select('title owner status lockedBy').lean();
  if (!listing) throw ApiError.notFound('Listing not found');
  if (listing.status === 'removed_by_admin') throw ApiError.conflict('This listing has already been removed', 'NO_CHANGE');
  if (listing.status === 'in_service' || listing.lockedBy?.refId) {
    throw ApiError.conflict('This listing is part of an active service. Let the service finish or be cancelled first.', 'LISTING_LOCKED'); // BR-03
  }
  if (listing.status === 'completed') throw ApiError.conflict('A completed listing is part of the record and cannot be removed', 'LISTING_FINAL');

  const res = await DeviceListing.updateOne(
    { _id: id, status: listing.status },
    { $set: { status: 'removed_by_admin', moderation: { previousStatus: listing.status, reason, by: adminId(admin), at: new Date() } } },
  );
  if (!res.matchedCount) throw ApiError.conflict('This listing was just changed. Reload and try again.', 'CHANGED');

  await closeReports('listing', id, admin);
  await audit.record(admin, 'listing.removed', { targetType: 'DeviceListing', targetId: id, before: { status: listing.status }, after: { status: 'removed_by_admin' }, reason, ip });
  await notify(listing.owner, {
    type: 'listing.removed',
    title: 'Your listing was removed',
    body: `An administrator removed "${listing.title}". Reason: ${reason}`,
    data: { deepLink: '/dashboard/listings' },
  });
  return { _id: id, status: 'removed_by_admin' };
}

async function restoreListing(admin, id, { reason, ip } = {}) {
  const listing = await DeviceListing.findById(id).select('title owner status moderation').lean();
  if (!listing) throw ApiError.notFound('Listing not found');
  if (listing.status !== 'removed_by_admin') throw ApiError.conflict('This listing has not been removed', 'NOT_REMOVED');
  const back = listing.moderation?.previousStatus || 'listed';

  await DeviceListing.updateOne({ _id: id, status: 'removed_by_admin' }, { $set: { status: back }, $unset: { moderation: '' } });
  await audit.record(admin, 'listing.restored', { targetType: 'DeviceListing', targetId: id, before: { status: 'removed_by_admin' }, after: { status: back }, reason, ip });
  await notify(listing.owner, {
    type: 'listing.restored',
    title: 'Your listing is back',
    body: `"${listing.title}" has been restored by an administrator.`,
    data: { deepLink: '/dashboard/listings' },
  });
  return { _id: id, status: back };
}

async function removeProduct(admin, id, { reason, ip } = {}) {
  const product = await MarketplaceProduct.findById(id).select('title seller status').lean();
  if (!product) throw ApiError.notFound('Product not found');
  if (product.status === 'removed') throw ApiError.conflict('This product has already been removed', 'NO_CHANGE');

  await MarketplaceProduct.updateOne({ _id: id }, { $set: { status: 'removed' } });
  await closeReports('product', id, admin);
  await audit.record(admin, 'product.removed', { targetType: 'MarketplaceProduct', targetId: id, before: { status: product.status }, after: { status: 'removed' }, reason, ip });
  await notify(product.seller, {
    type: 'product.removed',
    title: 'Your product was removed',
    body: `An administrator removed "${product.title}" from the marketplace. Reason: ${reason}`,
    data: { deepLink: '/dashboard/products' },
  });
  return { _id: id, status: 'removed' };
}

const REVIEW_ACTION = { visible: 'review.restored', hidden: 'review.hidden', removed: 'review.removed' };

/**
 * Hides, removes or restores a review. The provider's average is recomputed from the visible ones. Reviewing a transaction
 * again stays impossible (BR-04), because the review itself is kept.
 */
async function setReviewStatus(admin, id, { status, reason, ip } = {}) {
  const review = await Review.findById(id).select('reviewer target targetRole status').lean();
  if (!review) throw ApiError.notFound('Review not found');
  if (review.status === status) throw ApiError.conflict(`This review is already ${status}`, 'NO_CHANGE');

  await Review.updateOne({ _id: id }, { $set: { status } });
  await recomputeRating(review.target, review.targetRole);
  if (status !== 'visible') await closeReports('review', id, admin);
  await audit.record(admin, REVIEW_ACTION[status], { targetType: 'Review', targetId: id, before: { status: review.status }, after: { status }, reason, ip });
  if (status !== 'visible') {
    await notify(review.reviewer, {
      type: 'review.hidden',
      title: 'Your review was taken down',
      body: `An administrator ${status === 'hidden' ? 'hid' : 'removed'} your review. Reason: ${reason}`,
      data: { deepLink: '/dashboard/transactions' },
    });
  }
  return { _id: id, status };
}

module.exports = { removeListing, restoreListing, removeProduct, setReviewStatus, closeReports, GENERIC_NOTE };

'use strict';
const Report = require('../models/Report');
const DeviceListing = require('../models/DeviceListing');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const Review = require('../models/Review');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');

const TARGETS = { listing: DeviceListing, product: MarketplaceProduct, review: Review, user: User };
const OWNER_FIELD = { listing: 'owner', product: 'seller', review: 'reviewer', user: '_id' };

async function createReport(reporter, input) {
  const target = await TARGETS[input.targetType].findById(input.targetId).select(OWNER_FIELD[input.targetType]).lean();
  if (!target) throw ApiError.notFound('The item you are reporting no longer exists');
  if (String(target[OWNER_FIELD[input.targetType]]) === String(reporter.id)) {
    throw ApiError.badRequest('You cannot report your own content');
  }
  let report;
  try {
    report = await Report.create({ ...input, reporter: reporter.id });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('You have already reported this item', 'ALREADY_REPORTED');
    throw err;
  }
  if (input.targetType === 'listing') await DeviceListing.updateOne({ _id: input.targetId }, { $inc: { reportCount: 1 } });
  return report;
}

module.exports = { createReport };

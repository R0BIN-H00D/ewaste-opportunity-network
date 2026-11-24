'use strict';
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');
const DeviceListing = require('../models/DeviceListing');
const technicians = require('../services/technicianService');
const matching = require('../services/matching');
const extras = require('../services/matching/extras');
const Category = require('../models/Category');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await technicians.listTechnicians(req.query);
  ok(res, items, 'OK', meta);
});

exports.getOne = asyncHandler(async (req, res) => ok(res, await technicians.getTechnician(req.params.id)));

exports.setAvailability = asyncHandler(async (req, res) => ok(res, await technicians.setAvailability(req.user, req.body.status), 'Availability updated'));

/** Refurbishers, recycling centres or wanted requests that fit one of the caller's own listings, each with a score and reasons. */
exports.listingMatches = asyncHandler(async (req, res) => {
  const { kind } = req.params;
  if (!['refurbishers', 'recyclers', 'wanted'].includes(kind)) throw ApiError.notFound('Not found');
  const listing = await DeviceListing.findById(req.params.id).lean();
  if (!listing || String(listing.owner) !== req.user.id) throw ApiError.notFound('Listing not found');
  const limit = Math.min(Number(req.query.limit) || 10, 20);
  const items = kind === 'refurbishers' ? await extras.refurbishersFor(listing, { limit })
    : kind === 'recyclers' ? await extras.recyclersFor(listing, { limit, hazardous: Boolean((await Category.findById(listing.category).select('hazardous').lean())?.hazardous) })
      : await extras.wantedFor(listing, { limit });
  ok(res, items, 'OK', { total: items.length });
});

/** Ranked technicians for one of the caller's own listings. */
exports.recommendations = asyncHandler(async (req, res) => {
  const listing = await DeviceListing.findById(req.query.listingId).lean();
  if (!listing || String(listing.owner) !== req.user.id) throw ApiError.notFound('Listing not found'); // hides other people's listings
  const items = await matching.recommendTechnicians(listing, { limit: req.query.limit });
  ok(res, items, 'OK', { service: 'repair', total: items.length });
});

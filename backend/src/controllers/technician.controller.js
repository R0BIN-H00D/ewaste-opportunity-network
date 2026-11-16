'use strict';
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');
const DeviceListing = require('../models/DeviceListing');
const technicians = require('../services/technicianService');
const matching = require('../services/matching');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await technicians.listTechnicians(req.query);
  ok(res, items, 'OK', meta);
});

exports.getOne = asyncHandler(async (req, res) => ok(res, await technicians.getTechnician(req.params.id)));

exports.setAvailability = asyncHandler(async (req, res) => ok(res, await technicians.setAvailability(req.user, req.body.status), 'Availability updated'));

/** Ranked technicians for one of the caller's own listings. */
exports.recommendations = asyncHandler(async (req, res) => {
  const listing = await DeviceListing.findById(req.query.listingId).lean();
  if (!listing || String(listing.owner) !== req.user.id) throw ApiError.notFound('Listing not found'); // hides other people's listings
  const items = await matching.recommendTechnicians(listing, { limit: req.query.limit });
  ok(res, items, 'OK', { service: 'repair', total: items.length });
});

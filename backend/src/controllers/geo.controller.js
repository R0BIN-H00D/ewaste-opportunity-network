'use strict';
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');
const geocoder = require('../services/integrations/geocoder');

exports.search = asyncHandler(async (req, res) => ok(res, await geocoder.search(req.query.q)));
exports.reverse = asyncHandler(async (req, res) => {
  const place = await geocoder.reverse(req.query.lat, req.query.lng);
  if (!place) throw ApiError.notFound('Nothing is known about this spot');
  return ok(res, place);
});
'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/reviewService');

exports.create = asyncHandler(async (req, res) => created(res, await svc.createReview(req.user, req.body), 'Thank you for your review'));

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listReviews(req.query);
  ok(res, items, 'OK', meta);
});

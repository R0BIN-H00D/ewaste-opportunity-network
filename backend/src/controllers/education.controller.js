'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const svc = require('../services/educationService');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listPublished(req.query);
  return ok(res, items, 'OK', meta);
});
exports.get = asyncHandler(async (req, res) => ok(res, await svc.getPublished(req.params.slug)));
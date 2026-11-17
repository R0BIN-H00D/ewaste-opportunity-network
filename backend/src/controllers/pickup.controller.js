'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const svc = require('../services/pickupService');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listPickups(req.user, req.query);
  return ok(res, items, 'OK', meta);
});

exports.slots = asyncHandler(async (req, res) => ok(res, await svc.listSlots(req.user)));

exports.confirm = asyncHandler(async (req, res) => ok(res, await svc.confirmPickup(req.user, req.params.id), 'Time confirmed'));

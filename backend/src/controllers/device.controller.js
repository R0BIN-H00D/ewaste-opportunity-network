'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/deviceService');

exports.create = asyncHandler(async (req, res) => created(res, await svc.createListing(req.user, req.body, req.files), 'Listing created'));

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listListings(req.query, req.user);
  ok(res, items, 'OK', meta);
});

exports.getOne = asyncHandler(async (req, res) => ok(res, await svc.getListing(req.params.id, req.user)));

exports.update = asyncHandler(async (req, res) => ok(res, await svc.updateListing(req.params.id, req.user, req.body, req.files), 'Listing updated'));

exports.remove = asyncHandler(async (req, res) => {
  await svc.removeListing(req.params.id, req.user);
  ok(res, null, 'Listing deleted');
});

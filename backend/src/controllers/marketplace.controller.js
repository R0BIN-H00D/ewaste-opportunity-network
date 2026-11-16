'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/marketplaceService');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listProducts(req.user, req.query);
  ok(res, items, 'OK', meta);
});
exports.mine = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listMine(req.user, req.query);
  ok(res, items, 'OK', meta);
});
exports.get = asyncHandler(async (req, res) => ok(res, await svc.getProduct(req.params.id, req.user)));
exports.create = asyncHandler(async (req, res) => created(res, await svc.createProduct(req.user, req.body, req.files || []), 'Product listed'));
exports.update = asyncHandler(async (req, res) => ok(res, await svc.updateProduct(req.params.id, req.user, req.body, req.files || []), 'Product updated'));
exports.remove = asyncHandler(async (req, res) => ok(res, await svc.removeProduct(req.params.id, req.user), 'Product removed'));
exports.enquire = asyncHandler(async (req, res) => created(res, await svc.enquire(req.user, req.params.id, req.body), 'Your question was sent to the seller'));

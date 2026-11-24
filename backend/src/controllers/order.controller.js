'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/orderService');

exports.place = asyncHandler(async (req, res) => created(res, await svc.placeOrder(req.user, req.body), 'Order placed'));
exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listOrders(req.user, req.query);
  ok(res, items, 'OK', meta);
});
exports.get = asyncHandler(async (req, res) => ok(res, await svc.getOrder(req.params.id, req.user)));
exports.status = asyncHandler(async (req, res) => ok(res, await svc.changeStatus(req.params.id, req.user, req.body), 'Order updated'));
exports.startPayment = asyncHandler(async (req, res) => ok(res, await svc.startPayment(req.params.id, req.user), 'Payment started'));
exports.verifyPayment = asyncHandler(async (req, res) => ok(res, await svc.verifyPayment(req.params.id, req.user, req.body), 'Payment received'));
exports.cancel = asyncHandler(async (req, res) => ok(res, await svc.cancelOrder(req.params.id, req.user, req.body), 'Order cancelled'));

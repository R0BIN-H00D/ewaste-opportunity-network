'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const svc = require('../services/transactionService');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listTransactions(req.user, req.query);
  ok(res, items, 'OK', meta);
});

exports.summary = asyncHandler(async (req, res) => ok(res, await svc.summary(req.user)));

exports.confirm = asyncHandler(async (req, res) => ok(res, await svc.confirmPayment(req.user, req.params.id, req.body), 'Payment confirmed'));

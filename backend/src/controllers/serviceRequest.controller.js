'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/serviceRequestService');

exports.create = asyncHandler(async (req, res) => created(res, await svc.createRequest(req.user, req.body), 'Request sent'));

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listRequests(req.user, req.query);
  ok(res, items, 'OK', meta);
});

exports.getOne = asyncHandler(async (req, res) => ok(res, await svc.getRequest(req.params.id, req.user)));

exports.changeStatus = asyncHandler(async (req, res) => ok(res, await svc.changeStatus(req.params.id, req.user, req.body, req.files), 'Status updated'));

exports.submitQuotation = asyncHandler(async (req, res) => created(res, await svc.submitQuotation(req.params.id, req.user, req.body), 'Quotation sent'));

exports.listQuotations = asyncHandler(async (req, res) => ok(res, await svc.listQuotations(req.params.id, req.user)));

exports.decideQuotation = asyncHandler(async (req, res) =>
  ok(res, await svc.decideQuotation(req.params.id, req.params.qid, req.user, req.body), req.body.decision === 'accept' ? 'Quotation approved' : 'Quotation declined'));

exports.addProgress = asyncHandler(async (req, res) => ok(res, await svc.addProgress(req.params.id, req.user, req.body, req.files), 'Update added'));

exports.schedulePickup = asyncHandler(async (req, res) => ok(res, await svc.schedulePickup(req.params.id, req.user, req.body), 'Pickup saved'));

exports.confirmHandover = asyncHandler(async (req, res) => ok(res, await svc.confirmHandover(req.params.id, req.user, req.body), 'Handover confirmed'));

exports.confirmCompletion = asyncHandler(async (req, res) => ok(res, await svc.confirmCompletion(req.params.id, req.user), 'Service completed'));

exports.startPayment = asyncHandler(async (req, res) => ok(res, await svc.startPayment(req.params.id, req.user), 'Payment started'));

exports.verifyPayment = asyncHandler(async (req, res) => ok(res, await svc.verifyPayment(req.params.id, req.user, req.body), 'Payment received'));

exports.cancel = asyncHandler(async (req, res) => ok(res, await svc.cancelRequest(req.params.id, req.user, req.body.reason), 'Request cancelled'));

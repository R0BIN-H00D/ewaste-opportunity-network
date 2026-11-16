'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/refurbishmentService');

exports.opportunities = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listOpportunities(req.user, req.query);
  ok(res, items, 'OK', meta);
});
exports.makeOffer = asyncHandler(async (req, res) => created(res, await svc.makeOffer(req.user, req.body), 'Offer sent'));

exports.listJobs = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listJobs(req.user, req.query);
  ok(res, items, 'OK', meta);
});
exports.getJob = asyncHandler(async (req, res) => ok(res, await svc.getJob(req.params.id, req.user)));

exports.decide = asyncHandler(async (req, res) => ok(res, await svc.decideOffer(req.params.id, req.user, req.body), 'Decision saved'));
exports.withdraw = asyncHandler(async (req, res) => ok(res, await svc.withdrawOffer(req.params.id, req.user), 'Offer withdrawn'));

exports.scheduleHandover = asyncHandler(async (req, res) => ok(res, await svc.scheduleHandover(req.params.id, req.user, req.body), 'Collection scheduled'));
exports.confirmHandover = asyncHandler(async (req, res) => ok(res, await svc.confirmHandover(req.params.id, req.user, req.body), 'Handover confirmed'));

exports.advance = asyncHandler(async (req, res) => ok(res, await svc.advance(req.params.id, req.user, req.body), 'Job updated'));
exports.addPhotos = asyncHandler(async (req, res) => ok(res, await svc.addPhotos(req.params.id, req.user, req.body, req.files || []), 'Photos added'));
exports.cancel = asyncHandler(async (req, res) => ok(res, await svc.cancelJob(req.params.id, req.user, req.body), 'Job cancelled'));

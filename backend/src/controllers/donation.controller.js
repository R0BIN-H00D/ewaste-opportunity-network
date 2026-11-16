'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/donationService');

exports.recipientStatus = asyncHandler(async (req, res) => ok(res, await svc.recipientStatus(req.user.id)));
exports.applyAsRecipient = asyncHandler(async (req, res) => ok(res, await svc.applyAsRecipient(req.user, req.body), 'Your organisation was sent for verification'));

exports.create = asyncHandler(async (req, res) => created(res, await svc.createDonation(req.user, req.body), 'Donation offered'));
exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listDonations(req.user, req.query);
  ok(res, items, 'OK', meta);
});
exports.getOne = asyncHandler(async (req, res) => ok(res, await svc.getDonation(req.params.id, req.user)));

exports.request = asyncHandler(async (req, res) => created(res, await svc.requestDonation(req.params.id, req.user, req.body), 'Request sent'));
exports.withdraw = asyncHandler(async (req, res) => ok(res, await svc.withdrawRequest(req.params.id, req.user), 'Request withdrawn'));
exports.decide = asyncHandler(async (req, res) => ok(res, await svc.decideRequest(req.params.id, req.params.rid, req.user, req.body), 'Decision saved'));

exports.scheduleHandover = asyncHandler(async (req, res) => ok(res, await svc.scheduleHandover(req.params.id, req.user, req.body), 'Handover scheduled'));
exports.confirmHandover = asyncHandler(async (req, res) => ok(res, await svc.confirmHandover(req.params.id, req.user, req.body), 'Handover confirmed'));
exports.cancel = asyncHandler(async (req, res) => ok(res, await svc.cancelDonation(req.params.id, req.user, req.body.reason), 'Donation cancelled'));
exports.setStatus = asyncHandler(async (req, res) => ok(res, await svc.cancelDonation(req.params.id, req.user, req.body.reason), 'Donation cancelled'));
exports.confirmation = asyncHandler(async (req, res) => ok(res, await svc.getConfirmation(req.params.id, req.user)));

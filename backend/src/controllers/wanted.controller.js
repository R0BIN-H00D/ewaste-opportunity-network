'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/wantedService');

exports.create = asyncHandler(async (req, res) => created(res, await svc.create(req.user, req.body), 'Request added'));
exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.list(req.user, req.query);
  ok(res, items, 'OK', meta);
});
exports.getOne = asyncHandler(async (req, res) => ok(res, await svc.getOne(req.params.id, req.user)));
exports.update = asyncHandler(async (req, res) => ok(res, await svc.update(req.params.id, req.user, req.body), 'Request updated'));
exports.setStatus = asyncHandler(async (req, res) => ok(res, await svc.setStatus(req.params.id, req.user, req.body), 'Request updated'));
exports.remove = asyncHandler(async (req, res) => {
  await svc.remove(req.params.id, req.user);
  ok(res, null, 'Request deleted');
});
exports.respond = asyncHandler(async (req, res) => created(res, await svc.respond(req.params.id, req.user, req.body), 'Accepted'));
exports.responses = asyncHandler(async (req, res) => ok(res, await svc.listResponses(req.params.id, req.user)));

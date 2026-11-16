'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/verificationService');

exports.status = asyncHandler(async (req, res) => ok(res, await svc.getStatus(req.user)));

exports.submit = asyncHandler(async (req, res) => {
  created(res, await svc.submit(req.user, req.body.docType, req.files), 'Documents submitted for review');
});

exports.remove = asyncHandler(async (req, res) => {
  await svc.remove(req.user, req.params.id);
  ok(res, null, 'Document deleted');
});

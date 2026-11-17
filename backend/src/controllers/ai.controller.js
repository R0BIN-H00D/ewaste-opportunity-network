'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const svc = require('../services/classifierService');

exports.classify = asyncHandler(async (req, res) => {
  const file = req.files?.[0];
  const photo = file ? { buffer: file.buffer, mime: file.sniffedMime } : undefined;
  return ok(res, await svc.classify({ title: req.body.title, description: req.body.description, photo }), 'OK');
});
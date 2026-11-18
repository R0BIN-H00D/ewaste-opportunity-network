'use strict';
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');
const svc = require('../services/impactService');

// The same figures for everyone, so shared caches may keep them for a minute.
const publicCache = (res) => res.set('Cache-Control', 'public, max-age=60');

exports.platformImpact = asyncHandler(async (_req, res) => {
  publicCache(res);
  ok(res, await svc.platformImpact());
});

exports.monthly = asyncHandler(async (req, res) => {
  const wantsMine = req.query.scope === 'me';
  if (wantsMine && !req.user) throw ApiError.unauthorized();
  if (!wantsMine) publicCache(res);
  ok(res, await svc.monthly({ userId: wantsMine ? req.user.id : undefined, months: req.query.months }));
});

exports.yearly = asyncHandler(async (req, res) => {
  const wantsMine = req.query.scope === 'me';
  if (wantsMine && !req.user) throw ApiError.unauthorized();
  if (!wantsMine) publicCache(res);
  ok(res, await svc.yearly({ userId: wantsMine ? req.user.id : undefined, years: req.query.years }));
});

exports.byCategory = asyncHandler(async (req, res) => {
  const wantsMine = req.query.scope === 'me';
  if (wantsMine && !req.user) throw ApiError.unauthorized();
  if (!wantsMine) publicCache(res);
  ok(res, await svc.byCategory({ userId: wantsMine ? req.user.id : undefined }));
});

exports.userImpact = asyncHandler(async (req, res) => ok(res, await svc.userImpact(req.user)));

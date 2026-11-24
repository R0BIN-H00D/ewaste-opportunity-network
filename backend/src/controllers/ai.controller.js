'use strict';
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { ok } = require('../utils/response');
const ai = require('../services/aiService');

/** Tells the apps whether photo reading is on, so they can say so before someone presses the button. */
exports.status = asyncHandler(async (_req, res) => ok(res, { photoAi: ai.isEnabled() }));

exports.analyze = asyncHandler(async (req, res) => {
  const text = req.body.text || '';
  if ((req.files || []).length === 0 && !text.trim()) throw ApiError.validation([{ field: 'photos', message: 'Add a photo or describe the device' }]);
  ok(res, await ai.analyzeDevice({ files: req.files || [], text }), 'OK');
});

exports.advice = asyncHandler(async (req, res) => ok(res, await ai.advise(req.user, req.body), 'OK'));

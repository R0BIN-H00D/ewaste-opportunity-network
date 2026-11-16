'use strict';
const Category = require('../models/Category');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');

exports.list = asyncHandler(async (_req, res) => {
  const items = await Category.find({ active: true }).sort({ order: 1, name: 1 }).select('name slug icon hazardous group').lean();
  res.set('Cache-Control', 'public, max-age=300');
  ok(res, items);
});

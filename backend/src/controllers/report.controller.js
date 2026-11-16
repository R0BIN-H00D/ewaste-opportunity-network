'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { created } = require('../utils/response');
const { createReport } = require('../services/reportService');

exports.create = asyncHandler(async (req, res) => {
  const report = await createReport(req.user, req.body);
  created(res, { _id: report._id, status: report.status }, 'Report submitted. Thank you.');
});

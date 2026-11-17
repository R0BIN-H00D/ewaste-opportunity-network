'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/learningService');

const page = (res, { items, meta }) => ok(res, items, 'OK', meta);

exports.listOpportunities = asyncHandler(async (req, res) => page(res, await svc.listOpportunities(req.user, req.query)));
exports.myOpportunities = asyncHandler(async (req, res) => page(res, await svc.myOpportunities(req.user, req.query)));
exports.getOpportunity = asyncHandler(async (req, res) => ok(res, await svc.getOpportunity(req.params.id, req.user)));
exports.createOpportunity = asyncHandler(async (req, res) => created(res, await svc.createOpportunity(req.user, req.body), 'Opportunity posted'));
exports.updateOpportunity = asyncHandler(async (req, res) => ok(res, await svc.updateOpportunity(req.params.id, req.user, req.body), 'Opportunity updated'));
exports.setOpportunityStatus = asyncHandler(async (req, res) => ok(res, await svc.setOpportunityStatus(req.params.id, req.user, req.body.status), 'Opportunity updated'));
exports.listApplicants = asyncHandler(async (req, res) => page(res, await svc.listApplicants(req.params.id, req.user, req.query)));

exports.apply = asyncHandler(async (req, res) => created(res, await svc.apply(req.user, req.body), 'Application sent'));
exports.listMine = asyncHandler(async (req, res) => page(res, await svc.listMine(req.user, req.query)));
exports.getApplication = asyncHandler(async (req, res) => ok(res, await svc.getApplication(req.params.id, req.user)));
exports.decide = asyncHandler(async (req, res) => ok(res, await svc.decide(req.params.id, req.user, req.body), 'Application updated'));
exports.start = asyncHandler(async (req, res) => ok(res, await svc.start(req.params.id, req.user), 'Task started'));
exports.complete = asyncHandler(async (req, res) => ok(res, await svc.complete(req.params.id, req.user, req.body), 'Task completed'));
exports.withdraw = asyncHandler(async (req, res) => ok(res, await svc.withdraw(req.params.id, req.user, req.body), 'Application withdrawn'));

exports.experience = asyncHandler(async (req, res) => ok(res, await svc.experience(req.user)));
exports.certificates = asyncHandler(async (req, res) => ok(res, await svc.listCertificates(req.user)));

exports.verifyCertificate = asyncHandler(async (req, res) => ok(res, await svc.verifyCertificate(req.params.certNo)));
exports.certificatePdf = asyncHandler(async (req, res) => {
  const { filename, buffer } = await svc.certificateFile(req.user, req.params.id);
  res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': buffer.length, 'Cache-Control': 'private, no-store' });
  res.send(buffer);
});

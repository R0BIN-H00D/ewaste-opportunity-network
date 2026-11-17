'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const centers = require('../services/recyclingCenterService');
const svc = require('../services/recyclingService');

exports.listCenters = asyncHandler(async (req, res) => {
  const { items, meta } = await centers.listCenters(req.query);
  ok(res, items, 'OK', meta);
});
exports.compareCenters = asyncHandler(async (req, res) => ok(res, await centers.compareCenters(req.query)));
exports.getCenter = asyncHandler(async (req, res) => ok(res, await centers.getCenter(req.params.id)));

exports.create = asyncHandler(async (req, res) => created(res, await svc.createRequest(req.user, req.body, req.files || []), 'Recycling request sent'));
exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listRequests(req.user, req.query);
  ok(res, items, 'OK', meta);
});
exports.get = asyncHandler(async (req, res) => ok(res, await svc.getRequest(req.params.id, req.user)));
exports.setStatus = asyncHandler(async (req, res) => ok(res, await svc.setStatus(req.params.id, req.user, req.body), 'Request updated'));
exports.schedulePickup = asyncHandler(async (req, res) => ok(res, await svc.schedulePickup(req.params.id, req.user, req.body), 'Pickup scheduled'));
exports.confirmHandover = asyncHandler(async (req, res) => ok(res, await svc.confirmHandover(req.params.id, req.user, req.body), 'Handover confirmed'));
exports.materials = asyncHandler(async (req, res) => ok(res, await svc.recordMaterials(req.params.id, req.user, req.body), 'Materials saved'));
exports.cancel = asyncHandler(async (req, res) => ok(res, await svc.cancelRequest(req.params.id, req.user, req.body), 'Request cancelled'));

exports.report = asyncHandler(async (req, res) => {
  const rep = await svc.report(req.user, req.query);
  if (req.query.format === 'csv') {
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="recycling-report.csv"');
    return res.send(svc.reportCsv(rep));
  }
  return ok(res, rep);
});

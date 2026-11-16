'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const complaints = require('../services/complaintService');
const announcements = require('../services/announcementService');

exports.create = asyncHandler(async (req, res) => created(res, await complaints.create(req.user, req.body), 'Complaint filed. We will keep you posted.'));
exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await complaints.listMine(req.user, req.query);
  return ok(res, items, 'OK', meta);
});
exports.get = asyncHandler(async (req, res) => ok(res, await complaints.getMine(req.user, req.params.id)));

// Announcements for the banner (public; a signed-in person also sees the ones for their role)
exports.announcements = asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-cache');
  return ok(res, await announcements.publicFeed(req.user));
});

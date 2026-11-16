'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const svc = require('../services/notificationService');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listMine(req.user, req.query);
  ok(res, items, 'OK', meta);
});

exports.unreadCount = asyncHandler(async (req, res) => ok(res, await svc.unreadCount(req.user)));

exports.markRead = asyncHandler(async (req, res) => ok(res, await svc.markRead(req.user, req.params.id), 'Marked as read'));

exports.markAllRead = asyncHandler(async (req, res) => ok(res, await svc.markAllRead(req.user), 'All marked as read'));

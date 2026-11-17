'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const svc = require('../services/chatService');

exports.open = asyncHandler(async (req, res) => ok(res, await svc.open(req.user, req.body)));

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listMine(req.user, req.query);
  ok(res, items, 'OK', meta);
});

exports.getOne = asyncHandler(async (req, res) => ok(res, await svc.getOne(req.user, req.params.id)));

exports.unreadCount = asyncHandler(async (req, res) => ok(res, await svc.unreadTotal(req.user)));

exports.messages = asyncHandler(async (req, res) => {
  const { items, meta } = await svc.listMessages(req.user, req.params.id, req.query);
  ok(res, items, 'OK', meta);
});

exports.send = asyncHandler(async (req, res) => created(res, await svc.send(req.user, req.params.id, req.body), 'Sent'));

exports.markRead = asyncHandler(async (req, res) => ok(res, await svc.markRead(req.user, req.params.id), 'Marked as read'));

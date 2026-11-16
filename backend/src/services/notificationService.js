'use strict';
// In-app notifications (design.md A.10). Push and email channels are added in Phase 8; callers do not change.
// Creating a notification must never fail the request that caused it.
const Notification = require('../models/Notification');
const logger = require('../utils/logger');

async function notify(userIds, { type, title, body, data = {} }) {
  // Callers may pass plain ids or populated documents; a populated document must never be stringified (it would not be an id).
  const idOf = (v) => String(v && v._id ? v._id : v);
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(idOf))];
  if (ids.length === 0) return;
  try {
    await Notification.insertMany(ids.map((user) => ({ user, type, title, body, data })));
  } catch (err) {
    logger.warn({ err: err.message, type }, 'notification not saved');
  }
}

module.exports = { notify };

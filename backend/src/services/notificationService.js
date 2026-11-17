'use strict';
// In-app notifications (design.md A.10). Push and email channels are added in Phase 8; callers do not change.
// Creating a notification must never fail the request that caused it.
const Notification = require('../models/Notification');
const logger = require('../utils/logger');
const { emitToUser } = require('../sockets/emitter');

async function notify(userIds, { type, title, body, data = {} }) {
  // Callers may pass plain ids or populated documents; a populated document must never be stringified (it would not be an id).
  const idOf = (v) => String(v && v._id ? v._id : v);
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(idOf))];
  if (ids.length === 0) return;
  try {
    const saved = await Notification.insertMany(ids.map((user) => ({ user, type, title, body, data })));
    await pushLive(saved); // a hiccup in live delivery must not look like a failed save
  } catch (err) {
    logger.warn({ err: err.message, type }, 'notification not saved');
  }
}

/** Tells each person's open apps about their new notification, with the unread total for the badge. No-op if nobody is connected. */
async function pushLive(docs) {
  for (const doc of docs) {
    try {
      const unread = await Notification.countDocuments({ user: doc.user, readAt: null });
      emitToUser(doc.user, 'notification:new', { notification: view(doc.toObject()), unread });
    } catch (err) {
      logger.warn({ err: err.message }, 'notification not pushed live');
    }
  }
}

/* ---------- the person's own notification centre (P8-05, in-app part) ---------- */
const { parsePagination, buildMeta } = require('../utils/pagination');
const ApiError = require('../utils/ApiError');

const view = (n) => ({ _id: n._id, type: n.type, title: n.title, body: n.body, data: n.data || {}, readAt: n.readAt || null, createdAt: n.createdAt });

/** Newest first. `unread=true` lists only unread ones. Meta carries the unread count for a badge. */
async function listMine(user, query = {}) {
  const pg = parsePagination(query, { defaultLimit: 20, maxLimit: 50 });
  const filter = { user: user.id, ...(query.unread === 'true' ? { readAt: null } : {}) };
  const [rows, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1, _id: -1 }).skip(pg.skip).limit(pg.limit).lean(),
    Notification.countDocuments(filter),
    Notification.countDocuments({ user: user.id, readAt: null }),
  ]);
  return { items: rows.map(view), meta: { ...buildMeta(pg, total), unread } };
}

const unreadCount = async (user) => ({ unread: await Notification.countDocuments({ user: user.id, readAt: null }) });

/** Marks one of the person's notifications read. Someone else's id is "not found", never "forbidden". */
async function markRead(user, id) {
  const n = await Notification.findOneAndUpdate({ _id: id, user: user.id }, [{ $set: { readAt: { $ifNull: ['$readAt', '$$NOW'] } } }], { new: true }).lean();
  if (!n) throw ApiError.notFound('Notification not found');
  return view(n);
}

async function markAllRead(user) {
  const res = await Notification.updateMany({ user: user.id, readAt: null }, { $set: { readAt: new Date() } });
  return { updated: res.modifiedCount, unread: 0 };
}

module.exports = { notify, listMine, unreadCount, markRead, markAllRead };

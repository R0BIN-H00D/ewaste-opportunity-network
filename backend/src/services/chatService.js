'use strict';
// One-to-one chat between the two people on a shared record (design.md A.9). Messages are plain text for now;
// photos wait for the Cloudinary work in P8-02. Every read and write checks that the caller is one of the two people.
const { isValidObjectId } = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { ACCOUNT_STATUS } = require('../config/constants');
const { partiesFor } = require('./chatContext');
const { emitToUser } = require('../sockets/emitter');

const MAX_TEXT = 2000;

/** Mongoose gives a Map from a document and a plain object from lean(); read either. */
const unreadOf = (conversation, userId) => {
  const u = conversation.unread;
  if (!u) return 0;
  return Number((u instanceof Map ? u.get(String(userId)) : u[String(userId)]) || 0);
};

const otherId = (conversation, userId) => conversation.participants.map((p) => String(p._id || p)).find((p) => p !== String(userId));

function conversationView(c, userId) {
  const other = c.participants.find((p) => String(p._id || p) !== String(userId));
  const last = c.lastMessage && c.lastMessage.at ? c.lastMessage : null;
  return {
    _id: c._id,
    contextType: c.contextType,
    contextId: c.contextId,
    other: other && other._id ? { _id: other._id, name: other.name, role: other.role } : { _id: other },
    lastMessage: last ? { text: last.text || '', at: last.at, mine: String(last.sender) === String(userId) } : null,
    unread: unreadOf(c, userId),
    updatedAt: c.updatedAt,
  };
}

function messageView(m, senderId) {
  const readByOther = (m.readBy || []).some((r) => String(r.user) !== String(senderId));
  return { _id: m._id, conversation: m.conversation, sender: m.sender, text: m.text || '', createdAt: m.createdAt, read: readByOther };
}

/** The conversation, if the caller is in it. A stranger and a missing id both get "not found". */
async function loadMine(user, id) {
  if (!isValidObjectId(id)) throw ApiError.notFound('Conversation not found');
  const c = await Conversation.findOne({ _id: id, participants: user.id }).populate('participants', 'name role status');
  if (!c) throw ApiError.notFound('Conversation not found');
  return c;
}

/** Finds the thread for a shared record, or starts it. Either of the two people may open it. */
async function open(user, { contextType, contextId }) {
  const ids = await partiesFor(contextType, contextId, user.id);
  if (!ids) throw ApiError.notFound('There is nobody to message here');
  const key = [...ids].sort().join(':');
  let c = await Conversation.findOne({ contextType, contextId, participantsKey: key });
  if (!c) {
    try {
      c = await Conversation.create({ participants: ids, participantsKey: key, contextType, contextId });
    } catch (err) {
      if (err.code !== 11000) throw err; // both people opened it at once: use the one that won
      c = await Conversation.findOne({ contextType, contextId, participantsKey: key });
    }
  }
  await c.populate('participants', 'name role status');
  return conversationView(c, user.id);
}

/** One conversation, if the caller is in it: who it is with and what it is about. */
async function getOne(user, id) {
  return conversationView(await loadMine(user, id), user.id);
}

/** My conversations, most recently active first. Meta carries how many messages are waiting in total. */
async function listMine(user, query = {}) {
  const pg = parsePagination(query, { defaultLimit: 20, maxLimit: 50 });
  const filter = { participants: user.id };
  const [rows, total, all] = await Promise.all([
    Conversation.find(filter).sort({ updatedAt: -1, _id: -1 }).skip(pg.skip).limit(pg.limit).populate('participants', 'name role').lean(),
    Conversation.countDocuments(filter),
    Conversation.find(filter).select('unread').lean(),
  ]);
  const unread = all.reduce((sum, c) => sum + unreadOf(c, user.id), 0);
  return { items: rows.map((c) => conversationView(c, user.id)), meta: { ...buildMeta(pg, total), unread } };
}

async function unreadTotal(user) {
  const all = await Conversation.find({ participants: user.id }).select('unread').lean();
  return { unread: all.reduce((sum, c) => sum + unreadOf(c, user.id), 0) };
}

/** Oldest first within a page. `before` is the id of the oldest message already shown; pass it to go further back. */
async function listMessages(user, id, query = {}) {
  const c = await loadMine(user, id);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 30, 1), 100);
  const filter = { conversation: c._id, ...(query.before ? { _id: { $lt: query.before } } : {}) };
  const rows = await Message.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit).reverse();
  return { items: page.map((m) => messageView(m, m.sender)), meta: { hasMore, nextBefore: hasMore ? String(page[0]._id) : null } };
}

/** Saves a message, bumps the other person's unread count and tells both people's devices in real time. */
async function send(user, id, { text }) {
  const body = String(text || '').trim();
  if (!body) throw ApiError.badRequest('Write a message first');
  if (body.length > MAX_TEXT) throw ApiError.badRequest(`A message can be at most ${MAX_TEXT} characters`);

  const c = await loadMine(user, id);
  const other = c.participants.find((p) => String(p._id) !== String(user.id));
  if (!other || [ACCOUNT_STATUS.SUSPENDED, ACCOUNT_STATUS.DELETED].includes(other.status)) {
    throw ApiError.conflict('This person can no longer receive messages', 'RECIPIENT_UNAVAILABLE');
  }

  const message = await Message.create({ conversation: c._id, sender: user.id, text: body, readBy: [{ user: user.id }] });
  const updated = await Conversation.findByIdAndUpdate(
    c._id,
    { $set: { lastMessage: { text: body.slice(0, 200), at: message.createdAt, sender: user.id } }, $inc: { [`unread.${other._id}`]: 1 } },
    { new: true },
  ).populate('participants', 'name role');

  const view = messageView(message.toObject(), user.id);
  // Both people get the message and their own view of the conversation (who the other person is, how many are unread).
  emitToUser(other._id, 'message:new', { message: view, conversation: conversationView(updated, other._id) });
  emitToUser(user.id, 'message:new', { message: view, conversation: conversationView(updated, user.id) });
  return view;
}

/** The caller has read everything in the thread: clear their unread count and mark the other person's messages read. */
async function markRead(user, id) {
  const c = await loadMine(user, id);
  const now = new Date();
  await Message.updateMany(
    { conversation: c._id, sender: { $ne: user.id }, 'readBy.user': { $ne: user.id } },
    { $push: { readBy: { user: user.id, at: now } } },
  );
  await Conversation.updateOne({ _id: c._id }, { $set: { [`unread.${user.id}`]: 0 } });
  const event = { conversationId: String(c._id), by: user.id, at: now };
  emitToUser(otherId(c, user.id), 'message:read', event);
  emitToUser(user.id, 'message:read', event);
  return { unread: 0 };
}

/** Lets a socket find out who to tell about typing, without loading the thread. Null if the caller is not in it. */
async function otherParticipant(userId, id) {
  if (!isValidObjectId(id)) return null;
  const c = await Conversation.findOne({ _id: id, participants: userId }).select('participants').lean();
  return c ? otherId(c, userId) : null;
}

module.exports = { open, getOne, listMine, unreadTotal, listMessages, send, markRead, otherParticipant, MAX_TEXT };

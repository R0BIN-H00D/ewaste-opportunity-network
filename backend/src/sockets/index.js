'use strict';
// Real-time channel (P8-03). Sign-in happens in the handshake with the same access token the API uses; each person's
// devices join one private room, and everything pushed to a person goes to that room. Anything a client can do here it
// can also do over REST, so a failed socket never blocks chat.
const { Server } = require('socket.io');
const { z } = require('zod');
const env = require('../config/env');
const logger = require('../utils/logger');
const { userFromToken } = require('../middleware/auth');
const chat = require('../services/chatService');
const { setIo, emitToUser } = require('./emitter');

const objectId = z.string().regex(/^[a-f\d]{24}$/i);
const sendPayload = z.object({ conversationId: objectId, text: z.string() });
const idPayload = z.object({ conversationId: objectId });
const typingPayload = z.object({ conversationId: objectId, typing: z.boolean() });

/** At most `limit` events per `windowMs` per connection; an over-eager client is told once and then ignored. */
function makeBucket(limit = 30, windowMs = 10_000) {
  let count = 0;
  let start = Date.now();
  return () => {
    const now = Date.now();
    if (now - start > windowMs) {
      start = now;
      count = 0;
    }
    count += 1;
    return count <= limit;
  };
}

const failure = (err) => ({ ok: false, message: err.isOperational ? err.message : 'Something went wrong', code: err.code || 'ERROR' });

function attach(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => (!origin || env.corsOrigins.includes(origin) ? cb(null, true) : cb(new Error('Origin not allowed'))),
      credentials: true,
    },
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('UNAUTHORIZED'));
      socket.data.user = await userFromToken(token);
      return next();
    } catch {
      return next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(`user:${user.id}`);
    const allowed = makeBucket();

    // Wraps a handler: validates the payload, applies the rate limit, and always answers the ack (never throws).
    const on = (event, schema, handler) =>
      socket.on(event, async (raw, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        if (!allowed()) return reply({ ok: false, message: 'Slow down', code: 'RATE_LIMITED' });
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return reply({ ok: false, message: 'Invalid request', code: 'VALIDATION_ERROR' });
        try {
          return reply({ ok: true, data: await handler(parsed.data) });
        } catch (err) {
          if (!err.isOperational) logger.error({ err: err.message, event }, 'socket handler failed');
          return reply(failure(err));
        }
      });

    on('message:send', sendPayload, ({ conversationId, text }) => chat.send(user, conversationId, { text }));
    on('message:read', idPayload, ({ conversationId }) => chat.markRead(user, conversationId));
    on('typing', typingPayload, async ({ conversationId, typing }) => {
      const other = await chat.otherParticipant(user.id, conversationId);
      if (other) emitToUser(other, 'typing', { conversationId, userId: user.id, typing });
      return null;
    });
  });

  setIo(io);
  return io;
}

module.exports = { attach };

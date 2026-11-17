'use strict';
// One-to-one chat (P8-03). The same actions are available over Socket.IO; these routes are the always-working fallback.
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const v = require('../validators/chat.validators');
const ctrl = require('../controllers/chat.controller');
const env = require('../config/env');

router.use(authenticate);

// A person sending messages faster than a human types is a script. Counted per signed-in person, not per address.
const sendLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: env.isTest ? 1000 : 40,
  keyGenerator: (req) => req.user.id,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'You are sending messages too fast. Wait a moment.', code: 'RATE_LIMITED' }),
});

router.get('/conversations', validate({ query: v.listQuery }), ctrl.list);
router.post('/conversations', validate({ body: v.openBody }), ctrl.open);
router.get('/unread-count', ctrl.unreadCount);
router.get('/conversations/:id', validObjectIdParam(), ctrl.getOne);
router.get('/conversations/:id/messages', validObjectIdParam(), validate({ query: v.messagesQuery }), ctrl.messages);
router.post('/conversations/:id/messages', validObjectIdParam(), sendLimiter, validate({ body: v.sendBody }), ctrl.send);
router.put('/conversations/:id/read', validObjectIdParam(), ctrl.markRead);

module.exports = router;

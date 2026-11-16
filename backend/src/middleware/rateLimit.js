'use strict';
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({ success: false, message: 'Too many requests, please try again later.', code: 'RATE_LIMITED' }),
};

const globalLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX });
const authLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.AUTH_RATE_LIMIT_MAX });

const uploadLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: 60 });

// The public contact form: a handful of messages per window per IP is plenty.
const contactLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.CONTACT_RATE_LIMIT_MAX });

// Admin tools are powerful, so they get their own, tighter ceiling on top of the global one.
const adminLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: 300 });

module.exports = { globalLimiter, authLimiter, uploadLimiter, contactLimiter, adminLimiter };

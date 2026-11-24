'use strict';
const rateLimit = require('express-rate-limit');
const env = require('../config/env');

/** "Please wait about 5 minutes" from the moment the caller's allowance returns. */
function waitWords(req) {
  const resetAt = req.rateLimit?.resetTime;
  const seconds = Math.max(1, Math.ceil(((resetAt ? resetAt.getTime() : Date.now() + 60000) - Date.now()) / 1000));
  const minutes = Math.ceil(seconds / 60);
  return { seconds, text: seconds <= 60 ? 'about a minute' : `about ${minutes} minutes` };
}

const base = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    const wait = waitWords(req);
    res.status(429).json({ success: false, message: `Too many requests. Please wait ${wait.text} and try again.`, code: 'RATE_LIMITED', retryAfterSeconds: wait.seconds });
  },
};

// Cheap background checks (the apps ask for the unread counts every few seconds, and monitors ask for the health) should never
// use up the allowance that real actions need.
const quiet = (req) => req.method === 'OPTIONS' || /\/(unread-count|health)$/.test(req.path);

const globalLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.RATE_LIMIT_MAX, skip: quiet });
const authLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.AUTH_RATE_LIMIT_MAX });
// Signing in counts only the attempts that fail, so a person who logs in and out is never locked out, while guessing passwords
// still runs into the limit.
const loginLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.AUTH_RATE_LIMIT_MAX, skipSuccessfulRequests: true });

const aiLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.AI_RATE_LIMIT_MAX });
const uploadLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.UPLOAD_RATE_LIMIT_MAX });

// The public contact form: a handful of messages per window per IP is plenty.
const contactLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: env.CONTACT_RATE_LIMIT_MAX });

// Admin tools are powerful, so they get their own, tighter ceiling on top of the global one.
const adminLimiter = rateLimit({ ...base, windowMs: env.RATE_LIMIT_WINDOW_MS, limit: 300 });

module.exports = { aiLimiter, globalLimiter, authLimiter, loginLimiter, uploadLimiter, contactLimiter, adminLimiter };

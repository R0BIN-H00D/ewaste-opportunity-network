'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { ROLES } = require('../config/constants');
const env = require('../config/env');
const { classifyBody } = require('../validators/ai.validators');
const ctrl = require('../controllers/ai.controller');

// A suggestion may cost a call against the free Gemini allowance, so each person gets a modest ceiling of their own.
const classifyLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.isTest ? 100000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many suggestions just now. Please choose the category yourself or try again later.', code: 'RATE_LIMITED' }),
});

// Whoever can list a device can ask what it is.
router.post('/classify', authenticate, authorize(ROLES.USER, ROLES.TECHNICIAN, ROLES.REFURBISHER), classifyLimiter, uploadLimiter, ...imageUpload('photo', 1), validate({ body: classifyBody }), ctrl.classify);

module.exports = router;
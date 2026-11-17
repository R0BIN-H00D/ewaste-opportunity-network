'use strict';
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ROLES } = require('../config/constants');
const env = require('../config/env');
const v = require('../validators/geo.validators');
const ctrl = require('../controllers/geo.controller');

// The free address service has a strict usage policy, so only signed-in people can use it, each within a modest limit of their own.
const geoLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  limit: env.isTest ? 100000 : 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (_req, res) => res.status(429).json({ success: false, message: 'Too many address searches just now. Please wait a moment or type the address yourself.', code: 'RATE_LIMITED' }),
});

const people = authorize(ROLES.USER, ROLES.TECHNICIAN, ROLES.STUDENT, ROLES.REFURBISHER, ROLES.RECYCLER);
router.get('/search', authenticate, people, geoLimiter, validate({ query: v.searchQuery }), ctrl.search);
router.get('/reverse', authenticate, people, geoLimiter, validate({ query: v.reverseQuery }), ctrl.reverse);

module.exports = router;
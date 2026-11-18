'use strict';
// Environmental impact (P9). The platform figures are public; a person's own impact needs a sign-in. (Administrator analytics live under /api/admin/analytics.)
const router = require('express').Router();
const { authenticate, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators/analytics.validators');
const ctrl = require('../controllers/analytics.controller');

router.get('/platform-impact', ctrl.platformImpact);
router.get('/monthly', optionalAuth, validate({ query: v.monthlyQuery }), ctrl.monthly);
router.get('/yearly', optionalAuth, validate({ query: v.yearlyQuery }), ctrl.yearly);
router.get('/by-category', optionalAuth, validate({ query: v.categoryQuery }), ctrl.byCategory);
router.get('/user-impact', authenticate, ctrl.userImpact);

module.exports = router;

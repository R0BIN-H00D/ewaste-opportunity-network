'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators/technician.validators');
const ctrl = require('../controllers/technician.controller');

router.get('/recommendations', authenticate, validate({ query: v.recommendationQuery }), ctrl.recommendations);

module.exports = router;

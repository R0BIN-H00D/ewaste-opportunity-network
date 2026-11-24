'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators/technician.validators');
const { validObjectIdParam } = require('../middleware/guards');
const ctrl = require('../controllers/technician.controller');

router.get('/recommendations', authenticate, validate({ query: v.recommendationQuery }), ctrl.recommendations);

router.get('/listing/:id/:kind', validObjectIdParam(), authenticate, ctrl.listingMatches);

module.exports = router;

'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const v = require('../validators/review.validators');
const ctrl = require('../controllers/review.controller');

// Reviews of a provider are public. Writing one needs a completed transaction (checked in the service, BR-04).
router.get('/', validate({ query: v.listQuery }), ctrl.list);
router.post('/', authenticate, validate({ body: v.createBody }), ctrl.create);

module.exports = router;

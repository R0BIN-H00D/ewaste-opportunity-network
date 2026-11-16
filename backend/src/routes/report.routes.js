'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createReportBody } = require('../validators/report.validators');
const ctrl = require('../controllers/report.controller');

router.post('/', authenticate, validate({ body: createReportBody }), ctrl.create);

module.exports = router;

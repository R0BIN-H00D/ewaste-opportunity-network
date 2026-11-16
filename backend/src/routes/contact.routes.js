'use strict';
const router = require('express').Router();
const validate = require('../middleware/validate');
const { contactLimiter } = require('../middleware/rateLimit');
const { contactBody } = require('../validators/contact.validators');
const ctrl = require('../controllers/contact.controller');

router.post('/', contactLimiter, validate({ body: contactBody }), ctrl.send);

module.exports = router;

'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { imageUpload } = require('../middleware/upload');
const { aiLimiter } = require('../middleware/rateLimit');
const { ROLES } = require('../config/constants');
const v = require('../validators/ai.validators');
const ctrl = require('../controllers/ai.controller');

// The people who can list a device may ask for help with one. Photos are sent to the AI only when this is called.
const canList = authorize(ROLES.USER, ROLES.TECHNICIAN, ROLES.REFURBISHER);

router.use(authenticate, canList, aiLimiter);
router.get('/status', ctrl.status);
router.post('/analyze-device', ...imageUpload('photos', 3), validate({ body: v.analyzeBody }), ctrl.analyze);
router.post('/advice', validate({ body: v.adviceBody }), ctrl.advice);

module.exports = router;

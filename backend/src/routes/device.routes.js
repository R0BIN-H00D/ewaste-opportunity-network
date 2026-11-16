'use strict';
const router = require('express').Router();
const { authenticate, optionalAuth, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { validObjectIdParam } = require('../middleware/guards');
const { ROLES } = require('../config/constants');
const { createBody, updateBody, listQuery } = require('../validators/device.validators');
const ctrl = require('../controllers/device.controller');

const canList = authorize(ROLES.USER, ROLES.TECHNICIAN, ROLES.REFURBISHER);

router.get('/', optionalAuth, validate({ query: listQuery }), ctrl.list);
router.post('/', authenticate, canList, uploadLimiter, ...imageUpload('photos'), validate({ body: createBody }), ctrl.create);
router.get('/:id', validObjectIdParam(), optionalAuth, ctrl.getOne);
router.put('/:id', validObjectIdParam(), authenticate, uploadLimiter, ...imageUpload('photos'), validate({ body: updateBody }), ctrl.update);
router.delete('/:id', validObjectIdParam(), authenticate, ctrl.remove);

module.exports = router;

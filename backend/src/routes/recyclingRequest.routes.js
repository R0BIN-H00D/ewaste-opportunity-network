'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { ROLES } = require('../config/constants');
const v = require('../validators/recycling.validators');
const ctrl = require('../controllers/recycling.controller');

// Everyone except admins can send devices for recycling; centres may act only while verified (checked in the service).
const requesters = [authenticate, authorize(ROLES.USER, ROLES.TECHNICIAN, ROLES.STUDENT, ROLES.REFURBISHER, ROLES.RECYCLER)];

router.post('/', ...requesters, uploadLimiter, ...imageUpload('photos'), validate({ body: v.createBody }), ctrl.create);
router.get('/', authenticate, validate({ query: v.listQuery }), ctrl.list);
router.get('/report', authenticate, authorize(ROLES.RECYCLER), validate({ query: v.reportQuery }), ctrl.report); // before /:id
router.get('/:id', validObjectIdParam(), authenticate, ctrl.get);

router.put('/:id/status', validObjectIdParam(), authenticate, validate({ body: v.statusBody }), ctrl.setStatus);
router.post('/:id/pickup', validObjectIdParam(), authenticate, validate({ body: v.pickupBody }), ctrl.schedulePickup);
router.post('/:id/confirm-handover', validObjectIdParam(), authenticate, validate({ body: v.confirmBody }), ctrl.confirmHandover);
router.put('/:id/materials', validObjectIdParam(), authenticate, validate({ body: v.materialsBody }), ctrl.materials);
router.post('/:id/cancel', validObjectIdParam(), authenticate, validate({ body: v.cancelBody }), ctrl.cancel);

module.exports = router;

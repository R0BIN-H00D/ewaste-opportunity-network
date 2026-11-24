'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { validObjectIdParam } = require('../middleware/guards');
const { ROLES } = require('../config/constants');
const v = require('../validators/serviceRequest.validators');
const { verifyBody } = require('../validators/order.validators');
const ctrl = require('../controllers/serviceRequest.controller');

// Same roles that may list a device may ask for a repair.
const canRequest = authorize(ROLES.USER, ROLES.TECHNICIAN, ROLES.REFURBISHER);

router.use(authenticate);

router.post('/', canRequest, validate({ body: v.createBody }), ctrl.create);
router.get('/', validate({ query: v.listQuery }), ctrl.list);
router.get('/:id', validObjectIdParam(), ctrl.getOne);

router.put('/:id/status', validObjectIdParam(), uploadLimiter, ...imageUpload('photos'), validate({ body: v.statusBody }), ctrl.changeStatus);
router.post('/:id/quotation', validObjectIdParam(), validate({ body: v.quotationBody }), ctrl.submitQuotation);
router.get('/:id/quotations', validObjectIdParam(), ctrl.listQuotations);
router.put('/:id/quotation/:qid/decision', validate({ params: v.quotationParams, body: v.decisionBody }), ctrl.decideQuotation);
router.post('/:id/progress', validObjectIdParam(), uploadLimiter, ...imageUpload('photos'), validate({ body: v.progressBody }), ctrl.addProgress);
router.post('/:id/pickup', validObjectIdParam(), validate({ body: v.pickupBody }), ctrl.schedulePickup);
router.post('/:id/handover', validObjectIdParam(), validate({ body: v.handoverBody }), ctrl.confirmHandover);
router.post('/:id/confirm-completion', validObjectIdParam(), ctrl.confirmCompletion);
router.post('/:id/payment', validObjectIdParam(), ctrl.startPayment);
router.post('/:id/payment/verify', validObjectIdParam(), validate({ body: verifyBody }), ctrl.verifyPayment);
router.post('/:id/cancel', validObjectIdParam(), validate({ body: v.cancelBody }), ctrl.cancel);

module.exports = router;

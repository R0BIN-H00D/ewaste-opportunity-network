'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const v = require('../validators/order.validators');
const ctrl = require('../controllers/order.controller');

// Any signed-in person can order. The service checks who is the buyer or seller of each order.
router.post('/', authenticate, validate({ body: v.placeBody }), ctrl.place);
router.get('/', authenticate, validate({ query: v.listQuery }), ctrl.list);
router.get('/:id', validObjectIdParam(), authenticate, ctrl.get);
router.put('/:id/status', validObjectIdParam(), authenticate, validate({ body: v.statusBody }), ctrl.status);
router.post('/:id/payment', validObjectIdParam(), authenticate, ctrl.startPayment);
router.post('/:id/payment/verify', validObjectIdParam(), authenticate, validate({ body: v.verifyBody }), ctrl.verifyPayment);
router.post('/:id/cancel', validObjectIdParam(), authenticate, validate({ body: v.cancelBody }), ctrl.cancel);

module.exports = router;

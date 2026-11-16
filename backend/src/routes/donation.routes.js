'use strict';
const router = require('express').Router();
const { authenticate, authorize, optionalAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const { ROLES } = require('../config/constants');
const v = require('../validators/donation.validators');
const ctrl = require('../controllers/donation.controller');

// Browsing is public. Everything that changes something needs a signed-in person; the service decides who may do what.
const canOffer = authorize(ROLES.USER, ROLES.TECHNICIAN, ROLES.REFURBISHER);

// Recipient organisations (A-02). These must come before "/:id".
router.get('/recipient', authenticate, ctrl.recipientStatus);
router.put('/recipient', authenticate, validate({ body: v.recipientBody }), ctrl.applyAsRecipient);

router.get('/', optionalAuth, validate({ query: v.listQuery }), ctrl.list);
router.post('/', authenticate, canOffer, validate({ body: v.createBody }), ctrl.create);
router.get('/:id', validObjectIdParam(), optionalAuth, ctrl.getOne);

router.post('/:id/request', validObjectIdParam(), authenticate, validate({ body: v.requestBody }), ctrl.request);
router.delete('/:id/request', validObjectIdParam(), authenticate, ctrl.withdraw);
router.put('/:id/requests/:rid/decision', authenticate, validate({ params: v.requestParams, body: v.decisionBody }), ctrl.decide);

router.post('/:id/handover', validObjectIdParam(), authenticate, validate({ body: v.handoverBody }), ctrl.scheduleHandover);
router.post('/:id/confirm-handover', validObjectIdParam(), authenticate, validate({ body: v.confirmBody }), ctrl.confirmHandover);
router.post('/:id/cancel', validObjectIdParam(), authenticate, validate({ body: v.cancelBody }), ctrl.cancel);
router.put('/:id/status', validObjectIdParam(), authenticate, validate({ body: v.statusBody }), ctrl.setStatus);
router.get('/:id/confirmation', validObjectIdParam(), authenticate, ctrl.confirmation);

module.exports = router;

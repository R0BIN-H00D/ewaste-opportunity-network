'use strict';
const router = require('express').Router();
const { authenticate, authorize, requireVerified } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const { ROLES } = require('../config/constants');
const v = require('../validators/wanted.validators');
const ctrl = require('../controllers/wanted.controller');

const refurbisherOnly = [authenticate, authorize(ROLES.REFURBISHER), requireVerified];

router.get('/', authenticate, validate({ query: v.listQuery }), ctrl.list);
router.post('/', ...refurbisherOnly, validate({ body: v.createBody }), ctrl.create);
router.get('/:id', validObjectIdParam(), authenticate, ctrl.getOne);
// Device owners and (verified) technicians can accept a request; the refurbisher sees who did.
router.post('/:id/respond', validObjectIdParam(), authenticate, authorize(ROLES.USER, ROLES.TECHNICIAN), requireVerified, validate({ body: v.respondBody }), ctrl.respond);
router.get('/:id/responses', validObjectIdParam(), ...refurbisherOnly, ctrl.responses);
router.put('/:id', validObjectIdParam(), ...refurbisherOnly, validate({ body: v.updateBody }), ctrl.update);
router.put('/:id/status', validObjectIdParam(), ...refurbisherOnly, validate({ body: v.statusBody }), ctrl.setStatus);
router.delete('/:id', validObjectIdParam(), ...refurbisherOnly, ctrl.remove);

module.exports = router;

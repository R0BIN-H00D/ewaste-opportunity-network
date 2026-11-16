'use strict';
const router = require('express').Router();
const { authenticate, optionalAuth, authorize, requireVerified } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { ROLES } = require('../config/constants');
const v = require('../validators/marketplace.validators');
const ctrl = require('../controllers/marketplace.controller');

// Anyone can browse. Only admin-verified refurbishers can sell (BR-01); the service checks who owns a product.
const sellerOnly = [authenticate, authorize(ROLES.REFURBISHER), requireVerified];

router.get('/', optionalAuth, validate({ query: v.listQuery }), ctrl.list);
router.get('/mine', ...sellerOnly, validate({ query: v.mineQuery }), ctrl.mine); // before /:id
router.post('/', ...sellerOnly, uploadLimiter, ...imageUpload('photos'), validate({ body: v.createBody }), ctrl.create);

router.get('/:id', validObjectIdParam(), optionalAuth, ctrl.get);
router.put('/:id', validObjectIdParam(), authenticate, authorize(ROLES.REFURBISHER, ROLES.ADMIN), uploadLimiter, ...imageUpload('photos'), validate({ body: v.updateBody }), ctrl.update);
router.delete('/:id', validObjectIdParam(), authenticate, authorize(ROLES.REFURBISHER, ROLES.ADMIN), ctrl.remove);
router.post('/:id/enquiries', validObjectIdParam(), authenticate, validate({ body: v.enquiryBody }), ctrl.enquire);

module.exports = router;

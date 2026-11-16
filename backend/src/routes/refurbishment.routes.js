'use strict';
const router = require('express').Router();
const { authenticate, authorize, requireVerified } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter } = require('../middleware/rateLimit');
const { ROLES } = require('../config/constants');
const v = require('../validators/refurbishment.validators');
const ctrl = require('../controllers/refurbishment.controller');

// Only admin-verified refurbishers see opportunities or make offers (BR-01). Owners use the job endpoints too,
// so the service decides who may do what on a given job.
const refurbisherOnly = [authenticate, authorize(ROLES.REFURBISHER), requireVerified];

router.get('/opportunities', ...refurbisherOnly, validate({ query: v.opportunitiesQuery }), ctrl.opportunities);
router.post('/offers', ...refurbisherOnly, validate({ body: v.offerBody }), ctrl.makeOffer);

router.get('/jobs', authenticate, validate({ query: v.jobsQuery }), ctrl.listJobs);
router.get('/jobs/:id', validObjectIdParam(), authenticate, ctrl.getJob);

router.put('/jobs/:id/offer-decision', validObjectIdParam(), authenticate, validate({ body: v.decisionBody }), ctrl.decide);
router.delete('/jobs/:id/offer', validObjectIdParam(), ...refurbisherOnly, ctrl.withdraw);

router.post('/jobs/:id/handover', validObjectIdParam(), authenticate, validate({ body: v.handoverBody }), ctrl.scheduleHandover);
router.post('/jobs/:id/confirm-handover', validObjectIdParam(), authenticate, validate({ body: v.confirmBody }), ctrl.confirmHandover);

router.put('/jobs/:id/status', validObjectIdParam(), ...refurbisherOnly, validate({ body: v.statusBody }), ctrl.advance);
router.post('/jobs/:id/photos', validObjectIdParam(), ...refurbisherOnly, uploadLimiter, ...imageUpload('photos'), validate({ body: v.photosBody }), ctrl.addPhotos);
router.post('/jobs/:id/cancel', validObjectIdParam(), authenticate, validate({ body: v.cancelBody }), ctrl.cancel);

module.exports = router;

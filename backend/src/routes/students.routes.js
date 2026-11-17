'use strict';
const router = require('express').Router();
const { authenticate, optionalAuth, authorize, requireVerified } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const { ROLES } = require('../config/constants');
const v = require('../validators/learning.validators');
const ctrl = require('../controllers/learning.controller');

// Verified technicians post and supervise; verified students apply (BR-01, BR-07). Reading the feed is public.
const supervisor = [authenticate, authorize(ROLES.TECHNICIAN), requireVerified];
const student = [authenticate, authorize(ROLES.STUDENT)];

router.get('/opportunities', optionalAuth, validate({ query: v.listQuery }), ctrl.listOpportunities);
router.get('/opportunities/mine', ...supervisor.slice(0, 2), validate({ query: v.mineQuery }), ctrl.myOpportunities); // before /:id
router.post('/opportunities', ...supervisor, validate({ body: v.createBody }), ctrl.createOpportunity);
router.get('/opportunities/:id', validObjectIdParam(), optionalAuth, ctrl.getOpportunity);
router.put('/opportunities/:id', validObjectIdParam(), ...supervisor, validate({ body: v.updateBody }), ctrl.updateOpportunity);
router.put('/opportunities/:id/status', validObjectIdParam(), ...supervisor, validate({ body: v.statusBody }), ctrl.setOpportunityStatus);
router.get('/opportunities/:id/applications', validObjectIdParam(), authenticate, authorize(ROLES.TECHNICIAN, ROLES.ADMIN), validate({ query: v.applicantsQuery }), ctrl.listApplicants);

router.post('/applications', authenticate, authorize(ROLES.STUDENT), requireVerified, validate({ body: v.applyBody }), ctrl.apply);
router.get('/applications', ...student, validate({ query: v.applicationsQuery }), ctrl.listMine);
router.get('/applications/:id', validObjectIdParam(), authenticate, ctrl.getApplication);
router.put('/applications/:id/decision', validObjectIdParam(), ...supervisor, validate({ body: v.decisionBody }), ctrl.decide);
router.post('/applications/:id/start', validObjectIdParam(), ...supervisor, ctrl.start);
router.put('/applications/:id/complete', validObjectIdParam(), ...supervisor, validate({ body: v.completeBody }), ctrl.complete);
router.post('/applications/:id/withdraw', validObjectIdParam(), ...student, validate({ body: v.noteBody }), ctrl.withdraw);

router.get('/experience', ...student, ctrl.experience);
router.get('/certificates', ...student, ctrl.certificates);
router.get('/certificates/verify/:certNo', ctrl.verifyCertificate); // public: anyone holding a certificate can check it
router.get('/certificates/:id/pdf', validObjectIdParam(), authenticate, authorize(ROLES.STUDENT, ROLES.ADMIN), ctrl.certificatePdf);

module.exports = router;

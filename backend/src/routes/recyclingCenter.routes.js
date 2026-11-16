'use strict';
const router = require('express').Router();
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const v = require('../validators/recycling.validators');
const ctrl = require('../controllers/recycling.controller');

// The directory is public: only approved, in-date, active centres appear (FR-REC-001, FR-REC-007).
router.get('/', validate({ query: v.centersQuery }), ctrl.listCenters);
router.get('/:id', validObjectIdParam(), ctrl.getCenter);

module.exports = router;

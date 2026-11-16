'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { ROLES } = require('../config/constants');
const v = require('../validators/pickup.validators');
const ctrl = require('../controllers/pickup.controller');

// Everyone who can hand over or collect devices; admins have no pickups of their own.
router.get('/', authenticate, authorize(ROLES.USER, ROLES.TECHNICIAN, ROLES.STUDENT, ROLES.REFURBISHER, ROLES.RECYCLER), validate({ query: v.listQuery }), ctrl.list);

module.exports = router;

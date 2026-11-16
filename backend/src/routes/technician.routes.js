'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const { ROLES } = require('../config/constants');
const v = require('../validators/technician.validators');
const ctrl = require('../controllers/technician.controller');

// Public directory (verified technicians only)
router.get('/', validate({ query: v.listQuery }), ctrl.list);
router.get('/nearby', validate({ query: v.nearbyQuery }), ctrl.list);
router.put('/availability', authenticate, authorize(ROLES.TECHNICIAN), validate({ body: v.availabilityBody }), ctrl.setAvailability);
router.get('/:id', validObjectIdParam(), ctrl.getOne);

module.exports = router;

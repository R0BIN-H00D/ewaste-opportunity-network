'use strict';
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const { ROLES } = require('../config/constants');
const { createBody, listQuery } = require('../validators/complaint.validators');
const ctrl = require('../controllers/complaint.controller');

// Everyone who is not an administrator can file and follow their own complaints (FR-CMP-001).
router.use(authenticate, authorize(...Object.values(ROLES).filter((r) => r !== ROLES.ADMIN)));

router.post('/', validate({ body: createBody }), ctrl.create);
router.get('/', validate({ query: listQuery }), ctrl.list);
router.get('/:id', validObjectIdParam('id'), ctrl.get);

module.exports = router;

'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const v = require('../validators/transaction.validators');
const ctrl = require('../controllers/transaction.controller');

router.use(authenticate);

router.get('/', validate({ query: v.listQuery }), ctrl.list);
router.get('/summary', ctrl.summary); // keep before /:id routes
router.put('/:id/confirm', validObjectIdParam(), validate({ body: v.confirmBody }), ctrl.confirm);

module.exports = router;

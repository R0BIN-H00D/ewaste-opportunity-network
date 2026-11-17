'use strict';
const router = require('express').Router();
const validate = require('../middleware/validate');
const { listQuery } = require('../validators/education.validators');
const ctrl = require('../controllers/education.controller');

// The learning centre is public: published articles only. Writing them is under /api/admin/education.
router.get('/', validate({ query: listQuery }), ctrl.list);
router.get('/:slug', ctrl.get);

module.exports = router;
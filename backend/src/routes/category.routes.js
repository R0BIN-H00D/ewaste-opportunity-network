'use strict';
const router = require('express').Router();
router.get('/', require('../controllers/category.controller').list);
module.exports = router;

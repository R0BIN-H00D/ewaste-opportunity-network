'use strict';
const router = require('express').Router();
const { optionalAuth } = require('../middleware/auth');
const ctrl = require('../controllers/complaint.controller');

// The banner is shown to visitors too, so no sign-in is needed; a valid token adds the announcements for that role.
router.get('/', optionalAuth, ctrl.announcements);

module.exports = router;

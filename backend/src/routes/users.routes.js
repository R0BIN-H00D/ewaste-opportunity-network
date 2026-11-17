'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { imageUpload } = require('../middleware/upload');
const { uploadLimiter, authLimiter } = require('../middleware/rateLimit');
const v = require('../validators/profile.validators');
const ctrl = require('../controllers/users.controller');

const { validObjectIdParam } = require('../middleware/guards');

// The one public route: a small card for a person who has shown up in a listing, review or chat. It is before authenticate on purpose.
router.get('/:id([0-9a-fA-F]{24})', validObjectIdParam(), ctrl.getPublic);

router.use(authenticate);

router.patch('/me', validate({ body: v.updateUserBody }), ctrl.updateMe);
router.get('/me/profile', ctrl.getProfile);
router.patch('/me/profile', validate({ body: v.updateProfileBody }), ctrl.updateProfile);

router.post('/me/avatar', uploadLimiter, ...imageUpload('avatar', 1), ctrl.uploadAvatar);
router.delete('/me/avatar', ctrl.removeAvatar);

// The body shape depends on the caller's role, so the service validates it.
router.get('/me/role-profile', ctrl.getRoleProfile);
router.patch('/me/role-profile', ctrl.updateRoleProfile);

router.delete('/me', authLimiter, validate({ body: v.deleteAccountBody }), ctrl.deleteAccount);

module.exports = router;

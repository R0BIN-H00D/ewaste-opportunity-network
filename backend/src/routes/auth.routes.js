'use strict';
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authLimiter, loginLimiter } = require('../middleware/rateLimit');
const v = require('../validators/auth.validators');
const ctrl = require('../controllers/auth.controller');

// Credential-style endpoints get the strict limiter; refresh/me/logout are called routinely so they do not.
router.post('/register', authLimiter, validate({ body: v.registerBody }), ctrl.register);
router.post('/login', loginLimiter, validate({ body: v.loginBody }), ctrl.login);
router.post('/forgot-password', authLimiter, validate({ body: v.forgotBody }), ctrl.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: v.resetBody }), ctrl.resetPassword);
router.post('/verify-email', authLimiter, validate({ body: v.verifyEmailBody }), ctrl.verifyEmail);

router.post('/refresh', validate({ body: v.refreshBody }), ctrl.refresh);
router.post('/logout', validate({ body: v.refreshBody }), ctrl.logout);

router.get('/me', authenticate, ctrl.me);
router.post('/logout-all', authenticate, ctrl.logoutAll);
router.post('/verify-email-code', authenticate, authLimiter, validate({ body: v.verifyCodeBody }), ctrl.verifyEmailCode);
router.post('/resend-verification', authenticate, authLimiter, ctrl.resendVerification);
router.post('/change-password', authenticate, authLimiter, validate({ body: v.changePasswordBody }), ctrl.changePassword);
router.get('/sessions', authenticate, ctrl.sessions);
router.delete('/sessions/:id', authenticate, validate({ params: v.sessionParam }), ctrl.revokeSession);

module.exports = router;

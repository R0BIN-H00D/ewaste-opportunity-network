'use strict';
// The signed-in person's in-app notifications (P8-05). Push and email channels come later; these routes do not change.
const router = require('express').Router();
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const v = require('../validators/notification.validators');
const ctrl = require('../controllers/notification.controller');

router.use(authenticate);

router.get('/', validate({ query: v.listQuery }), ctrl.list);
router.get('/unread-count', ctrl.unreadCount);
router.put('/read-all', ctrl.markAllRead); // keep before /:id routes
router.post('/devices', validate({ body: v.deviceBody }), ctrl.registerDevice); // a phone's push address, after sign-in
router.delete('/devices', validate({ body: v.deviceRemoveBody }), ctrl.unregisterDevice); // on sign-out
router.put('/:id/read', validObjectIdParam(), ctrl.markRead);

module.exports = router;

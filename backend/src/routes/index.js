'use strict';
const router = require('express').Router();

// Make sure every model/index is registered once the API loads.
require('../models');

router.use('/health', require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/users', require('./users.routes'));
router.use('/verification', require('./verification.routes'));
router.use('/technicians/verification', require('./verification.routes')); // the same routes under the name the spec uses (before /technicians/:id)
router.use('/categories', require('./category.routes'));
router.use('/devices', require('./device.routes'));
router.use('/reports', require('./report.routes'));
router.use('/contact', require('./contact.routes'));
router.use('/technicians', require('./technician.routes'));
router.use('/service-requests', require('./serviceRequest.routes'));
router.use('/matching', require('./matching.routes'));
router.use('/ai', require('./ai.routes'));
router.use('/reviews', require('./review.routes'));
router.use('/transactions', require('./transaction.routes'));
router.use('/donations', require('./donation.routes'));
router.use('/refurbishment', require('./refurbishment.routes'));
router.use('/wanted-requests', require('./wanted.routes'));
router.use('/marketplace', require('./marketplace.routes'));
router.use('/orders', require('./order.routes'));
router.use('/recycling-centers', require('./recyclingCenter.routes'));
router.use('/recycling-requests', require('./recyclingRequest.routes'));
router.use('/pickups', require('./pickups.routes'));
router.use('/complaints', require('./complaint.routes'));
router.use('/announcements', require('./announcement.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/chat', require('./chat.routes'));
router.use('/analytics', require('./analytics.routes'));
router.use('/education', require('./education.routes'));
router.use('/geo', require('./geo.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;

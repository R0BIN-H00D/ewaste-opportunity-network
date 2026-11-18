'use strict';
// Everything under /api/admin is for administrators only (FR-ADM-001). The guard is applied once, here, so a new admin
// route can never be added without it.
const router = require('express').Router();
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { validObjectIdParam } = require('../middleware/guards');
const { adminLimiter } = require('../middleware/rateLimit');
const { ROLES } = require('../config/constants');
const v = require('../validators/admin.validators');
const ctrl = require('../controllers/admin.controller');

router.use(authenticate, authorize(ROLES.ADMIN), adminLimiter);

// Overview and read-only monitors
router.get('/dashboard', ctrl.dashboard);
router.get('/monitors/:kind', validate({ query: v.monitorQuery }), ctrl.monitor);

// People
router.get('/users', validate({ query: v.userListQuery }), ctrl.listUsers);
router.get('/users/:id', validObjectIdParam('id'), ctrl.getUser);
router.put('/users/:id/status', validObjectIdParam('id'), validate({ body: v.userStatusBody }), ctrl.setUserStatus);

// Verification queue (the document route comes first so "documents" is never read as a user id)
router.get('/verifications', validate({ query: v.verificationListQuery }), ctrl.listVerifications);
router.get('/verifications/documents/:docId/file', validObjectIdParam('docId'), ctrl.verificationDocument);
router.get('/verifications/:userId', validObjectIdParam('userId'), validate({ query: v.verificationTypeQuery }), ctrl.getVerification);
router.put('/verifications/:userId', validObjectIdParam('userId'), validate({ body: v.verificationDecisionBody }), ctrl.decideVerification);

// Moderation
router.get('/listings', validate({ query: v.listingListQuery }), ctrl.listListings);
router.put('/listings/:id/moderation', validObjectIdParam('id'), validate({ body: v.listingModerationBody }), ctrl.moderateListing);
router.get('/reviews', validate({ query: v.reviewListQuery }), ctrl.listReviews);
router.put('/reviews/:id/status', validObjectIdParam('id'), validate({ body: v.reviewStatusBody }), ctrl.setReviewStatus);
router.get('/reports', validate({ query: v.reportListQuery }), ctrl.listReports);
router.get('/reports/:id', validObjectIdParam('id'), ctrl.getReport);
router.put('/reports/:id', validObjectIdParam('id'), validate({ body: v.reportDecisionBody }), ctrl.decideReport);

// Categories (the order route comes first so "order" is never read as an id)
router.get('/categories', ctrl.listCategories);
router.post('/categories', validate({ body: v.categoryCreateBody }), ctrl.createCategory);
router.put('/categories/order', validate({ body: v.categoryOrderBody }), ctrl.reorderCategories);
router.put('/categories/:id', validObjectIdParam('id'), validate({ body: v.categoryUpdateBody }), ctrl.updateCategory);
router.delete('/categories/:id', validObjectIdParam('id'), ctrl.deleteCategory);

// Learning-centre articles
router.get('/education', validate({ query: v.articleListQuery }), ctrl.listArticles);
router.post('/education', validate({ body: v.articleCreateBody }), ctrl.createArticle);
router.get('/education/:id', validObjectIdParam('id'), ctrl.getArticle);
router.put('/education/:id', validObjectIdParam('id'), validate({ body: v.articleUpdateBody }), ctrl.updateArticle);
router.delete('/education/:id', validObjectIdParam('id'), ctrl.deleteArticle);

// Complaints
router.get('/complaints', validate({ query: v.complaintListQuery }), ctrl.listComplaints);
router.get('/complaints/:id', validObjectIdParam('id'), ctrl.getComplaint);
router.put('/complaints/:id', validObjectIdParam('id'), validate({ body: v.complaintActionBody }), ctrl.actOnComplaint);

// Announcements
router.get('/announcements', validate({ query: v.announcementListQuery }), ctrl.listAnnouncements);
router.post('/announcements', validate({ body: v.announcementCreateBody }), ctrl.createAnnouncement);
router.put('/announcements/:id', validObjectIdParam('id'), validate({ body: v.announcementUpdateBody }), ctrl.updateAnnouncement);
router.delete('/announcements/:id', validObjectIdParam('id'), ctrl.deleteAnnouncement);

// Audit log (read-only)
router.get('/audit', validate({ query: v.auditListQuery }), ctrl.listAudit);

// Analytics and CSV exports
router.get('/analytics', validate({ query: v.analyticsQuery }), ctrl.analytics);
router.get('/exports/:kind', validate({ query: v.exportQuery }), ctrl.exportCsv);

module.exports = router;

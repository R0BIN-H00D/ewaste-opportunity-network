'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');
const users = require('../services/adminUserService');
const verifications = require('../services/adminVerificationService');
const dashboard = require('../services/adminDashboardService');
const monitors = require('../services/adminMonitorService');
const listings = require('../services/adminListingService');
const reviews = require('../services/adminReviewService');
const reports = require('../services/adminReportService');
const categories = require('../services/adminCategoryService');
const complaints = require('../services/adminComplaintService');
const announcements = require('../services/announcementService');
const auditLog = require('../services/adminAuditService');
const analytics = require('../services/adminAnalyticsService');
const exportsSvc = require('../services/adminExportService');
const education = require('../services/educationService');

// ---- users ----
exports.listUsers = asyncHandler(async (req, res) => {
  const { items, meta } = await users.listUsers(req.query);
  return ok(res, items, 'OK', meta);
});
exports.getUser = asyncHandler(async (req, res) => ok(res, await users.getUser(req.params.id, req.user.id)));
exports.setUserStatus = asyncHandler(async (req, res) => {
  const result = await users.setStatus(req.user, req.params.id, req.body, req.ip);
  return ok(res, result, req.body.status === 'suspended' ? 'Account suspended' : 'Account reactivated');
});

// ---- verification queue ----
exports.listVerifications = asyncHandler(async (req, res) => {
  const { items, meta } = await verifications.listQueue(req.query);
  return ok(res, items, 'OK', meta);
});
exports.getVerification = asyncHandler(async (req, res) => ok(res, await verifications.getSubmission(req.params.userId, req.query.type)));
exports.decideVerification = asyncHandler(async (req, res) => {
  const result = await verifications.decide(req.user, req.params.userId, req.body, req.ip);
  return ok(res, result, 'Decision saved');
});
/** Streams a private document. Never cached and never sniffed, because these are people's identity papers. */
exports.verificationDocument = asyncHandler(async (req, res) => {
  const file = await verifications.openDocument(req.user, req.params.docId, req.ip);
  const safeName = String(file.name).replace(/[^\w.\- ]/g, '_').slice(0, 120);
  res.set({
    'Content-Type': file.mime,
    'Content-Disposition': `inline; filename="${safeName}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return file.buffer ? res.send(file.buffer) : res.sendFile(file.path);
});

// ---- overview and monitors ----
exports.dashboard = asyncHandler(async (req, res) => ok(res, await dashboard.overview()));
exports.monitor = asyncHandler(async (req, res) => {
  const { items, meta } = await monitors.list(req.params.kind, req.query);
  return ok(res, items, 'OK', meta);
});

// ---- listings ----
exports.listListings = asyncHandler(async (req, res) => {
  const { items, meta } = await listings.listListings(req.query);
  return ok(res, items, 'OK', meta);
});
exports.moderateListing = asyncHandler(async (req, res) => {
  const { action, reason } = req.body;
  const run = action === 'remove' ? listings.removeListing : listings.restoreListing;
  return ok(res, await run(req.user, req.params.id, { reason, ip: req.ip }), action === 'remove' ? 'Listing removed' : 'Listing restored');
});

// ---- reviews ----
exports.listReviews = asyncHandler(async (req, res) => {
  const { items, meta } = await reviews.listReviews(req.query);
  return ok(res, items, 'OK', meta);
});
exports.setReviewStatus = asyncHandler(async (req, res) => ok(res, await reviews.setStatus(req.user, req.params.id, { ...req.body, ip: req.ip }), 'Review updated'));

// ---- reports ----
exports.listReports = asyncHandler(async (req, res) => {
  const { items, meta } = await reports.listReports(req.query);
  return ok(res, items, 'OK', meta);
});
exports.getReport = asyncHandler(async (req, res) => ok(res, await reports.getReport(req.params.id)));
exports.decideReport = asyncHandler(async (req, res) => ok(res, await reports.decide(req.user, req.params.id, req.body, req.ip), 'Decision saved'));

// ---- categories ----
exports.listCategories = asyncHandler(async (_req, res) => ok(res, await categories.list()));
exports.createCategory = asyncHandler(async (req, res) => ok(res, await categories.create(req.user, req.body, req.ip), 'Category created', undefined, 201));
exports.updateCategory = asyncHandler(async (req, res) => ok(res, await categories.update(req.user, req.params.id, req.body, req.ip), 'Category updated'));
exports.reorderCategories = asyncHandler(async (req, res) => ok(res, await categories.reorder(req.user, req.body.ids, req.ip), 'Order saved'));
exports.deleteCategory = asyncHandler(async (req, res) => ok(res, await categories.remove(req.user, req.params.id, req.ip), 'Category deleted'));

// ---- complaints ----
exports.listComplaints = asyncHandler(async (req, res) => {
  const { items, meta } = await complaints.list(req.user, req.query);
  return ok(res, items, 'OK', meta);
});
exports.getComplaint = asyncHandler(async (req, res) => ok(res, await complaints.get(req.user, req.params.id)));
exports.actOnComplaint = asyncHandler(async (req, res) => ok(res, await complaints.act(req.user, req.params.id, req.body, req.ip), 'Complaint updated'));

// ---- announcements ----
exports.listAnnouncements = asyncHandler(async (req, res) => {
  const { items, meta } = await announcements.adminList(req.query);
  return ok(res, items, 'OK', meta);
});
exports.createAnnouncement = asyncHandler(async (req, res) => ok(res, await announcements.create(req.user, req.body, req.ip), 'Announcement published', undefined, 201));
exports.updateAnnouncement = asyncHandler(async (req, res) => ok(res, await announcements.update(req.user, req.params.id, req.body, req.ip), 'Announcement updated'));
exports.deleteAnnouncement = asyncHandler(async (req, res) => ok(res, await announcements.remove(req.user, req.params.id, req.ip), 'Announcement deleted'));

// ---- audit log ----
exports.listAudit = asyncHandler(async (req, res) => {
  const { items, meta } = await auditLog.list(req.query);
  return ok(res, items, 'OK', meta);
});

// ---- analytics, exports ----
exports.analytics = asyncHandler(async (req, res) => ok(res, await analytics.get(req.query)));

/** A file, not JSON. Never cached: it holds people's details. The headers tell the web app how many rows and whether the file was cut short. */
exports.exportCsv = asyncHandler(async (req, res) => {
  const file = await exportsSvc.build(req.user, req.params.kind, req.query, req.ip);
  res.set({
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${file.filename}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Export-Rows': String(file.rows),
    'X-Export-Truncated': String(file.truncated),
  });
  return res.send(file.csv);
});

// ---- learning-centre articles ----
exports.listArticles = asyncHandler(async (req, res) => {
  const { items, meta } = await education.listAll(req.query);
  return ok(res, items, 'OK', meta);
});
exports.getArticle = asyncHandler(async (req, res) => ok(res, await education.getForAdmin(req.params.id)));
exports.createArticle = asyncHandler(async (req, res) => created(res, await education.create(req.user, req.body, req.ip), 'Article saved'));
exports.updateArticle = asyncHandler(async (req, res) => ok(res, await education.update(req.user, req.params.id, req.body, req.ip), 'Article saved'));
exports.deleteArticle = asyncHandler(async (req, res) => ok(res, await education.remove(req.user, req.params.id, req.ip), 'Article deleted'));

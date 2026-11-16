'use strict';
// The administrator's overview (FR-ADM-002): headline numbers, what needs attention, and the latest admin actions.
// Everything is a count taken from the live collections, so the tiles can never disagree with the lists behind them.
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const DeviceListing = require('../models/DeviceListing');
const ServiceRequest = require('../models/ServiceRequest');
const Donation = require('../models/Donation');
const RefurbishmentJob = require('../models/RefurbishmentJob');
const RecyclingRecord = require('../models/RecyclingRecord');
const RecyclingCenter = require('../models/RecyclingCenter');
const MarketplaceProduct = require('../models/MarketplaceProduct');
const Order = require('../models/Order');
const Report = require('../models/Report');
const Complaint = require('../models/Complaint');
const AdminLog = require('../models/AdminLog');
const { ROLES, PROVIDER_ROLES, ACCOUNT_STATUS: S } = require('../config/constants');
const { ROLE_PROFILE_MODEL } = require('./profileModels');

// What "done" and "still moving" mean for each flow. One place, so the tiles and the monitors agree.
const FLOWS = {
  repairs: { Model: ServiceRequest, done: ['service_completed'], stopped: ['rejected', 'cancelled'] },
  donations: { Model: Donation, done: ['completed'], stopped: ['cancelled'] },
  refurbishment: { Model: RefurbishmentJob, done: ['listed'], stopped: ['cancelled'] },
  recycling: { Model: RecyclingRecord, done: ['completed'], stopped: ['rejected', 'cancelled'] },
};

const byStatus = async (Model) => {
  const rows = await Model.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.n]));
};

function flowTotals(counts, { done, stopped }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const completed = done.reduce((n, s) => n + (counts[s] || 0), 0);
  const ended = stopped.reduce((n, s) => n + (counts[s] || 0), 0);
  return { total, completed, stopped: ended, open: total - completed - ended };
}

const startOfMonth = (now) => new Date(now.getFullYear(), now.getMonth(), 1);

async function overview(now = new Date()) {
  const people = { $match: { role: { $ne: ROLES.ADMIN }, status: { $ne: S.DELETED } } };
  const [roleRows, statusRows, newThisMonth] = await Promise.all([
    User.aggregate([people, { $group: { _id: '$role', n: { $sum: 1 } } }]),
    User.aggregate([people, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    User.countDocuments({ role: { $ne: ROLES.ADMIN }, status: { $ne: S.DELETED }, createdAt: { $gte: startOfMonth(now) } }),
  ]);
  const byRole = Object.fromEntries(Object.values(ROLES).filter((r) => r !== ROLES.ADMIN).map((r) => [r, 0]));
  roleRows.forEach((r) => { byRole[r._id] = r.n; });
  const statuses = Object.fromEntries(statusRows.map((r) => [r._id, r.n]));
  const totalUsers = Object.values(byRole).reduce((a, b) => a + b, 0);

  const flowCounts = await Promise.all(Object.values(FLOWS).map((f) => byStatus(f.Model)));
  const services = {};
  Object.keys(FLOWS).forEach((k, i) => { services[k] = flowTotals(flowCounts[i], FLOWS[k]); });
  const completedServices = Object.values(services).reduce((n, s) => n + s.completed, 0);

  const [providerPending, recipientPending, listingRows, centresTotal, centresAuthorised, productsActive, ordersTotal, openReports, openComplaints, recent] = await Promise.all([
    Promise.all(PROVIDER_ROLES.map((r) => ROLE_PROFILE_MODEL[r].countDocuments({ 'verification.status': 'pending' }))),
    UserProfile.countDocuments({ 'orgProfile.isOrg': true, 'orgProfile.recipientVerification.status': 'pending' }),
    DeviceListing.aggregate([{ $match: { deletedAt: null } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    RecyclingCenter.countDocuments({}),
    RecyclingCenter.countDocuments({ 'verification.status': 'approved' }),
    MarketplaceProduct.countDocuments({ status: 'active' }),
    Order.countDocuments({}),
    Report.countDocuments({ status: 'open' }),
    Complaint.countDocuments({ status: { $in: ['open', 'assigned', 'in_review'] } }),
    AdminLog.find({}).sort({ createdAt: -1, _id: -1 }).limit(8).populate('admin', 'name').lean(), // _id breaks same-millisecond ties
  ]);
  const listings = Object.fromEntries(listingRows.map((r) => [r._id, r.n]));
  const providers = providerPending.reduce((a, b) => a + b, 0);

  return {
    generatedAt: now,
    people: { total: totalUsers, active: statuses[S.ACTIVE] || 0, suspended: statuses[S.SUSPENDED] || 0, waitingForVerification: statuses[S.PENDING] || 0, newThisMonth, byRole },
    centres: { total: centresTotal, authorised: centresAuthorised },
    listings: { total: Object.values(listings).reduce((a, b) => a + b, 0), listed: listings.listed || 0, inService: listings.in_service || 0, byStatus: listings },
    services: { ...services, completed: completedServices },
    marketplace: { activeProducts: productsActive, orders: ordersTotal },
    attention: {
      pendingVerifications: { providers, recipients: recipientPending, total: providers + recipientPending },
      openReports,
      openComplaints,
    },
    recentActivity: recent.map((r) => ({ _id: r._id, action: r.action, reason: r.reason || '', at: r.createdAt, admin: r.admin ? { _id: r.admin._id, name: r.admin.name } : null, targetType: r.targetType || '', targetId: r.targetId || null })),
  };
}

module.exports = { overview, FLOWS };

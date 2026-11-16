'use strict';
// The audit log viewer (FR-ADM-012): who did what, to what, when, and why. Read-only; the model itself refuses edits and deletes.
const AdminLog = require('../models/AdminLog');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta } = require('../utils/pagination');

const DAY = 24 * 3600 * 1000;

function dateRange({ from, to }) {
  if (!from && !to) return null;
  const range = {};
  if (from) range.$gte = new Date(`${from}T00:00:00.000Z`);
  if (to) range.$lt = new Date(new Date(`${to}T00:00:00.000Z`).getTime() + DAY);
  if (from && to && range.$gte >= range.$lt) throw ApiError.validation([{ field: 'to', message: 'The end date must not be before the start date' }]);
  return range;
}

async function list(query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 25 });
  const filter = {};
  if (query.admin) filter.admin = query.admin;
  if (query.action) filter.action = query.action;
  if (query.targetType) filter.targetType = query.targetType;
  const range = dateRange(query);
  if (range) filter.createdAt = range;
  const [total, rows, actions, targetTypes, admins] = await Promise.all([
    AdminLog.countDocuments(filter),
    AdminLog.find(filter).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).populate('admin', 'name').lean(),
    AdminLog.distinct('action'),
    AdminLog.distinct('targetType'),
    AdminLog.distinct('admin'),
  ]);
  const adminUsers = await User.find({ _id: { $in: admins } }).select('name').lean();
  return {
    items: rows.map((r) => ({
      _id: r._id,
      action: r.action,
      at: r.createdAt,
      admin: r.admin ? { _id: r.admin._id, name: r.admin.name } : null,
      targetType: r.targetType || '',
      targetId: r.targetId || null,
      reason: r.reason || '',
      before: r.before === undefined ? null : r.before,
      after: r.after === undefined ? null : r.after,
      ip: r.ip || '',
    })),
    meta: {
      ...buildMeta({ page, limit }, total),
      actions: actions.filter(Boolean).sort(),
      targetTypes: targetTypes.filter(Boolean).sort(),
      admins: adminUsers.map((u) => ({ _id: u._id, name: u.name })).sort((a, b) => a.name.localeCompare(b.name)),
    },
  };
}

module.exports = { list };

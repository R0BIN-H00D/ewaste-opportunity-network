'use strict';
// Administrator audit trail (NFR-SEC-11, FR-ADM-008). Every admin action that changes something, and every view of a private
// document, writes one insert-only AdminLog row. The model blocks updates and deletes.
const AdminLog = require('../models/AdminLog');

// Plain copy so a Mongoose document or a Date in `before` / `after` is stored as data, not as a live object.
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

/**
 * @param admin  the signed-in administrator (document or { id })
 * @param action dotted name, e.g. `user.suspended`, `verification.approved`
 * @param detail { targetType, targetId, before, after, reason, ip }
 */
function record(admin, action, { targetType, targetId, before, after, reason, ip } = {}) {
  return AdminLog.create({
    admin: admin.id || admin._id,
    action,
    targetType,
    targetId,
    before: plain(before),
    after: plain(after),
    reason: reason || undefined,
    ip,
  });
}

/** Newest first, for one target (shown on a user or verification detail page). */
async function historyFor(targetType, targetId, limit = 20) {
  const rows = await AdminLog.find({ targetType, targetId }).sort({ createdAt: -1 }).limit(limit).populate('admin', 'name').lean();
  return rows.map((r) => ({ _id: r._id, action: r.action, reason: r.reason || '', at: r.createdAt, admin: r.admin ? { _id: r.admin._id, name: r.admin.name } : null, before: r.before, after: r.after }));
}

module.exports = { record, historyFor };

'use strict';
// Participation certificates for students (FR-STU-006). The rule (only a completed task, only once, the student is told) lives in
// learningService.issueCertificate; this file gives administrators the queue to work from and writes the audit row.
const StudentApplication = require('../models/StudentApplication');
const Certificate = require('../models/Certificate');
const learning = require('./learningService');
const audit = require('./auditService');
const { parsePagination, buildMeta } = require('../utils/pagination');

const idOf = (v) => String(v && v._id ? v._id : v);

/**
 * Completed student tasks. `state=waiting` (default) are the ones with no certificate yet, oldest first, so nobody waits for
 * ever; `issued` are the ones that have one; `all` is both.
 */
async function list(query = {}) {
  const state = query.state || 'waiting';
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 20 });
  const issuedIds = await Certificate.distinct('application');
  const completed = { status: 'completed' };
  let filter = completed;
  if (state === 'waiting') filter = { ...completed, _id: { $nin: issuedIds } };
  if (state === 'issued') filter = { ...completed, _id: { $in: issuedIds } };

  const [total, rows, waiting] = await Promise.all([
    StudentApplication.countDocuments(filter),
    StudentApplication.find(filter)
      .sort(state === 'waiting' ? { completedAt: 1, _id: 1 } : { completedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate([{ path: 'student', select: 'name' }, { path: 'opportunity', select: 'title' }])
      .lean(),
    StudentApplication.countDocuments({ ...completed, _id: { $nin: issuedIds } }),
  ]);
  const certs = await Certificate.find({ application: { $in: rows.map((r) => r._id) } }).select('application certNo issuedAt').lean();
  const certOf = new Map(certs.map((c) => [idOf(c.application), c]));

  const items = rows.map((a) => {
    const c = certOf.get(idOf(a._id));
    return {
      _id: a._id,
      student: a.student ? { _id: a.student._id, name: a.student.name } : { _id: null, name: 'Removed account' },
      task: a.opportunity?.title || 'Task',
      hours: a.hours || 0,
      completedAt: a.completedAt || null,
      certificate: c ? { certNo: c.certNo, issuedAt: c.issuedAt } : null,
      canIssue: !c,
    };
  });
  return { items, meta: { ...buildMeta({ page, limit }, total), counts: { waiting, issued: issuedIds.length } } };
}

/** Issues the certificate and writes the audit row. `409 NOT_COMPLETED` / `ALREADY_ISSUED` and `404` come from the rule itself. */
async function issue(admin, applicationId, ip) {
  const cert = await learning.issueCertificate(admin, applicationId);
  await audit.record(admin, 'certificate.issued', { targetType: 'Certificate', targetId: cert._id, after: { certNo: cert.certNo, application: String(applicationId) }, ip });
  return { _id: cert._id, certNo: cert.certNo, issuedAt: cert.issuedAt, application: String(applicationId) };
}

module.exports = { list, issue };

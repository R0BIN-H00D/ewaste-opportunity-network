'use strict';
const AdminLog = require('../models/AdminLog');
const logger = require('../utils/logger');

/**
 * Writes an AdminLog entry after a successful (2xx) response. Use on every admin mutation (BR-13).
 * Handlers may set res.locals.auditBefore / auditAfter / auditTargetId for richer records.
 */
const audit = (action, { targetType } = {}) => (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode < 200 || res.statusCode >= 300 || !req.user) return;
    AdminLog.create({
      admin: req.user.id,
      action,
      targetType,
      targetId: res.locals.auditTargetId || (/^[a-f\d]{24}$/i.test(req.params?.id || '') ? req.params.id : undefined),
      before: res.locals.auditBefore,
      after: res.locals.auditAfter,
      reason: typeof req.body?.reason === 'string' ? req.body.reason : undefined,
      ip: req.ip,
    }).catch((err) => logger.error({ err: err.message, action }, 'Failed to write audit log'));
  });
  next();
};

module.exports = audit;

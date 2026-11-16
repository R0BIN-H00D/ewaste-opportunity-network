'use strict';
// Consistent response envelope: { success, message, data, meta? }
const ok = (res, data = null, message = 'OK', meta, status = 200) =>
  res.status(status).json({ success: true, message, data, ...(meta ? { meta } : {}) });
const created = (res, data = null, message = 'Created') => ok(res, data, message, undefined, 201);

module.exports = { ok, created };

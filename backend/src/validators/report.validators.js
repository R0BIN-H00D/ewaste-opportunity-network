'use strict';
const { z, objectId } = require('./common');

const createReportBody = z
  .object({
    targetType: z.enum(['listing', 'review', 'product', 'user']),
    targetId: objectId,
    reason: z.enum(['spam', 'inappropriate', 'fraud', 'unsafe', 'wrong_category', 'other']),
    details: z.string().trim().max(1000).optional(),
  })
  .strict();

module.exports = { createReportBody };

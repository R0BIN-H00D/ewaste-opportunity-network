'use strict';
const { z, optStr, pageQuery } = require('./common');

const listQuery = z
  .object({
    ...pageQuery,
    direction: z.enum(['paid', 'received']).optional(),
    type: z.enum(['repair', 'order', 'refurb_purchase', 'donation', 'recycling']).optional(),
    status: z.enum(['recorded', 'confirmed', 'disputed']).optional(),
  })
  .strict();

const confirmBody = z.object({ reference: optStr(100) }).strict();

module.exports = { listQuery, confirmBody };

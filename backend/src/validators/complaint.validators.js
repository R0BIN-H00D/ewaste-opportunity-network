'use strict';
const { z, objectId, blankToUndefined, pageQuery } = require('./common');

const REF_TYPES = ['service', 'order', 'listing', 'recycling', 'donation', 'user', 'other'];

const createBody = z
  .object({
    subject: z.string().trim().min(5, 'Use at least 5 characters').max(140, 'Keep it to 140 characters'),
    description: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(2000, 'Keep it to 2000 characters'),
    against: z.preprocess(blankToUndefined, objectId.optional()),
    refType: z.preprocess(blankToUndefined, z.enum(REF_TYPES).optional()),
    refId: z.preprocess(blankToUndefined, objectId.optional()),
  })
  .strict()
  .refine((b) => !b.refId || (b.refType && b.refType !== 'other'), { path: ['refType'], message: 'Say what kind of record this is' });

const listQuery = z
  .object({
    ...pageQuery,
    status: z.preprocess(blankToUndefined, z.enum(['active', 'closed', 'open', 'assigned', 'in_review', 'resolved', 'rejected']).optional()),
  })
  .strict();

module.exports = { createBody, listQuery };

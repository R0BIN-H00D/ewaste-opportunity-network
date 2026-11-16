'use strict';
const { z, objectId, optStr, pageQuery } = require('./common');
const { CONDITIONS, REFURB_JOB_STATUS } = require('../config/constants');

const opportunitiesQuery = z
  .object({
    ...pageQuery,
    q: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    condition: z.enum(CONDITIONS).optional(),
    city: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

const offerBody = z
  .object({
    listingId: objectId,
    amount: z.number().min(0, 'The amount cannot be negative').max(10000000).optional(),
    message: z.string().trim().max(1000).optional(),
  })
  .strict();

const jobsQuery = z
  .object({
    ...pageQuery,
    as: z.enum(['owner', 'refurbisher']).optional(),
    status: z.enum(REFURB_JOB_STATUS).optional(),
  })
  .strict();

const decisionBody = z.object({ decision: z.enum(['accept', 'reject']) }).strict();

const handoverBody = z
  .object({ date: z.coerce.date(), timeSlot: z.string().trim().max(40).optional(), notes: z.string().trim().max(500).optional() })
  .strict();

const confirmBody = z.object({ acknowledgeChecklist: z.boolean().optional() }).strict();

const statusBody = z.object({ status: z.enum(REFURB_JOB_STATUS), note: z.string().trim().max(500).optional() }).strict();

// Photos arrive as multipart, so every value is a string.
const photosBody = z.object({ stage: z.enum(['before', 'after']), note: optStr(500) }).strict();

const cancelBody = z.object({ reason: z.string().trim().max(500).optional() }).strict();

module.exports = { opportunitiesQuery, offerBody, jobsQuery, decisionBody, handoverBody, confirmBody, statusBody, photosBody, cancelBody };

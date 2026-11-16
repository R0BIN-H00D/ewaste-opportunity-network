'use strict';
const { z, objectId, pageQuery } = require('./common');
const { CONDITIONS } = require('../config/constants');

const createBody = z
  .object({
    listingId: objectId,
    description: z.string().trim().max(1000).optional(),
  })
  .strict();

const listQuery = z
  .object({
    ...pageQuery,
    q: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    condition: z.enum(CONDITIONS).optional(),
    city: z.string().trim().min(1).max(80).optional(),
    as: z.enum(['donor', 'recipient']).optional(), // "my donations" / "donations I asked for"; needs a signed-in user
  })
  .strict();

const requestBody = z
  .object({
    justification: z.string().trim().min(10, 'Tell the donor why you need this device (at least a sentence)').max(1000),
    intendedUse: z.string().trim().max(500).optional(),
  })
  .strict();

const decisionBody = z
  .object({ decision: z.enum(['accept', 'reject']) })
  .strict();

const requestParams = z.object({ id: objectId, rid: objectId }).strict();

const handoverBody = z
  .object({ date: z.coerce.date(), timeSlot: z.string().trim().max(40).optional(), notes: z.string().trim().max(500).optional() })
  .strict();

const confirmBody = z.object({ acknowledgeChecklist: z.boolean().optional() }).strict();
const cancelBody = z.object({ reason: z.string().trim().max(500).optional() }).strict();

// FR-DON-005 names PUT /:id/status. The only status a client may set directly is "cancelled"; every other step has its own action.
const statusBody = z.object({ status: z.literal('cancelled'), reason: z.string().trim().max(500).optional() }).strict();

const recipientBody = z
  .object({
    orgType: z.enum(['school', 'college', 'ngo', 'trust', 'company', 'other']),
    orgName: z.string().trim().min(2, 'Enter the organisation name').max(150),
    registrationNo: z.string().trim().min(3, 'Enter the registration number').max(60),
  })
  .strict();

module.exports = { createBody, listQuery, requestBody, decisionBody, requestParams, handoverBody, confirmBody, cancelBody, statusBody, recipientBody };

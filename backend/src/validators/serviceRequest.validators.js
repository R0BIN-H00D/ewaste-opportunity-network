'use strict';
const { z, objectId, optStr, blankToUndefined, pageQuery } = require('./common');
const { SERVICE_REQUEST_STATUS } = require('../config/constants');

const createBody = z
  .object({
    listingId: objectId,
    technicianId: objectId.optional(), // omit to post an open request any suitable technician can accept
    issueDescription: z.string().trim().min(3, 'Describe the problem in a few words').max(2000),
    onSite: z.boolean().optional(),
  })
  .strict();

const listQuery = z
  .object({
    ...pageQuery,
    as: z.enum(['customer', 'technician', 'board']).optional(),
    status: z.enum(SERVICE_REQUEST_STATUS).optional(),
    active: z.enum(['true', 'false']).optional(),
  })
  .strict();

// PUT /:id/status can carry completion photos, so it is multipart and every value arrives as a string.
// Starting delivery may say when the device will be back (returnDate, returnSlot); other moves may not.
const statusBody = z
  .object({
    status: z.enum(SERVICE_REQUEST_STATUS),
    note: optStr(500),
    returnDate: z.preprocess(blankToUndefined, z.coerce.date().optional()),
    returnSlot: optStr(40),
  })
  .strict()
  .refine((o) => o.status === 'device_delivery_pending' || (o.returnDate === undefined && o.returnSlot === undefined), {
    message: 'A return time can only be given when starting delivery',
    path: ['returnDate'],
  })
  .refine((o) => o.returnSlot === undefined || o.returnDate !== undefined, { message: 'Give the return date with the time slot', path: ['returnDate'] });

const money = z.number().min(0).max(10000000);
const quotationBody = z
  .object({
    amount: money,
    breakdown: z.array(z.object({ label: z.string().trim().min(1).max(80), amount: money }).strict()).max(20).optional(),
    parts: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
    etaDays: z.number().int().min(0).max(365).optional(),
    validUntil: z.coerce.date().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

const decisionBody = z
  .object({
    decision: z.enum(['accept', 'reject']),
    reason: z.string().trim().max(500).optional(),
    cancel: z.boolean().optional(), // with "reject": cancel the request instead of asking for a new diagnosis
  })
  .strict()
  .refine((o) => o.decision === 'accept' || (o.reason && o.reason.length >= 3), { message: 'Please give a short reason', path: ['reason'] });

const progressBody = z.object({ note: optStr(1000) }).strict();

const pickupBody = z
  .object({ date: z.coerce.date(), timeSlot: z.string().trim().max(40).optional(), notes: z.string().trim().max(500).optional() })
  .strict();

const handoverBody = z.object({ acknowledgeChecklist: z.boolean().optional() }).strict();
const cancelBody = z.object({ reason: z.string().trim().max(500).optional() }).strict();

const quotationParams = z.object({ id: objectId, qid: objectId }).strict();

module.exports = { createBody, listQuery, statusBody, quotationBody, decisionBody, progressBody, pickupBody, handoverBody, cancelBody, quotationParams };

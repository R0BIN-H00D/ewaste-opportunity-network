'use strict';
const { z, objectId, optNum, optStr, blankToUndefined, pageQuery } = require('./common');
const { RECYCLING_STATUS, MATERIAL_TYPES } = require('../config/constants');
const { SETTABLE } = require('../services/workflow/recycling');

const MAX_REQUEST_PHOTOS = 6;

const centersQuery = z
  .object({
    ...pageQuery,
    q: z.string().trim().min(1).max(100).optional(),
    city: z.string().trim().min(1).max(80).optional(),
    category: z.string().trim().min(1).max(60).optional(), // category slug
  })
  .strict();

// Multipart sends arrays as one JSON string, a comma list, or repeated fields.
const idList = z.preprocess((v) => {
  if (v === '' || v == null) return undefined;
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return String(v).split(',').map((x) => x.trim()).filter(Boolean);
}, z.array(objectId).min(1, 'Choose at least one category').max(10));

const createBody = z
  .object({
    centerId: objectId,
    categories: idList,
    deviceCount: optNum(z.coerce.number().int().min(1, 'At least 1 device').max(500)),
    pickupAddressArea: z.string().trim().min(2, 'Enter the area or locality').max(100),
    pickupAddress: z.string().trim().min(5, 'Enter the full pickup address').max(250),
    preferredDate: z.preprocess(blankToUndefined, z.coerce.date().optional()),
    notes: optStr(500),
    listingId: z.preprocess(blankToUndefined, objectId.optional()),
  })
  .strict();

const date = z.preprocess(blankToUndefined, z.coerce.date().optional());

const listQuery = z
  .object({
    ...pageQuery,
    as: z.enum(['requester', 'center']).optional(),
    status: z.enum(RECYCLING_STATUS).optional(),
    from: date,
    to: date,
  })
  .strict();

const statusBody = z.object({ status: z.enum(SETTABLE), reason: z.string().trim().max(500).optional() }).strict();

const pickupBody = z
  .object({ date: z.coerce.date(), timeSlot: z.string().trim().max(40).optional(), notes: z.string().trim().max(500).optional() })
  .strict();

const confirmBody = z.object({ acknowledgeChecklist: z.boolean().optional() }).strict();

const cancelBody = z.object({ reason: z.string().trim().max(500).optional() }).strict();

const kg = z.number().min(0, 'Weight cannot be negative').max(1000000);
const materialsBody = z
  .object({
    materials: z
      .array(
        z.object({ type: z.enum(MATERIAL_TYPES), actualKg: kg.optional(), estimatedKg: kg.optional() }).strict()
          .refine((m) => m.actualKg !== undefined || m.estimatedKg !== undefined, { message: 'Give an actual or an estimated weight', path: ['actualKg'] }),
      )
      .min(1, 'Add at least one material')
      .max(MATERIAL_TYPES.length)
      .refine((list) => new Set(list.map((m) => m.type)).size === list.length, { message: 'Each material can appear only once' }),
    reportNotes: z.string().trim().max(2000).optional(),
  })
  .strict();

const reportQuery = z
  .object({
    from: date,
    to: date,
    category: z.string().trim().min(1).max(60).optional(),
    format: z.enum(['json', 'csv']).optional(),
  })
  .strict();

const compareQuery = z
  .object({
    city: z.string().trim().min(1).max(80).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    sort: z.enum(['rating', 'measured', 'completed']).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

module.exports = { MAX_REQUEST_PHOTOS, centersQuery, compareQuery, createBody, listQuery, statusBody, pickupBody, confirmBody, cancelBody, materialsBody, reportQuery };

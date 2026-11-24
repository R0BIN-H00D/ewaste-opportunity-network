'use strict';
const { z, objectId, optStr, optNum } = require('./common');
const { CONDITIONS } = require('../config/constants');

// multipart: only words come with the photos.
const analyzeBody = z.object({ text: optStr(1000) }).strict();

const adviceBody = z
  .object({
    listingId: objectId.optional(),
    category: z.string().trim().min(1).max(60).optional(), // ObjectId or slug
    condition: z.enum(CONDITIONS).optional(),
    issue: z.string().trim().max(1000).optional(),
    brand: z.string().trim().max(60).optional(),
    model: z.string().trim().max(80).optional(),
    expectedPrice: optNum(z.coerce.number().min(0).max(10_000_000)),
  })
  .strict()
  .refine((b) => b.listingId || b.issue || b.condition || b.category, { message: 'Describe the device or its problem' });

module.exports = { analyzeBody, adviceBody };

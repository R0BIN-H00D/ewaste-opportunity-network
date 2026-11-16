'use strict';
const { z, objectId, optNum, optStr, blankToUndefined, pageQuery } = require('./common');
const { PRODUCT_CONDITIONS } = require('../config/constants');

const MAX_PRODUCT_PHOTOS = 8;
const SORTS = ['newest', 'price_asc', 'price_desc', 'rating'];

// specs arrive as a JSON object string in multipart forms: {"RAM":"8 GB","Storage":"256 GB SSD"}
const specs = z.preprocess((v) => {
  if (v === undefined || v === '') return undefined;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}, z.record(z.string().trim().min(1).max(40), z.string().trim().min(1).max(100)).refine((o) => Object.keys(o).length <= 20, 'At most 20 specifications').optional());

const idList = z.preprocess((v) => {
  if (v === undefined || v === '') return undefined;
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return [v];
}, z.array(z.string().max(300)).max(MAX_PRODUCT_PHOTOS).optional());

const fields = {
  title: z.string().trim().min(3).max(140),
  category: z.string().trim().min(1).max(60), // ObjectId or slug
  brand: optStr(60),
  model: optStr(60),
  specs,
  condition: z.enum(PRODUCT_CONDITIONS), // the disclosed grade is required (BR-11)
  refurbishmentInfo: z.string().trim().min(10, 'Say what was repaired, replaced or tested (at least 10 characters)').max(2000),
  price: z.coerce.number().min(0).max(10000000),
  stock: z.preprocess(blankToUndefined, z.coerce.number().int().min(0).max(999).optional()),
};

const createBody = z
  .object({ ...fields, stock: z.preprocess(blankToUndefined, z.coerce.number().int().min(1).max(999).default(1)), jobId: z.preprocess(blankToUndefined, objectId.optional()) })
  .strict();

const updateBody = z
  .object({
    ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional ? v.optional() : v])),
    status: z.preprocess(blankToUndefined, z.enum(['active', 'hidden']).optional()),
    removePhotoIds: idList,
  })
  .strict();

const listQuery = z
  .object({
    ...pageQuery,
    q: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    condition: z.enum(PRODUCT_CONDITIONS).optional(),
    minPrice: optNum(z.coerce.number().min(0)),
    maxPrice: optNum(z.coerce.number().min(0)),
    sort: z.enum(SORTS).optional(),
    seller: objectId.optional(),
  })
  .strict()
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, { message: 'The lowest price is above the highest price', path: ['minPrice'] });

const mineQuery = z.object({ ...pageQuery, status: z.enum(['active', 'sold', 'hidden']).optional() }).strict();

const enquiryBody = z.object({ message: z.string().trim().min(5, 'Write a short question for the seller').max(1000) }).strict();

module.exports = { createBody, updateBody, listQuery, mineQuery, enquiryBody, MAX_PRODUCT_PHOTOS, SORTS };

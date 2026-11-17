'use strict';
const { z, objectId, optNum, optStr, blankToUndefined, pageQuery } = require('./common');
const { CONDITIONS, SERVICES, LISTING_STATUS, MAX_DEVICE_PHOTOS } = require('../config/constants');

const thisYear = new Date().getFullYear();
const PICKUP = ['pickup', 'drop_off', 'either'];

const latLng = {
  lat: optNum(z.coerce.number().min(-90).max(90)),
  lng: optNum(z.coerce.number().min(-180).max(180)),
};
const bothOrNone = (o) => (o.lat === undefined) === (o.lng === undefined);
const latLngMsg = { message: 'lat and lng must be provided together', path: ['lat'] };

const fields = {
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(1).max(60), // ObjectId or slug
  brand: optStr(60),
  model: optStr(60),
  purchaseYear: optNum(z.coerce.number().int().min(1990).max(thisYear + 1)),
  condition: z.enum(CONDITIONS),
  description: optStr(2000),
  preferredService: z.enum(SERVICES),
  expectedPrice: optNum(z.coerce.number().min(0)),
  pickupPreference: z.preprocess(blankToUndefined, z.enum(PICKUP).optional()),
  addressArea: optStr(100),
  city: optStr(80),
  ...latLng,
};

// What the person accepted from the AI suggestion, sent back as a JSON string in the multipart form (FR-AI-002). Stored as confirmed.
const aiSuggestion = z.preprocess((v) => {
  if (v === undefined || v === '') return undefined;
  if (typeof v === 'string') {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}, z.object({
  source: z.enum(['gemini', 'rules']),
  category: z.string().trim().max(60).optional(),
  type: z.string().trim().max(60).optional(),
  brand: z.string().trim().max(60).optional(),
  visibleDamage: z.array(z.string().trim().max(100)).max(6).default([]),
  possibleRepairs: z.array(z.string().trim().max(100)).max(6).default([]),
  confidence: z.number().min(0).max(1).optional(),
}).strict().optional());

const createBody = z
  .object({ ...fields, aiSuggestion, status: z.preprocess(blankToUndefined, z.enum(['draft', 'listed']).default('listed')) })
  .strict()
  .refine(bothOrNone, latLngMsg);

// JSON array string ('["a","b"]'), a single id string, or repeated fields -> string[]
const idList = z.preprocess((v) => {
  if (v === undefined || v === '') return undefined;
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim().startsWith('[')) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return [v];
}, z.array(z.string().max(300)).max(MAX_DEVICE_PHOTOS).optional());

const updateBody = z
  .object({
    ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional ? v.optional() : v])),
    status: z.preprocess(blankToUndefined, z.enum(['draft', 'listed', 'withdrawn']).optional()),
    removePhotoIds: idList,
  })
  .strict()
  .refine(bothOrNone, latLngMsg);

const listQuery = z
  .object({
    ...pageQuery,
    q: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    condition: z.enum(CONDITIONS).optional(),
    service: z.enum(SERVICES).optional(),
    city: z.string().trim().min(1).max(80).optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(500).optional(),
    sort: z.enum(['newest', 'oldest', 'price_asc', 'price_desc', 'relevance']).optional(),
    mine: z.enum(['true', 'false']).optional(),
    status: z.enum(LISTING_STATUS).optional(),
  })
  .strict()
  .refine((o) => (o.lat === undefined) === (o.lng === undefined), latLngMsg);

module.exports = { createBody, updateBody, listQuery, objectId };

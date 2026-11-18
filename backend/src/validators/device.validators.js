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

const LETTER = /[A-Za-z]/;
const PLACE = /^[A-Za-z][A-Za-z0-9 .,'()/&-]*$/; // area or locality: starts with a letter, no odd symbols
const CITY = /^[A-Za-z][A-Za-z .'-]*$/;
const MAX_PRICE = 10000000;

// An Indian mobile number: 10 digits starting 6-9. Spaces, dashes, brackets, +91, 91 and a leading 0 are accepted and dropped.
const phoneNumber = z.preprocess((v) => {
  if (typeof v !== 'string') return v;
  let d = v.replace(/[\s\-().]/g, '');
  if (d === '') return undefined;
  if (/^\+91\d{10}$/.test(d)) d = d.slice(3);
  else if (/^91\d{10}$/.test(d)) d = d.slice(2);
  else if (/^0\d{10}$/.test(d)) d = d.slice(1);
  return d;
}, z.string().regex(/^[6-9]\d{9}$/, 'Enter a valid 10-digit mobile number').optional());

const fields = {
  name: z.string().trim().min(3, 'Give the device a name (at least 3 characters)').max(120).regex(LETTER, 'The name must contain letters'),
  category: z.string().trim().min(1).max(60), // ObjectId or slug
  brand: z.preprocess(blankToUndefined, z.string().trim().min(2, 'Enter the brand (at least 2 characters)').max(60).optional()),
  model: z.preprocess(blankToUndefined, z.string().trim().min(1, 'Enter the model').max(60).regex(/[A-Za-z0-9]/, 'The model must contain letters or numbers').optional()),
  modelYear: optNum(z.coerce.number().int().min(1990, 'Enter a year from 1990').max(thisYear, `The year cannot be after ${thisYear}`)),
  purchaseYear: optNum(z.coerce.number().int().min(1990, 'Enter a year from 1990').max(thisYear, `The year cannot be after ${thisYear}`)),
  condition: z.enum(CONDITIONS),
  description: optStr(2000),
  preferredService: z.enum(SERVICES),
  expectedPrice: optNum(z.coerce.number().min(0, 'The price cannot be negative').max(MAX_PRICE, 'That price is too high').refine((n) => Math.round(n * 100) === n * 100 || Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'Use at most 2 decimal places')),
  pickupPreference: z.preprocess(blankToUndefined, z.enum(PICKUP).optional()),
  addressArea: z.preprocess(blankToUndefined, z.string().trim().min(3, 'Enter the area or locality (at least 3 characters)').max(100).regex(PLACE, 'The area must start with a letter and use normal characters').optional()),
  agentPhone: phoneNumber,
  city: z.preprocess(blankToUndefined, z.string().trim().min(2, 'Enter the city').max(80).regex(CITY, 'The city can only have letters').optional()),
  ...latLng,
};

// A draft may be unfinished; anything that goes live needs the details people use to find and judge it.
const MISSING = { brand: 'Enter the brand', model: 'Enter the model', modelYear: 'Enter the model year', purchaseYear: 'Enter the year it was bought', pickupPreference: 'Choose a handover option', addressArea: 'Enter the area or locality', city: 'Enter the city', agentPhone: 'Enter your phone number' };
// The device cannot have been bought before its model came out.
const yearOrder = (o, ctx) => {
  if (o.modelYear !== undefined && o.purchaseYear !== undefined && o.purchaseYear < o.modelYear) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['purchaseYear'], message: `The purchase year cannot be earlier than the model year (${o.modelYear})` });
  }
};
const completeToList = (o, ctx) => {
  yearOrder(o, ctx);
  if (o.status === 'draft') return;
  for (const [field, message] of Object.entries(MISSING)) {
    if (o[field] === undefined) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message });
  }
};

const createBody = z
  .object({ ...fields, status: z.preprocess(blankToUndefined, z.enum(['draft', 'listed']).default('listed')) })
  .strict()
  .refine(bothOrNone, latLngMsg)
  .superRefine(completeToList);

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
  .refine(bothOrNone, latLngMsg)
  .superRefine(yearOrder);

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

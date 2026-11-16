'use strict';
const { z, objectId, pageQuery } = require('./common');

const latLngMsg = { message: 'lat and lng must be provided together', path: ['lat'] };
const bothOrNone = (o) => (o.lat === undefined) === (o.lng === undefined);

const listQuery = z
  .object({
    ...pageQuery,
    q: z.string().trim().min(1).max(100).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    city: z.string().trim().min(1).max(80).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    available: z.enum(['true', 'false']).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lng: z.coerce.number().min(-180).max(180).optional(),
    radiusKm: z.coerce.number().min(1).max(200).optional(),
    sort: z.enum(['rating', 'experience', 'newest', 'distance']).optional(),
  })
  .strict()
  .refine(bothOrNone, latLngMsg);

const nearbyQuery = z
  .object({
    ...pageQuery,
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    radiusKm: z.coerce.number().min(1).max(200).optional(),
    category: z.string().trim().min(1).max(60).optional(),
    sort: z.enum(['rating', 'experience', 'distance']).optional(),
  })
  .strict();

const availabilityBody = z.object({ status: z.enum(['available', 'limited', 'unavailable']) }).strict();

const recommendationQuery = z
  .object({
    listingId: objectId,
    limit: z.coerce.number().int().min(1).max(20).optional(),
  })
  .strict();

module.exports = { listQuery, nearbyQuery, availabilityBody, recommendationQuery };

'use strict';
const { z, objectId, pageQuery } = require('./common');

const star = z.number().int('Use a whole number from 1 to 5').min(1, 'Choose 1 to 5 stars').max(5, 'Choose 1 to 5 stars');

const createBody = z
  .object({
    contextType: z.enum(['service', 'order', 'recycling', 'donation']),
    contextId: objectId,
    rating: star,
    quality: star.optional(),
    communication: star.optional(),
    timeliness: star.optional(),
    comment: z.string().trim().max(1000, 'Keep the review under 1000 characters').optional(),
  })
  .strict();

const listQuery = z.object({ ...pageQuery, target: objectId }).strict();

module.exports = { createBody, listQuery };

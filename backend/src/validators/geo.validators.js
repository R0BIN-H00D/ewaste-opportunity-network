'use strict';
const { z } = require('./common');

const searchQuery = z.object({ q: z.string().trim().min(3).max(120) }).strict();
const reverseQuery = z.object({ lat: z.coerce.number().min(-90).max(90), lng: z.coerce.number().min(-180).max(180) }).strict();

module.exports = { searchQuery, reverseQuery };
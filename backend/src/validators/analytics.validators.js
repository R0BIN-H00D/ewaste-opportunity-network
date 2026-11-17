'use strict';
const { z, pageQuery } = require('./common');

const monthlyQuery = z.object({ months: z.coerce.number().int().min(1).max(36).optional(), scope: z.enum(['platform', 'me']).optional() }).strict();
const scoreQuery = z.object({ ...pageQuery }).strict();

module.exports = { monthlyQuery, scoreQuery };

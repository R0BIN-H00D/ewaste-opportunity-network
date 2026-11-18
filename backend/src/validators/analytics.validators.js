'use strict';
const { z } = require('./common');

const monthlyQuery = z.object({ months: z.coerce.number().int().min(1).max(36).optional(), scope: z.enum(['platform', 'me']).optional() }).strict();
const yearlyQuery = z.object({ years: z.coerce.number().int().min(1).max(10).optional(), scope: z.enum(['platform', 'me']).optional() }).strict();
const categoryQuery = z.object({ scope: z.enum(['platform', 'me']).optional() }).strict();

module.exports = { monthlyQuery, yearlyQuery, categoryQuery };

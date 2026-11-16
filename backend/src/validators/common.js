'use strict';
const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParam = z.object({ id: objectId }).strict();

// multipart/form-data sends every value as a string; empty strings mean "not provided".
const blankToUndefined = (v) => (v === '' || v === null ? undefined : v);
const optNum = (schema) => z.preprocess(blankToUndefined, schema.optional());
const optStr = (max) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const pageQuery = {
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
};

module.exports = { z, objectId, idParam, optNum, optStr, blankToUndefined, pageQuery };

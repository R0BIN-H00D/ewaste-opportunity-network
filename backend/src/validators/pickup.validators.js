'use strict';
const { z, blankToUndefined, pageQuery } = require('./common');

const listQuery = z.object({ ...pageQuery, when: z.preprocess(blankToUndefined, z.enum(['upcoming', 'past']).optional()) }).strict();

module.exports = { listQuery };

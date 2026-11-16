'use strict';
const { z, pageQuery } = require('./common');

const listQuery = z.object({ ...pageQuery, unread: z.enum(['true', 'false']).optional() }).strict();

module.exports = { listQuery };

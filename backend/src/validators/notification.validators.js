'use strict';
const { z, pageQuery } = require('./common');

const listQuery = z.object({ ...pageQuery, unread: z.enum(['true', 'false']).optional() }).strict();

const deviceBody = z.object({ token: z.string().trim().min(20).max(4096), platform: z.enum(['android', 'web']).optional() }).strict();
const deviceRemoveBody = z.object({ token: z.string().trim().min(20).max(4096) }).strict();

module.exports = { listQuery, deviceBody, deviceRemoveBody };

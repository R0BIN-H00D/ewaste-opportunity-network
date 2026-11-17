'use strict';
const { z, objectId, pageQuery } = require('./common');
const { CONTEXT_TYPES } = require('../services/chatContext');

const openBody = z.object({ contextType: z.enum(CONTEXT_TYPES), contextId: objectId }).strict();
const sendBody = z.object({ text: z.string().trim().min(1, 'Write a message first').max(2000) }).strict();
const listQuery = z.object({ ...pageQuery }).strict();
const messagesQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).optional(), before: objectId.optional() }).strict();

module.exports = { openBody, sendBody, listQuery, messagesQuery };

'use strict';
const { z, pageQuery } = require('./common');
const { TOPICS } = require('../models/EducationArticle');

const listQuery = z.object({ ...pageQuery, topic: z.enum(TOPICS).optional(), q: z.string().trim().min(1).max(100).optional() }).strict();

module.exports = { listQuery };
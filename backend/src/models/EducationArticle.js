'use strict';
const { ObjectId, photoSchema, baseSchema, softDelete, model } = require('./_common');

const TOPICS = ['ewaste-problem', 'safe-disposal', 'reuse', 'repair-benefits', 'recycling', 'data-security', 'sustainability'];

const schema = baseSchema({
  title: { type: String, required: true, maxlength: 160 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  topic: { type: String, enum: TOPICS, required: true },
  summary: { type: String, maxlength: 300 },
  body: { type: String, required: true }, // Markdown (sanitised on render)
  cover: photoSchema,
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  publishedAt: Date, // the first time it was published; later edits do not move it
  featured: { type: Boolean, default: false }, // shown first on the learning centre
  author: { type: ObjectId, ref: 'User' },
});
softDelete(schema);
schema.index({ status: 1, topic: 1, createdAt: -1 });

module.exports = model('EducationArticle', schema);
module.exports.TOPICS = TOPICS;

'use strict';
const { ObjectId, baseSchema, model } = require('./_common');

const schema = baseSchema({
  reporter: { type: ObjectId, ref: 'User', required: true },
  targetType: { type: String, enum: ['listing', 'review', 'product', 'user'], required: true },
  targetId: { type: ObjectId, required: true },
  reason: { type: String, enum: ['spam', 'inappropriate', 'fraud', 'unsafe', 'wrong_category', 'other'], required: true },
  details: { type: String, maxlength: 1000 },
  status: { type: String, enum: ['open', 'actioned', 'dismissed'], default: 'open' },
  reviewedBy: { type: ObjectId, ref: 'User' },
  reviewedAt: Date,
  decisionNote: { type: String, maxlength: 500 },
});
schema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true }); // one report per user per target
schema.index({ targetType: 1, targetId: 1 });
schema.index({ status: 1, createdAt: -1 });

module.exports = model('Report', schema);

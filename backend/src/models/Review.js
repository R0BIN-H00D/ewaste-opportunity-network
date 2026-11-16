'use strict';
const { ObjectId, baseSchema, model } = require('./_common');
const { ROLES } = require('../config/constants');

const star = { type: Number, min: 1, max: 5, validate: { validator: Number.isInteger, message: 'must be a whole number' } };

const schema = baseSchema({
  reviewer: { type: ObjectId, ref: 'User', required: true },
  target: { type: ObjectId, ref: 'User', required: true, index: true },
  targetRole: { type: String, enum: Object.values(ROLES), required: true },
  contextType: { type: String, enum: ['service', 'order', 'recycling', 'donation'], required: true },
  contextId: { type: ObjectId, required: true },
  rating: { ...star, required: true },
  quality: star,
  communication: star,
  timeliness: star,
  comment: { type: String, maxlength: 1000 },
  status: { type: String, enum: ['visible', 'hidden', 'removed'], default: 'visible' },
  reportCount: { type: Number, default: 0 },
});
schema.index({ reviewer: 1, contextType: 1, contextId: 1 }, { unique: true }); // one review per transaction (BR-04)

module.exports = model('Review', schema);

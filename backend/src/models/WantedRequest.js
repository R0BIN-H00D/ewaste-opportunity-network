'use strict';
const { ObjectId, baseSchema, model } = require('./_common');
const { CONDITIONS } = require('../config/constants');

// A refurbisher says what kind of device they are looking for, so owners can see what is wanted.
const schema = baseSchema({
  refurbisher: { type: ObjectId, ref: 'User', required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: ObjectId, ref: 'Category' },
  brand: { type: String, trim: true, maxlength: 60 },
  minCondition: { type: String, enum: CONDITIONS },
  quantity: { type: Number, min: 1, max: 1000, default: 1 },
  city: { type: String, trim: true, maxlength: 80 },
  notes: { type: String, trim: true, maxlength: 1000 },
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
});
schema.index({ refurbisher: 1, status: 1, createdAt: -1 });
schema.index({ status: 1, createdAt: -1 });

module.exports = model('WantedRequest', schema);

'use strict';
const { Schema, ObjectId, baseSchema, model } = require('./_common');
const { IMPACT_TYPES } = require('../config/constants');

// Event-sourced: written ONLY on verified completion (BR-05). actual and estimated never mixed (BR-06).
const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: IMPACT_TYPES, required: true },
  refType: { type: String, required: true },
  refId: { type: ObjectId, required: true },
  category: { type: ObjectId, ref: 'Category' },
  devices: { type: Number, default: 1, min: 0 },
  materials: new Schema({ actual: { type: Schema.Types.Mixed, default: {} }, estimated: { type: Schema.Types.Mixed, default: {} } }, { _id: false }),
  co2eEstimate: { type: Number, min: 0 }, // ALWAYS an estimate
  verifiedBy: { type: ObjectId, ref: 'User' },
  verifiedAt: { type: Date, default: Date.now },
  month: { type: Number, min: 1, max: 12 },
  year: Number,
  reversedAt: Date,
});
schema.pre('validate', function setPeriod(next) {
  const d = this.verifiedAt || new Date();
  this.month = d.getUTCMonth() + 1;
  this.year = d.getUTCFullYear();
  next();
});
schema.index({ type: 1, refType: 1, refId: 1 }, { unique: true }); // idempotent
schema.index({ year: 1, month: 1, type: 1 });

module.exports = model('EnvironmentalImpact', schema);

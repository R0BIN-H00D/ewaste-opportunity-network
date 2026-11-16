'use strict';
const { Schema, ObjectId, baseSchema, model } = require('./_common');
const { QUOTATION_STATUS } = require('../config/constants');

const schema = baseSchema({
  serviceRequest: { type: ObjectId, ref: 'ServiceRequest', required: true },
  technician: { type: ObjectId, ref: 'User', required: true },
  version: { type: Number, default: 1, min: 1 },
  amount: { type: Number, required: true, min: 0 },
  breakdown: [new Schema({ label: String, amount: { type: Number, min: 0 } }, { _id: false })],
  parts: [String],
  etaDays: { type: Number, min: 0 },
  validUntil: Date,
  notes: { type: String, maxlength: 1000 },
  status: { type: String, enum: QUOTATION_STATUS, default: 'submitted' },
  decidedAt: Date,
});
schema.index({ serviceRequest: 1, version: 1 }, { unique: true });
schema.index({ technician: 1, status: 1 });

module.exports = model('Quotation', schema);

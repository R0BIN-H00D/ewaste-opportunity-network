'use strict';
const { Schema, ObjectId, photoSchema, baseSchema, model } = require('./_common');
const { COMPLAINT_STATUS } = require('../config/constants');

const schema = baseSchema({
  filedBy: { type: ObjectId, ref: 'User', required: true, index: true },
  against: { type: ObjectId, ref: 'User' },
  refType: { type: String, enum: ['service', 'order', 'listing', 'recycling', 'donation', 'user', 'other'], default: 'other' },
  refId: ObjectId,
  subject: { type: String, required: true, maxlength: 140 },
  description: { type: String, required: true, maxlength: 2000 },
  evidence: [photoSchema],
  status: { type: String, enum: COMPLAINT_STATUS, default: 'open' },
  assignedTo: { type: ObjectId, ref: 'User' },
  resolution: String,
  history: [new Schema({ status: String, at: { type: Date, default: Date.now }, by: { type: ObjectId, ref: 'User' }, note: String }, { _id: false })],
});
schema.index({ status: 1, createdAt: -1 });
schema.index({ assignedTo: 1, status: 1 });

module.exports = model('Complaint', schema);

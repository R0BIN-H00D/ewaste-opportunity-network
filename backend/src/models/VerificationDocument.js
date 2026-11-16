'use strict';
const { ObjectId, baseSchema, privateFileSchema, model } = require('./_common');
const { ROLES, DOC_TYPES } = require('../config/constants');

const schema = baseSchema({
  owner: { type: ObjectId, ref: 'User', required: true, index: true },
  ownerRole: { type: String, enum: Object.values(ROLES), required: true },
  docType: { type: String, enum: DOC_TYPES, required: true },
  file: { type: privateFileSchema, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewedBy: { type: ObjectId, ref: 'User' },
  reviewedAt: Date,
  reason: String,
  submittedAt: { type: Date, default: Date.now },
});
schema.index({ status: 1, submittedAt: 1 });

module.exports = model('VerificationDocument', schema);

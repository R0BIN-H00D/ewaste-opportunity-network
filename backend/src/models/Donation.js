'use strict';
const { Schema, ObjectId, baseSchema, softDelete, model } = require('./_common');
const { DONATION_STATUS } = require('../config/constants');

const schema = baseSchema({
  listing: { type: ObjectId, ref: 'DeviceListing', required: true, index: true },
  donor: { type: ObjectId, ref: 'User', required: true, index: true },
  description: { type: String, maxlength: 1000 },
  status: { type: String, enum: DONATION_STATUS, default: 'open' },
  acceptedRequest: { type: ObjectId, ref: 'DonationRequest' },
  pickup: { type: ObjectId, ref: 'PickupSchedule' },
  confirmation: new Schema({ refNo: { type: String }, issuedAt: Date }, { _id: false }),
  // Each side confirms the handover separately; the donation completes when both have (FR-DON-006).
  confirmations: new Schema({ donorAt: Date, recipientAt: Date, checklistAcknowledgedAt: Date }, { _id: false }),
  cancelReason: { type: String, maxlength: 500 },
  history: [new Schema({ status: String, at: { type: Date, default: Date.now }, by: { type: ObjectId, ref: 'User' }, note: String }, { _id: false })],
});
softDelete(schema);
schema.index({ status: 1, createdAt: -1 });
schema.index({ 'confirmation.refNo': 1 }, { unique: true, sparse: true });

module.exports = model('Donation', schema);

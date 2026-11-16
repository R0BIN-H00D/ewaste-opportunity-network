'use strict';
const { Schema, ObjectId, photoSchema, baseSchema, model } = require('./_common');
const { REFURB_JOB_STATUS } = require('../config/constants');

const schema = baseSchema({
  listing: { type: ObjectId, ref: 'DeviceListing', required: true },
  owner: { type: ObjectId, ref: 'User', required: true },
  refurbisher: { type: ObjectId, ref: 'User', required: true },
  offer: new Schema({ amount: { type: Number, min: 0 }, message: String, status: { type: String, enum: ['pending', 'accepted', 'rejected', 'withdrawn'], default: 'pending' } }, { _id: false }),
  status: { type: String, enum: REFURB_JOB_STATUS, default: 'offered' },
  beforePhotos: [photoSchema],
  afterPhotos: [photoSchema],
  workLog: [new Schema({ text: String, at: { type: Date, default: Date.now } }, { _id: false })],
  product: { type: ObjectId, ref: 'MarketplaceProduct' },
  pickup: { type: ObjectId, ref: 'PickupSchedule' },
  confirmations: new Schema({ ownerAt: Date, refurbisherAt: Date, checklistAcknowledgedAt: Date }, { _id: false }), // handover (BR-12)
  history: [new Schema({ status: String, at: { type: Date, default: Date.now }, by: { type: ObjectId, ref: 'User' }, note: String }, { _id: false })],
  cancelReason: { type: String, maxlength: 500 },
});
schema.index({ refurbisher: 1, status: 1, createdAt: -1 });
schema.index({ listing: 1 });

module.exports = model('RefurbishmentJob', schema);

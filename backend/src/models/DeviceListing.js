'use strict';
const { Schema, ObjectId, point, baseSchema, softDelete, model } = require('./_common');
const { CONDITIONS, SERVICES, LISTING_STATUS } = require('../config/constants');
const { fuzzPoint } = require('../utils/geo');

// title/brand/model/category are denormalised from Device so browse/search needs no join (kept in sync by deviceService).
const schema = baseSchema({
  device: { type: ObjectId, ref: 'Device', required: true, index: true },
  owner: { type: ObjectId, ref: 'User', required: true, index: true },
  category: { type: ObjectId, ref: 'Category', required: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  brand: { type: String, trim: true },
  model: { type: String, trim: true },
  condition: { type: String, enum: CONDITIONS, required: true },
  description: { type: String, trim: true, maxlength: 2000 },
  preferredService: { type: String, enum: SERVICES, required: true },
  expectedPrice: { type: Number, min: 0 },
  pickupPreference: { type: String, enum: ['pickup', 'drop_off', 'either'], default: 'either' },
  location: point, // exact: owner/admin/accepted counterparty only
  publicLocation: point, // fuzzed
  agentPhone: { type: String, maxlength: 15 }, // phone of whoever hands the device over / receives the delivery: owner and admin only
  addressArea: { type: String, maxlength: 100 },
  city: { type: String, maxlength: 80 },
  status: { type: String, enum: LISTING_STATUS, default: 'listed' },
  // active workflow holding the listing (BR-03)
  lockedBy: new Schema({ kind: { type: String }, refId: ObjectId }, { _id: false }),
  // set while an administrator has taken the listing down: what it was before, why, and by whom
  moderation: new Schema({ previousStatus: String, reason: String, by: ObjectId, at: Date }, { _id: false }),
  viewCount: { type: Number, default: 0 },
  reportCount: { type: Number, default: 0 },
});
softDelete(schema);
schema.index({ status: 1, preferredService: 1, createdAt: -1 });
schema.index({ status: 1, category: 1, condition: 1, createdAt: -1 });
schema.index({ owner: 1, status: 1, createdAt: -1 });
schema.index({ expectedPrice: 1 });
schema.index({ location: '2dsphere' });
schema.index(
  { title: 'text', brand: 'text', model: 'text', description: 'text' },
  { weights: { title: 5, brand: 3, model: 3, description: 1 } },
);
schema.pre('validate', function setPublicLocation(next) {
  if (this.isModified('location')) this.publicLocation = this.location ? fuzzPoint(this.location, String(this._id)) : undefined;
  next();
});

module.exports = model('DeviceListing', schema);

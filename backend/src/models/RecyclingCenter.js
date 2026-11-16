'use strict';
const { Schema, ObjectId, point, baseSchema, verificationSchema, model } = require('./_common');

const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true, unique: true },
  name: { type: String, required: true, maxlength: 150 },
  authorizationNo: { type: String, trim: true },
  authorizingBody: String,
  validUntil: Date,
  facilityDetails: { type: String, maxlength: 2000 },
  acceptedCategories: [{ type: ObjectId, ref: 'Category' }],
  collectionLocations: [new Schema({ label: String, addressArea: String, location: point }, { _id: false })],
  operatingHours: String,
  city: String,
  location: point,
  verification: { type: verificationSchema, default: () => ({}) },
  ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0, min: 0 },
  totals: new Schema({ actualKg: { type: Number, default: 0 }, estimatedKg: { type: Number, default: 0 } }, { _id: false }),
});
schema.index({ location: '2dsphere' });
schema.index({ 'verification.status': 1, acceptedCategories: 1 });
// "Authorized" display = verification.status === 'approved' && (!validUntil || validUntil > now); enforced in services.

module.exports = model('RecyclingCenter', schema);

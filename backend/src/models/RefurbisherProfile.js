'use strict';
const { ObjectId, point, baseSchema, verificationSchema, model } = require('./_common');

const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true, unique: true },
  businessName: { type: String, required: true, maxlength: 150 },
  registrationNo: String,
  description: { type: String, maxlength: 1000 },
  categories: [{ type: ObjectId, ref: 'Category' }],
  addressArea: String,
  city: String,
  location: point,
  verification: { type: verificationSchema, default: () => ({}) },
  ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0, min: 0 },
});
schema.index({ location: '2dsphere' });
schema.index({ 'verification.status': 1, categories: 1 });

module.exports = model('RefurbisherProfile', schema);

'use strict';
const { Schema, ObjectId, point, baseSchema, verificationSchema, model } = require('./_common');
const { fuzzPoint } = require('../utils/geo');

const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true, unique: true },
  bio: { type: String, maxlength: 500 },
  addressLine: { type: String, maxlength: 200 }, // PRIVATE: never serialised publicly
  addressArea: { type: String, maxlength: 100 },
  city: { type: String, maxlength: 80 },
  state: { type: String, maxlength: 80 },
  pincode: { type: String, maxlength: 12 },
  location: point, // exact (private)
  publicLocation: point, // fuzzed, derived
  orgProfile: new Schema(
    {
      isOrg: { type: Boolean, default: false },
      orgType: { type: String, enum: ['school', 'college', 'ngo', 'trust', 'company', 'other'] },
      orgName: String,
      registrationNo: String,
      recipientVerification: { type: verificationSchema, default: () => ({}) },
    },
    { _id: false },
  ),
  preferences: new Schema(
    {
      emailNotifications: { type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
      theme: { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
    },
    { _id: false },
  ),
});
schema.index({ location: '2dsphere' });
schema.index({ city: 1 });
schema.pre('validate', function setPublicLocation(next) {
  if (this.isModified('location')) this.publicLocation = this.location ? fuzzPoint(this.location, String(this.user)) : undefined;
  next();
});

module.exports = model('UserProfile', schema);

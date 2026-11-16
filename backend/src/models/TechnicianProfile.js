'use strict';
const { Schema, ObjectId, point, baseSchema, verificationSchema, model } = require('./_common');

const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true, unique: true },
  headline: { type: String, maxlength: 120 },
  experienceYears: { type: Number, min: 0, max: 60, default: 0 },
  qualifications: [new Schema({ title: String, institution: String, year: Number }, { _id: false })],
  specializations: [{ type: String, trim: true }],
  deviceCategories: [{ type: ObjectId, ref: 'Category' }],
  serviceLocation: point,
  serviceAddressArea: String,
  city: String,
  serviceRadiusKm: { type: Number, default: 15, min: 1, max: 200 },
  baseRate: { type: Number, min: 0 }, // INR, estimate basis for matching
  availability: new Schema(
    {
      status: { type: String, enum: ['available', 'limited', 'unavailable'], default: 'available' },
      weekly: [new Schema({ day: { type: Number, min: 0, max: 6 }, from: String, to: String }, { _id: false })],
    },
    { _id: false },
  ),
  verification: { type: verificationSchema, default: () => ({}) },
  ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0, min: 0 },
  completedJobs: { type: Number, default: 0, min: 0 },
  earningsTotal: { type: Number, default: 0, min: 0 },
});
schema.index({ serviceLocation: '2dsphere' });
schema.index({ 'verification.status': 1, deviceCategories: 1 });
schema.index({ ratingAvg: -1 });

module.exports = model('TechnicianProfile', schema);

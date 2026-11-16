'use strict';
const { Schema, ObjectId, baseSchema, verificationSchema, model } = require('./_common');

const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true, unique: true },
  college: { type: String, maxlength: 150 },
  course: { type: String, maxlength: 120 },
  yearOfStudy: { type: Number, min: 1, max: 8 },
  studentIdDoc: { type: ObjectId, ref: 'VerificationDocument' },
  verification: { type: verificationSchema, default: () => ({}) },
  skills: [{ type: String, trim: true }],
  portfolio: [new Schema({ title: String, description: String, application: { type: ObjectId, ref: 'StudentApplication' }, at: Date }, { _id: false })],
  hoursCompleted: { type: Number, default: 0, min: 0 },
});
schema.index({ 'verification.status': 1 });

module.exports = model('StudentProfile', schema);

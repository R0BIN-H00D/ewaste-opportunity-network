'use strict';
const { Schema, ObjectId, photoSchema, baseSchema, model } = require('./_common');
const { ROLES, ACCOUNT_STATUS } = require('../config/constants');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const schema = baseSchema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, match: EMAIL },
  phone: { type: String, trim: true, maxlength: 20 },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: Object.values(ROLES), required: true },
  status: { type: String, enum: Object.values(ACCOUNT_STATUS), default: ACCOUNT_STATUS.ACTIVE },
  emailVerified: { type: Boolean, default: false },
  avatar: { type: photoSchema, default: undefined },
  lastLoginAt: Date,
  failedLogins: { type: Number, default: 0 },
  lockUntil: Date,
  tokenVersion: { type: Number, default: 0 }, // bump to invalidate all access tokens
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  emailVerifyTokenHash: { type: String, select: false },
  emailVerifyExpires: { type: Date, select: false },
  emailVerifyCodeHash: { type: String, select: false }, // the 6-digit code that was emailed (hashed)
  emailVerifyCodeExpires: { type: Date, select: false },
  emailVerifyCodeAttempts: { type: Number, default: 0, select: false },
  suspension: new Schema({ reason: String, by: { type: ObjectId, ref: 'User' }, at: Date }, { _id: false }),
});
schema.index({ role: 1, status: 1 });
schema.index({ name: 1 });

module.exports = model('User', schema);

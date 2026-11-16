'use strict';
const { ObjectId, baseSchema, model } = require('./_common');

const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  family: { type: String, required: true, index: true }, // reuse of a rotated token revokes the family
  device: String,
  ip: String,
  expiresAt: { type: Date, required: true },
  revokedAt: Date,
  replacedBy: { type: ObjectId, ref: 'RefreshToken' },
});
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL

module.exports = model('RefreshToken', schema);

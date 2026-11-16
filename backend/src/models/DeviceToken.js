'use strict';
const { ObjectId, baseSchema, model } = require('./_common');

const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true, index: true },
  fcmToken: { type: String, required: true, unique: true },
  platform: { type: String, enum: ['android', 'web'], default: 'android' },
  lastSeenAt: { type: Date, default: Date.now },
});

module.exports = model('DeviceToken', schema);

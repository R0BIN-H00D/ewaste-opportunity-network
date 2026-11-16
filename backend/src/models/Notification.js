'use strict';
const { Schema, ObjectId, baseSchema, model } = require('./_common');

const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true },
  type: { type: String, required: true }, // e.g. quotation.new (see design.md A.10)
  title: { type: String, required: true, maxlength: 120 },
  body: { type: String, maxlength: 400 },
  data: { type: Schema.Types.Mixed, default: {} }, // { type, id, deepLink }
  readAt: Date,
  channels: new Schema({ inApp: { type: Boolean, default: true }, push: Boolean, email: Boolean }, { _id: false }),
});
schema.index({ user: 1, readAt: 1, createdAt: -1 });

module.exports = model('Notification', schema);

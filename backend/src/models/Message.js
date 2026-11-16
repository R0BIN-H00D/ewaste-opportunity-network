'use strict';
const { Schema, ObjectId, baseSchema, model } = require('./_common');

const schema = baseSchema({
  conversation: { type: ObjectId, ref: 'Conversation', required: true },
  sender: { type: ObjectId, ref: 'User', required: true },
  text: { type: String, trim: true, maxlength: 2000 },
  attachments: [new Schema({ url: String, publicId: String, mime: String, bytes: Number, name: String }, { _id: false })],
  readBy: [new Schema({ user: { type: ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }, { _id: false })],
});
schema.path('text').validate(function hasContent(v) {
  return Boolean(v) || (this.attachments && this.attachments.length > 0);
}, 'A message needs text or an attachment');
schema.index({ conversation: 1, createdAt: -1 });

module.exports = model('Message', schema);

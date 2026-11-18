'use strict';
const { Schema, ObjectId, baseSchema, model } = require('./_common');

const schema = baseSchema({
  participants: {
    type: [{ type: ObjectId, ref: 'User' }],
    validate: { validator: (v) => v.length === 2 && String(v[0]) !== String(v[1]), message: 'A conversation has exactly two distinct participants' },
  },
  participantsKey: { type: String, required: true }, // sorted "idA:idB" for uniqueness
  contextType: { type: String, enum: ['service', 'order', 'recycling', 'donation', 'offer', 'enquiry', 'wanted'], required: true },
  contextId: { type: ObjectId, required: true },
  lastMessage: new Schema({ text: String, at: Date, sender: { type: ObjectId, ref: 'User' } }, { _id: false }),
  unread: { type: Map, of: Number, default: {} }, // userId -> count
});
schema.pre('validate', function setKey(next) {
  if (this.participants?.length === 2) this.participantsKey = this.participants.map(String).sort().join(':');
  next();
});
schema.index({ contextType: 1, contextId: 1, participantsKey: 1 }, { unique: true });
schema.index({ participants: 1, updatedAt: -1 });

module.exports = model('Conversation', schema);

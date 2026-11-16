'use strict';
const { ObjectId, baseSchema, model } = require('./_common');

const schema = baseSchema({
  user: { type: ObjectId, ref: 'User', required: true },
  eventRef: { type: String, required: true }, // e.g. "repair:<serviceRequestId>"
  points: { type: Number, required: true }, // negative for reversals
  rule: { type: String, required: true },
});
schema.index({ user: 1, eventRef: 1 }, { unique: true }); // idempotent
schema.index({ user: 1, createdAt: -1 });

module.exports = model('GreenScoreLedger', schema);

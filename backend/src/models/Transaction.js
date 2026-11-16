'use strict';
const { ObjectId, baseSchema, model } = require('./_common');

// Records only. The platform never processes money (BR-10).
const schema = baseSchema({
  type: { type: String, enum: ['repair', 'order', 'refurb_purchase', 'donation', 'recycling'], required: true },
  refType: { type: String, required: true },
  refId: { type: ObjectId, required: true },
  payer: { type: ObjectId, ref: 'User' },
  payee: { type: ObjectId, ref: 'User' },
  amount: { type: Number, default: 0, min: 0 },
  method: { type: String, enum: ['cod', 'offline'], default: 'offline' },
  reference: { type: String, maxlength: 100 },
  status: { type: String, enum: ['recorded', 'confirmed', 'disputed'], default: 'recorded' },
  confirmedBy: { type: ObjectId, ref: 'User' },
});
schema.index({ payer: 1, createdAt: -1 });
schema.index({ payee: 1, createdAt: -1 });
schema.index({ refType: 1, refId: 1 });

module.exports = model('Transaction', schema);

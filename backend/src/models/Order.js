'use strict';
const { Schema, ObjectId, baseSchema, model } = require('./_common');
const { ORDER_STATUS } = require('../config/constants');

const schema = baseSchema({
  product: { type: ObjectId, ref: 'MarketplaceProduct', required: true },
  buyer: { type: ObjectId, ref: 'User', required: true },
  seller: { type: ObjectId, ref: 'User', required: true },
  quantity: { type: Number, default: 1, min: 1 },
  priceAtOrder: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ORDER_STATUS, default: 'placed' },
  paymentMethod: { type: String, enum: ['cod', 'offline'], default: 'cod' }, // no gateway (BR-10)
  paymentStatus: { type: String, enum: ['unpaid', 'paid_offline', 'confirmed'], default: 'unpaid' },
  deliveryArea: String,
  notes: { type: String, maxlength: 500 },
  cancelReason: { type: String, maxlength: 500 },
  reviewed: { type: Boolean, default: false }, // the buyer has reviewed the seller for this order (BR-04)
  statusHistory: [new Schema({ status: String, at: { type: Date, default: Date.now }, by: { type: ObjectId, ref: 'User' }, note: String }, { _id: false })],
});
schema.index({ buyer: 1, createdAt: -1 });
schema.index({ seller: 1, status: 1, createdAt: -1 });

module.exports = model('Order', schema);

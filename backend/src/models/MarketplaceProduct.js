'use strict';
const { Schema, ObjectId, photoSchema, baseSchema, softDelete, model } = require('./_common');
const { PRODUCT_STATUS, PRODUCT_CONDITIONS, CONDITION_PARTS } = require('../config/constants');

const schema = baseSchema({
  seller: { type: ObjectId, ref: 'User', required: true, index: true },
  refurbishmentJob: { type: ObjectId, ref: 'RefurbishmentJob' },
  title: { type: String, required: true, trim: true, maxlength: 140 },
  category: { type: ObjectId, ref: 'Category', required: true },
  brand: { type: String, trim: true },
  model: { type: String, trim: true },
  specs: { type: Schema.Types.Mixed, default: {} },
  condition: { type: String, enum: PRODUCT_CONDITIONS, required: true }, // disclosed grade (BR-11)
  refurbishmentInfo: { type: String, required: true, maxlength: 2000 },
  // How each part is doing (working condition, battery, screen, scratches, ...), each from a short list: shown to buyers in
  // "About this device". Optional, with the seller's own extra remarks beside it.
  conditionDetails: new Schema(Object.fromEntries(Object.entries(CONDITION_PARTS).map(([part, values]) => [part, { type: String, enum: values }])), { _id: false }),
  conditionNote: { type: String, trim: true, maxlength: 1000 },
  price: { type: Number, required: true, min: 0 },
  stock: { type: Number, default: 1, min: 0 },
  photos: { type: [photoSchema], validate: { validator: (v) => v.length <= 8, message: 'At most 8 photos' } },
  status: { type: String, enum: PRODUCT_STATUS, default: 'active' },
  isRefurbished: { type: Boolean, default: true, immutable: true }, // always labelled Refurbished (BR-11)
  ratingAvg: { type: Number, default: 0 },
  ratingCount: { type: Number, default: 0 },
});
softDelete(schema);
schema.index({ status: 1, category: 1, price: 1 });
schema.index({ title: 'text', brand: 'text', model: 'text' });

module.exports = model('MarketplaceProduct', schema);

'use strict';
const { Schema, ObjectId, photoSchema, baseSchema, softDelete, model } = require('./_common');
const { MAX_DEVICE_PHOTOS } = require('../config/constants');

const schema = baseSchema({
  owner: { type: ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  category: { type: ObjectId, ref: 'Category', required: true, index: true },
  brand: { type: String, trim: true, maxlength: 60 },
  model: { type: String, trim: true, maxlength: 60 },
  purchaseYear: { type: Number, min: 1990 },
  ageYears: { type: Number, min: 0 },
  specs: { type: Schema.Types.Mixed, default: {} },
  photos: {
    type: [photoSchema],
    default: [],
    validate: { validator: (v) => v.length <= MAX_DEVICE_PHOTOS, message: `A device can have at most ${MAX_DEVICE_PHOTOS} photos` },
  },
  aiSuggestion: new Schema(
    {
      category: String,
      type: { type: String },
      brand: String,
      visibleDamage: [String],
      possibleRepairs: [String],
      confidence: Number,
      source: { type: String, enum: ['gemini', 'rules'] },
      confirmedByUser: { type: Boolean, default: false },
    },
    { _id: false },
  ),
});
softDelete(schema);
schema.pre('validate', function computeAge(next) {
  const year = new Date().getFullYear();
  if (this.purchaseYear && this.purchaseYear > year + 1) return next(new Error('purchaseYear cannot be in the future'));
  if (this.purchaseYear) this.ageYears = Math.max(year - this.purchaseYear, 0);
  return next();
});

module.exports = model('Device', schema);

'use strict';
const { Schema, baseSchema, model } = require('./_common');

const schema = baseSchema({
  name: { type: String, required: true, unique: true, trim: true },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  icon: { type: String, default: 'box' }, // Lucide icon name (same glyph set on web + Flutter)
  group: String,
  hazardous: { type: Boolean, default: false }, // excludes student tasks (BR-07)
  // PLACEHOLDER estimates until sourced values are agreed (A-11): { copperKg, aluminiumKg, ironKg, plasticsKg, glassKg, otherKg, co2eKg }
  defaultMaterialFactors: { type: Schema.Types.Mixed, default: {} },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
});
schema.index({ active: 1, order: 1 });

module.exports = model('Category', schema);

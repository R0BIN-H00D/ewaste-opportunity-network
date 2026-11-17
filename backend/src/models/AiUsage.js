'use strict';
const { baseSchema, model } = require('./_common');

// One row per UTC day: how many photo classifications were sent to Gemini, so the free-tier limit holds across restarts and servers.
const schema = baseSchema({
  day: { type: String, required: true, unique: true }, // YYYY-MM-DD
  count: { type: Number, default: 0, min: 0 },
});

module.exports = model('AiUsage', schema);
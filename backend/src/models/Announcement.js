'use strict';
const { ObjectId, baseSchema, model } = require('./_common');
const { ROLES } = require('../config/constants');

const schema = baseSchema({
  title: { type: String, required: true, maxlength: 140 },
  body: { type: String, required: true, maxlength: 2000 },
  audience: { type: [{ type: String, enum: [...Object.values(ROLES), 'all'] }], default: ['all'] },
  startsAt: { type: Date, default: Date.now },
  endsAt: Date,
  createdBy: { type: ObjectId, ref: 'User', required: true },
});
schema.index({ startsAt: 1, endsAt: 1 });

module.exports = model('Announcement', schema);

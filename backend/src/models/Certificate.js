'use strict';
const { ObjectId, privateFileSchema, baseSchema, model } = require('./_common');

const schema = baseSchema({
  student: { type: ObjectId, ref: 'User', required: true, index: true },
  application: { type: ObjectId, ref: 'StudentApplication', required: true, unique: true },
  certNo: { type: String, required: true, unique: true },
  issuedBy: { type: ObjectId, ref: 'User', required: true },
  issuedAt: { type: Date, default: Date.now },
  file: privateFileSchema,
});

module.exports = model('Certificate', schema);

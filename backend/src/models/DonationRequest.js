'use strict';
const { ObjectId, baseSchema, model } = require('./_common');
const { DONATION_REQUEST_STATUS } = require('../config/constants');

const schema = baseSchema({
  donation: { type: ObjectId, ref: 'Donation', required: true },
  requester: { type: ObjectId, ref: 'User', required: true }, // verified recipient organisation (A-02)
  justification: { type: String, required: true, maxlength: 1000 },
  intendedUse: { type: String, maxlength: 500 },
  status: { type: String, enum: DONATION_REQUEST_STATUS, default: 'pending' },
  decidedAt: Date,
});
schema.index({ donation: 1, requester: 1 }, { unique: true });
schema.index({ requester: 1, status: 1 });

module.exports = model('DonationRequest', schema);

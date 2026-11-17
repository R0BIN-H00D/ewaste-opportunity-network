'use strict';
const { Schema, ObjectId, baseSchema, model } = require('./_common');
const { PICKUP_STATUS } = require('../config/constants');

const schema = baseSchema({
  contextType: { type: String, enum: ['service', 'donation', 'recycling', 'offer'], required: true },
  contextId: { type: ObjectId, required: true },
  requester: { type: ObjectId, ref: 'User', required: true },
  provider: { type: ObjectId, ref: 'User', required: true },
  date: { type: Date, required: true },
  timeSlot: { type: String, maxlength: 40 }, // e.g. "10:00-12:00"
  addressArea: String,
  exactAddressShared: { type: Boolean, default: false }, // BR-08
  status: { type: String, enum: PICKUP_STATUS, default: 'requested' },
  proposedBy: { type: ObjectId, ref: 'User' }, // who set or last changed the time; the other side confirms it
  rescheduleCount: { type: Number, default: 0, max: 3 },
  handoverConfirmed: new Schema({ byOwner: Date, byProvider: Date }, { _id: false }),
  checklistAcknowledgedAt: Date, // data-protection checklist (NFR-SEC-14)
  notes: { type: String, maxlength: 500 },
});
schema.index({ contextType: 1, contextId: 1 });
schema.index({ provider: 1, date: 1, status: 1 });
schema.index({ requester: 1, date: -1 });

module.exports = model('PickupSchedule', schema);

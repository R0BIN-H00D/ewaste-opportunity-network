'use strict';
const { Schema, ObjectId, point, photoSchema, baseSchema, model } = require('./_common');
const { RECYCLING_STATUS, MATERIAL_TYPES } = require('../config/constants');

// actualKg (measured) and estimatedKg are separate fields and never merged (BR-06).
const material = new Schema(
  {
    type: { type: String, enum: MATERIAL_TYPES, required: true },
    actualKg: { type: Number, min: 0 },
    estimatedKg: { type: Number, min: 0 },
    measuredBy: { type: ObjectId, ref: 'User' },
    measuredAt: Date,
  },
  { _id: false },
);

const schema = baseSchema({
  listing: { type: ObjectId, ref: 'DeviceListing' },
  requester: { type: ObjectId, ref: 'User', required: true },
  center: { type: ObjectId, ref: 'RecyclingCenter', required: true },
  categories: [{ type: ObjectId, ref: 'Category' }],
  deviceCount: { type: Number, default: 1, min: 1 },
  photos: [photoSchema],
  pickupLocation: point, // private
  pickupAddressArea: String,
  status: { type: String, enum: RECYCLING_STATUS, default: 'requested' },
  pickup: { type: ObjectId, ref: 'PickupSchedule' },
  handover: new Schema({ byUser: Date, byCenter: Date }, { _id: false }),
  receivedAt: Date,
  materials: [material],
  reportNotes: String,
  refNo: { type: String, unique: true, sparse: true }, // e.g. REC-2026-7K2QXM, shown to both sides
  pickupAddress: { type: String, maxlength: 250 }, // exact address: private, the centre sees it only until collection (BR-08)
  preferredDate: Date,
  notes: { type: String, maxlength: 500 },
  checklistAcknowledgedAt: Date, // data-protection checklist ticked by the requester (BR-12)
  completedAt: Date,
  cancelReason: { type: String, maxlength: 500 },
  history: [new Schema({ status: String, at: { type: Date, default: Date.now }, by: { type: ObjectId, ref: 'User' }, note: String }, { _id: false })],
});
schema.index({ center: 1, status: 1, createdAt: -1 });
schema.index({ requester: 1, createdAt: -1 });

module.exports = model('RecyclingRecord', schema);

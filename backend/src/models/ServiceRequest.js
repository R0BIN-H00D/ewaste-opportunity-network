'use strict';
const { Schema, ObjectId, photoSchema, baseSchema, model } = require('./_common');
const { SERVICE_REQUEST_STATUS } = require('../config/constants');

const historyEntry = new Schema(
  { status: String, by: { type: ObjectId, ref: 'User' }, at: { type: Date, default: Date.now }, note: String, photos: [photoSchema] },
  { _id: false },
);

const schema = baseSchema({
  listing: { type: ObjectId, ref: 'DeviceListing', required: true, index: true },
  customer: { type: ObjectId, ref: 'User', required: true },
  technician: { type: ObjectId, ref: 'User' },
  mode: { type: String, enum: ['targeted', 'open'], default: 'targeted' },
  invitedTechnicians: [{ type: ObjectId, ref: 'User' }],
  issueDescription: { type: String, maxlength: 2000 },
  onSite: { type: Boolean, default: false },
  status: { type: String, enum: SERVICE_REQUEST_STATUS, default: 'request_submitted' },
  statusHistory: [historyEntry],
  diagnosisNotes: String,
  repairNotes: [new Schema({ text: String, by: { type: ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }, { _id: false })],
  progressPhotos: [photoSchema],
  // Each progress update as one item, so its photos stay with its note (repairNotes/progressPhotos keep the flat lists).
  progressUpdates: [new Schema({ text: String, photos: [photoSchema], by: { type: ObjectId, ref: 'User' }, at: { type: Date, default: Date.now } }, { _id: false })],
  completionPhotos: [photoSchema],
  activeQuotation: { type: ObjectId, ref: 'Quotation' },
  pickup: { type: ObjectId, ref: 'PickupSchedule' },
  // When the technician expects to bring the device back, set as delivery starts (optional).
  returnSchedule: new Schema({ date: Date, timeSlot: String }, { _id: false }),
  handover: new Schema(
    {
      collect: new Schema({ byOwner: Date, byProvider: Date, checklistAcknowledgedAt: Date }, { _id: false }),
      delivery: new Schema({ byOwner: Date, byProvider: Date }, { _id: false }),
    },
    { _id: false },
  ),
  customerConfirmedAt: Date,
  reviewed: { type: Boolean, default: false },
  studentAssignments: [{ type: ObjectId, ref: 'StudentApplication' }],
});
schema.index({ customer: 1, status: 1, createdAt: -1 });
schema.index({ technician: 1, status: 1, createdAt: -1 });
schema.index({ status: 1, mode: 1, createdAt: -1 });

module.exports = model('ServiceRequest', schema);

'use strict';
const { Schema, ObjectId, baseSchema, model } = require('./_common');
const { APPLICATION_STATUS } = require('../config/constants');

const schema = baseSchema({
  opportunity: { type: ObjectId, ref: 'LearningOpportunity', required: true },
  student: { type: ObjectId, ref: 'User', required: true },
  message: { type: String, maxlength: 500 },
  status: { type: String, enum: APPLICATION_STATUS, default: 'applied' },
  supervisorFeedback: { type: String, maxlength: 1000 },
  hours: { type: Number, min: 0, default: 0 },
  startedAt: Date,
  completedAt: Date,
  history: [new Schema({ status: String, at: Date, by: { type: ObjectId, ref: 'User' }, note: String }, { _id: false })],
});
schema.index({ opportunity: 1, student: 1 }, { unique: true });
schema.index({ student: 1, status: 1 });

module.exports = model('StudentApplication', schema);

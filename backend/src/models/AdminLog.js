'use strict';
const { Schema, ObjectId, baseSchema, model } = require('./_common');

// Insert-only audit trail (NFR-SEC-11). Updates/deletes are blocked at the model level.
const schema = baseSchema({
  admin: { type: ObjectId, ref: 'User', required: true, index: true },
  action: { type: String, required: true },
  targetType: String,
  targetId: ObjectId,
  before: Schema.Types.Mixed,
  after: Schema.Types.Mixed,
  reason: String,
  ip: String,
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ createdAt: -1 });
schema.index({ targetType: 1, targetId: 1 });

const block = function blockMutation(next) { next(new Error('AdminLog is insert-only')); };
['updateOne', 'updateMany', 'findOneAndUpdate', 'findOneAndDelete', 'deleteOne', 'deleteMany', 'replaceOne'].forEach((op) => schema.pre(op, block));
schema.pre('save', function blockResave(next) { return this.isNew ? next() : next(new Error('AdminLog is insert-only')); });

module.exports = model('AdminLog', schema);

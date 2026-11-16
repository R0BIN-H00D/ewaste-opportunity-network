'use strict';
const mongoose = require('mongoose');
const { VERIFICATION_STATUS } = require('../config/constants');

const { Schema } = mongoose;
const { ObjectId } = Schema.Types;

// GeoJSON Point. Fields using it set `default: undefined` so documents without a location
// don't carry an invalid empty point (which breaks 2dsphere indexes).
const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 2 && v[0] >= -180 && v[0] <= 180 && v[1] >= -90 && v[1] <= 90,
        message: 'coordinates must be [lng, lat]',
      },
    },
  },
  { _id: false },
);
const point = { type: pointSchema, default: undefined };

const photoSchema = new Schema(
  { url: { type: String, required: true }, publicId: { type: String, required: true }, bytes: Number, mime: String },
  { _id: false },
);

// Private files (verification docs) never store a public URL.
const privateFileSchema = new Schema(
  {
    publicId: { type: String, required: true },
    storage: { type: String, enum: ['cloudinary', 'local'], required: true },
    bytes: Number,
    mime: String,
    originalName: String,
  },
  { _id: false },
);

const verificationSchema = new Schema(
  {
    status: { type: String, enum: VERIFICATION_STATUS, default: 'not_submitted' },
    reviewedBy: { type: ObjectId, ref: 'User' },
    reviewedAt: Date,
    reason: String,
  },
  { _id: false },
);

const SENSITIVE_FIELDS = ['passwordHash', 'tokenHash', 'passwordResetTokenHash', 'passwordResetExpires', 'emailVerifyTokenHash', 'emailVerifyExpires'];

/** All schemas: timestamps, no __v, sensitive fields stripped from JSON. */
function baseSchema(definition, options = {}) {
  const schema = new Schema(definition, { timestamps: true, versionKey: false, ...options });
  schema.set('toJSON', {
    versionKey: false,
    transform(_doc, ret) {
      for (const f of SENSITIVE_FIELDS) delete ret[f];
      return ret;
    },
  });
  return schema;
}

/** Soft delete: adds deletedAt, hides deleted docs from queries unless `.setOptions({ withDeleted: true })`. */
function softDelete(schema) {
  schema.add({ deletedAt: { type: Date, default: null, index: true } });
  const hide = function hideDeleted(next) {
    if (!this.getOptions().withDeleted) this.where({ deletedAt: null });
    next();
  };
  ['find', 'findOne', 'findOneAndUpdate', 'countDocuments', 'updateOne', 'updateMany'].forEach((op) => schema.pre(op, hide));
  schema.methods.softDelete = function softDeleteDoc() {
    this.deletedAt = new Date();
    return this.save();
  };
  // NOTE: aggregate() pipelines are NOT auto-filtered; include { deletedAt: null } in $match explicitly.
}

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = { mongoose, Schema, ObjectId, point, pointSchema, photoSchema, privateFileSchema, verificationSchema, baseSchema, softDelete, model };

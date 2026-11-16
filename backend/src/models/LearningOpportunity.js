'use strict';
const { ObjectId, point, baseSchema, softDelete, model } = require('./_common');

const schema = baseSchema({
  postedBy: { type: ObjectId, ref: 'User', required: true, index: true }, // verified technician (supervisor)
  title: { type: String, required: true, maxlength: 140 },
  description: { type: String, maxlength: 2000 },
  deviceType: { type: ObjectId, ref: 'Category' },
  requiredSkills: [String],
  difficulty: { type: String, enum: ['beginner', 'intermediate', 'advanced'], default: 'beginner' },
  location: point,
  locationArea: String,
  deadline: { type: Date, required: true },
  seats: { type: Number, default: 1, min: 1 },
  expectedHours: { type: Number, min: 1, max: 200 },
  status: { type: String, enum: ['open', 'closed', 'filled'], default: 'open' },
  linkedServiceRequest: { type: ObjectId, ref: 'ServiceRequest' },
  // BR-07: students never independently handle hazardous e-waste; this must always be true.
  hazardousExcluded: { type: Boolean, default: true, validate: { validator: (v) => v === true, message: 'Student tasks must exclude hazardous handling' } },
});
softDelete(schema);
schema.index({ status: 1, deadline: 1 });
schema.index({ location: '2dsphere' });

module.exports = model('LearningOpportunity', schema);

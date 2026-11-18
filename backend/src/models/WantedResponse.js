'use strict';
const { ObjectId, baseSchema, model } = require('./_common');

// Someone (a device owner or technician) who is interested in a refurbisher's wanted-device request.
const schema = baseSchema({
  request: { type: ObjectId, ref: 'WantedRequest', required: true },
  responder: { type: ObjectId, ref: 'User', required: true },
  refurbisher: { type: ObjectId, ref: 'User' }, // the request's owner, so the live feed can tell them when someone accepts
  message: { type: String, trim: true, maxlength: 1000 },
});
schema.index({ request: 1, responder: 1 }, { unique: true });
schema.index({ responder: 1, createdAt: -1 });

module.exports = model('WantedResponse', schema);

'use strict';
const { z, optStr } = require('./common');

// Multipart text fields next to the optional photo.
const classifyBody = z.object({ title: optStr(120), description: optStr(2000) }).strict();

module.exports = { classifyBody };
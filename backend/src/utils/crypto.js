'use strict';
const crypto = require('crypto');

/** Opaque URL-safe random token (256-bit by default). Only its sha256 is ever stored. */
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

module.exports = { randomToken, sha256 };

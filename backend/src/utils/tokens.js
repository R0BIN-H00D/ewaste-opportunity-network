'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');

/** Short-lived access token. `tv` = user.tokenVersion so tokens can be revoked en masse. */
function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id || user.id), role: user.role, tv: user.tokenVersion || 0 }, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_ACCESS_TTL,
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] });
}

module.exports = { signAccessToken, verifyAccessToken };

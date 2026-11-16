'use strict';
const pino = require('pino');
const env = require('../config/env');

module.exports = pino({
  level: env.isTest ? 'silent' : env.isProd ? 'info' : 'debug',
  redact: ['req.headers.authorization', 'req.headers.cookie', 'password', 'passwordHash', 'token'],
});

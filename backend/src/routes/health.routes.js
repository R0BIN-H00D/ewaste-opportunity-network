'use strict';
const router = require('express').Router();
const mongoose = require('mongoose');
const env = require('../config/env');
const { ok } = require('../utils/response');

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

router.get('/', (_req, res) =>
  ok(res, {
    status: 'ok',
    uptime: Math.round(process.uptime() * 10) / 10,
    env: env.NODE_ENV,
    db: DB_STATES[mongoose.connection.readyState] || 'unknown',
  }),
);

module.exports = router;

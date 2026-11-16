'use strict';
const { ZodError } = require('zod');
const env = require('../config/env');
const logger = require('../utils/logger');
const ApiError = require('../utils/ApiError');

// Central error handler. Never leaks stack traces in production.
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, _next) => {
  let e = err;

  if (e instanceof ZodError) {
    e = ApiError.validation(e.issues.map((i) => ({ field: i.path.join('.'), message: i.message })));
  } else if (e?.name === 'CastError') {
    e = ApiError.badRequest(`Invalid ${e.path}`);
  } else if (e?.name === 'ValidationError' && e.errors) {
    e = ApiError.validation(Object.values(e.errors).map((x) => ({ field: x.path, message: x.message })));
  } else if (e?.code === 11000) {
    e = ApiError.conflict('Duplicate value', 'DUPLICATE');
  } else if (e?.name === 'JsonWebTokenError' || e?.name === 'TokenExpiredError') {
    e = ApiError.unauthorized('Invalid or expired token');
  } else if (e?.type === 'entity.parse.failed') {
    e = ApiError.badRequest('Malformed JSON body');
  } else if (e?.type === 'entity.too.large') {
    e = new ApiError(413, 'Payload too large', 'PAYLOAD_TOO_LARGE');
  }

  const status = e.statusCode || 500;
  if (status >= 500) logger.error({ err, path: req.originalUrl }, 'Unhandled error');

  res.status(status).json({
    success: false,
    message: status >= 500 && env.isProd ? 'Internal server error' : e.message || 'Internal server error',
    code: e.code || 'INTERNAL_ERROR',
    ...(e.errors ? { errors: e.errors } : {}),
    ...(!env.isProd && status >= 500 ? { stack: e.stack } : {}),
  });
};

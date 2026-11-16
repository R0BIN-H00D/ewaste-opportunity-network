'use strict';
const ApiError = require('../utils/ApiError');

// validate({ body, query, params }) with Zod schemas (use .strict() to reject unknown fields).
module.exports = (schemas) => (req, _res, next) => {
  const errors = [];
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const result = schemas[part].safeParse(req[part]);
    if (result.success) {
      req[part] = result.data;
    } else {
      for (const issue of result.error.issues) {
        errors.push({ field: [part, ...issue.path].join('.'), message: issue.message });
      }
    }
  }
  return errors.length ? next(ApiError.validation(errors)) : next();
};

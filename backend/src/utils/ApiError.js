'use strict';
class ApiError extends Error {
  constructor(statusCode, message, code = 'ERROR', errors) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.errors = errors;
    this.isOperational = true;
  }
  static badRequest(msg = 'Bad request', errors) { return new ApiError(400, msg, 'BAD_REQUEST', errors); }
  static unauthorized(msg = 'Authentication required') { return new ApiError(401, msg, 'UNAUTHORIZED'); }
  static forbidden(msg = 'Forbidden', code = 'FORBIDDEN') { return new ApiError(403, msg, code); }
  static notFound(msg = 'Not found') { return new ApiError(404, msg, 'NOT_FOUND'); }
  static conflict(msg = 'Conflict', code = 'CONFLICT') { return new ApiError(409, msg, code); }
  static validation(errors, msg = 'Validation failed') { return new ApiError(422, msg, 'VALIDATION_ERROR', errors); }
}
module.exports = ApiError;

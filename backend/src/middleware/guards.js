'use strict';
const { isValidObjectId } = require('mongoose');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');

/** Param must be a valid ObjectId, otherwise 404 (avoids CastError noise and enumeration hints). */
const validObjectIdParam = (param = 'id') => (req, _res, next) =>
  isValidObjectId(req.params[param]) ? next() : next(ApiError.notFound('Resource not found'));

/**
 * Loads a document and requires the caller to own it (or be admin). Sets req[key] = document.
 * Use for mutating routes. Always run after `authenticate`.
 */
const requireOwner = (Model, { param = 'id', ownerField = 'owner', key = 'resource', allowAdmin = true } = {}) =>
  asyncHandler(async (req, _res, next) => {
    if (!isValidObjectId(req.params[param])) throw ApiError.notFound('Resource not found');
    const doc = await Model.findById(req.params[param]);
    if (!doc) throw ApiError.notFound('Resource not found');
    const isOwner = String(doc[ownerField]) === String(req.user.id);
    if (!isOwner && !(allowAdmin && req.user.role === 'admin')) throw ApiError.forbidden('You do not have access to this resource');
    req[key] = doc;
    next();
  });

module.exports = { validObjectIdParam, requireOwner };

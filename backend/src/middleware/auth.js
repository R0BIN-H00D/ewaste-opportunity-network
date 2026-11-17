'use strict';
const User = require('../models/User');
const { verifyAccessToken } = require('../utils/tokens');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ROLES, ACCOUNT_STATUS } = require('../config/constants');

/** The signed-in person behind an access token, or an error. Shared by the HTTP middleware and the Socket.IO handshake. */
async function userFromToken(token) {
  const payload = verifyAccessToken(token); // throws JsonWebTokenError/TokenExpiredError -> 401 via error handler
  const user = await User.findById(payload.sub).select('name role status tokenVersion');
  if (!user || user.status === ACCOUNT_STATUS.DELETED) throw ApiError.unauthorized('Account not found');
  if (user.tokenVersion !== payload.tv) throw ApiError.unauthorized('Session expired, please log in again');
  if (user.status === ACCOUNT_STATUS.SUSPENDED) throw ApiError.forbidden('Your account is suspended', 'ACCOUNT_SUSPENDED');
  // 'pending_verification' accounts may authenticate (they need to submit documents); feature gates use requireVerified.
  return { id: String(user._id), role: user.role, status: user.status, name: user.name };
}

async function resolveUser(req) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return userFromToken(token);
}

/** Requires a valid access token. Sets req.user = { id, role, status, name }. */
const authenticate = asyncHandler(async (req, _res, next) => {
  const user = await resolveUser(req);
  if (!user) throw ApiError.unauthorized();
  req.user = user;
  next();
});

/** Token optional (public endpoints that personalise for logged-in users). An invalid token is still a 401. */
const optionalAuth = asyncHandler(async (req, _res, next) => {
  req.user = (await resolveUser(req)) || null;
  next();
});

/** Role gate. Always use after authenticate. */
const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden('You do not have permission to perform this action'));
  return next();
};

const PROFILE_MODEL = {
  [ROLES.TECHNICIAN]: ['TechnicianProfile', 'verification.status'],
  [ROLES.STUDENT]: ['StudentProfile', 'verification.status'],
  [ROLES.REFURBISHER]: ['RefurbisherProfile', 'verification.status'],
  [ROLES.RECYCLER]: ['RecyclingCenter', 'verification.status'],
};

/** Provider-only actions require admin-approved verification (BR-01). Roles without verification (user/admin) pass. */
const requireVerified = asyncHandler(async (req, _res, next) => {
  const entry = PROFILE_MODEL[req.user?.role];
  if (!entry) return next();
  const Model = require(`../models/${entry[0]}`);
  const profile = await Model.findOne({ user: req.user.id }).select('verification.status').lean();
  if (profile?.verification?.status !== 'approved') {
    throw ApiError.forbidden('Your account must be verified by an administrator first', 'NOT_VERIFIED');
  }
  return next();
});

module.exports = { authenticate, optionalAuth, authorize, requireVerified, userFromToken };

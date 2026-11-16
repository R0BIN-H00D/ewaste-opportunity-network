'use strict';
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const auth = require('../services/authService');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const { ROLE_PROFILE_MODEL } = require('../services/profileModels');
const { toUser, toOwnProfile, toOwnRoleProfile, toSession } = require('../serializers/user');

const COOKIE = 'ewaste_rt';
const cookieOptions = () => ({
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax',
  path: '/api/auth', // the browser only sends it to auth endpoints
  maxAge: env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000,
});

const ctxOf = (req) => ({ ip: req.ip, device: req.get('user-agent') });
// Mobile has no cookie jar: it asks for the refresh token in the body with this header.
const wantsBodyToken = (req) => req.get('x-client-type') === 'mobile';

function sessionResponse(req, res, { user, session }, message, status = 200) {
  res.cookie(COOKIE, session.refreshToken, cookieOptions());
  const data = {
    user: toUser(user),
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
    ...(wantsBodyToken(req) ? { refreshToken: session.refreshToken } : {}),
  };
  return ok(res, data, message, undefined, status);
}

/** Refresh token from the body (mobile) or the httpOnly cookie (web). Cookie use needs a custom header (CSRF guard). */
function readRefreshToken(req) {
  if (req.body?.refreshToken) return req.body.refreshToken;
  const fromCookie = req.cookies?.[COOKIE];
  if (fromCookie) {
    if (!req.get('x-requested-with')) throw ApiError.forbidden('Missing X-Requested-With header', 'CSRF_BLOCKED');
    return fromCookie;
  }
  return undefined;
}

exports.register = asyncHandler(async (req, res) => {
  const result = await auth.register(req.body, ctxOf(req));
  sessionResponse(req, res, result, 'Account created. Please verify your email.', 201);
});

exports.login = asyncHandler(async (req, res) => {
  sessionResponse(req, res, await auth.login(req.body, ctxOf(req)), 'Logged in');
});

exports.refresh = asyncHandler(async (req, res) => {
  const token = readRefreshToken(req);
  if (!token) throw ApiError.unauthorized('Refresh token missing');
  try {
    sessionResponse(req, res, await auth.refresh(token, ctxOf(req)), 'Session refreshed');
  } catch (err) {
    if (err.statusCode === 401) res.clearCookie(COOKIE, { path: '/api/auth' });
    throw err;
  }
});

exports.logout = asyncHandler(async (req, res) => {
  await auth.logout(readRefreshToken(req));
  res.clearCookie(COOKIE, { path: '/api/auth' });
  ok(res, null, 'Logged out');
});

exports.logoutAll = asyncHandler(async (req, res) => {
  await auth.logoutAll(req.user.id);
  res.clearCookie(COOKIE, { path: '/api/auth' });
  ok(res, null, 'Logged out from all devices');
});

exports.forgotPassword = asyncHandler(async (req, res) => {
  await auth.forgotPassword(req.body.email);
  ok(res, null, 'If that email is registered, a reset link has been sent.');
});

exports.resetPassword = asyncHandler(async (req, res) => {
  await auth.resetPassword(req.body);
  res.clearCookie(COOKIE, { path: '/api/auth' });
  ok(res, null, 'Password updated. Please log in.');
});

exports.changePassword = asyncHandler(async (req, res) => {
  sessionResponse(req, res, await auth.changePassword(req.user.id, req.body, ctxOf(req)), 'Password changed; other devices were signed out');
});

exports.verifyEmail = asyncHandler(async (req, res) => {
  await auth.verifyEmail(req.body.token);
  ok(res, null, 'Email verified');
});

exports.resendVerification = asyncHandler(async (req, res) => {
  await auth.resendVerification(req.user.id);
  ok(res, null, 'Verification email sent');
});

exports.sessions = asyncHandler(async (req, res) => {
  const list = await auth.listSessions(req.user.id);
  ok(res, list.map((t) => toSession(t)));
});

exports.revokeSession = asyncHandler(async (req, res) => {
  await auth.revokeSession(req.user.id, req.params.id);
  ok(res, null, 'Session revoked');
});

/** Everything the client needs to bootstrap after login/refresh. */
exports.me = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const [profile, roleProfile] = await Promise.all([
    UserProfile.findOne({ user: user._id }),
    ROLE_PROFILE_MODEL[user.role] ? ROLE_PROFILE_MODEL[user.role].findOne({ user: user._id }) : null,
  ]);
  ok(res, {
    user: toUser(user),
    profile: toOwnProfile(profile),
    roleProfile: toOwnRoleProfile(roleProfile),
    verification: roleProfile ? roleProfile.verification : undefined,
  });
});

'use strict';
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { signAccessToken } = require('../utils/tokens');
const { randomToken, sha256 } = require('../utils/crypto');
const { ACCOUNT_STATUS, PROVIDER_ROLES } = require('../config/constants');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const RefreshToken = require('../models/RefreshToken');
const { ROLE_PROFILE_MODEL, createRoleProfile } = require('./profileModels');
const mailer = require('./integrations/mailer');
const { renderEmail } = require('./integrations/emailTemplates');

const MAX_FAILED_LOGINS = 5;
const LOCK_MS = 15 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;
const INVALID_LOGIN = 'Invalid email or password';

// Compared against when the email is unknown so response time does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-password', env.BCRYPT_COST);
const hashPassword = (plain) => bcrypt.hash(plain, env.BCRYPT_COST);

/* ---------- sessions (access + rotating refresh token) ---------- */

async function issueSession(user, ctx = {}, family = crypto.randomUUID()) {
  const refreshToken = randomToken(32);
  const doc = await RefreshToken.create({
    user: user._id,
    tokenHash: sha256(refreshToken),
    family,
    device: (ctx.device || '').slice(0, 200) || undefined,
    ip: ctx.ip,
    expiresAt: new Date(Date.now() + env.REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000),
  });
  const accessToken = signAccessToken(user);
  const { exp, iat } = jwt.decode(accessToken);
  return { accessToken, refreshToken, expiresIn: exp - iat, family, tokenId: doc._id };
}

const revokeFamily = (family, now = new Date()) =>
  RefreshToken.updateMany({ family, revokedAt: null }, { $set: { revokedAt: now } });
const revokeAllSessions = (userId) =>
  RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });

/** Invalidates every access token (tv claim) and every refresh token of the user. */
async function revokeEverything(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await revokeAllSessions(userId);
}

/* ---------- email links ---------- */

async function sendVerificationEmail(user) {
  const token = randomToken(32);
  await User.updateOne(
    { _id: user._id },
    { $set: { emailVerifyTokenHash: sha256(token), emailVerifyExpires: new Date(Date.now() + VERIFY_TTL_MS) } },
  );
  await mailer.sendMail({
    to: user.email,
    subject: 'Verify your email - E-Waste Network',
    ...renderEmail({
      title: 'Confirm your email address',
      greeting: `Hi ${user.name},`,
      paragraphs: ['Thanks for joining. Please confirm your email address so we can reach you about your devices and requests.'],
      button: { label: 'Confirm my email', url: `${env.CLIENT_WEB_URL}/verify-email?token=${token}` },
      footer: 'This link is valid for 48 hours. If you did not create an account, you can ignore this email.',
    }),
  });
}

/* ---------- register / login ---------- */

async function register(input, ctx) {
  const { name, email, password, role, phone, organizationName } = input;
  const status = PROVIDER_ROLES.includes(role) ? ACCOUNT_STATUS.PENDING : ACCOUNT_STATUS.ACTIVE;

  let user;
  try {
    user = await User.create({ name, email, phone, role, status, passwordHash: await hashPassword(password) });
  } catch (err) {
    if (err?.code === 11000) throw ApiError.conflict('An account with this email already exists', 'EMAIL_TAKEN');
    throw err;
  }

  try {
    await UserProfile.create({ user: user._id });
    await createRoleProfile(user, { organizationName });
  } catch (err) {
    // No multi-document transactions on a standalone MongoDB: undo the partial signup.
    await Promise.all([
      User.collection.deleteOne({ _id: user._id }),
      UserProfile.collection.deleteMany({ user: user._id }),
      ...(ROLE_PROFILE_MODEL[role] ? [ROLE_PROFILE_MODEL[role].collection.deleteMany({ user: user._id })] : []),
    ]);
    throw err;
  }

  await sendVerificationEmail(user);
  const session = await issueSession(user, ctx);
  return { user, session };
}

async function login({ email, password }, ctx) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || user.status === ACCOUNT_STATUS.DELETED) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized(INVALID_LOGIN);
  }

  if (user.lockUntil && user.lockUntil > new Date()) {
    const minutes = Math.ceil((user.lockUntil - Date.now()) / 60000);
    throw new ApiError(429, `Too many failed attempts. Try again in ${minutes} minute(s).`, 'ACCOUNT_LOCKED');
  }

  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const updated = await User.findOneAndUpdate({ _id: user._id }, { $inc: { failedLogins: 1 } }, { new: true }).select('failedLogins');
    if (updated.failedLogins >= MAX_FAILED_LOGINS) {
      await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) } });
    }
    throw ApiError.unauthorized(INVALID_LOGIN);
  }

  if (user.status === ACCOUNT_STATUS.SUSPENDED) throw ApiError.forbidden('Your account is suspended', 'ACCOUNT_SUSPENDED');

  const now = new Date();
  await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lastLoginAt: now }, $unset: { lockUntil: '' } });
  user.lastLoginAt = now;
  return { user, session: await issueSession(user, ctx) };
}

/* ---------- refresh rotation / logout ---------- */

async function refresh(rawToken, ctx) {
  const now = new Date();
  const tokenHash = sha256(rawToken);

  // Atomic claim: only one concurrent request can consume a given refresh token.
  const claimed = await RefreshToken.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
    { new: true },
  );

  if (!claimed) {
    const existing = await RefreshToken.findOne({ tokenHash }).lean();
    if (existing?.revokedAt) {
      // A rotated/revoked token came back: assume theft, end the whole session chain.
      await revokeFamily(existing.family, now);
      throw new ApiError(401, 'Session ended. Please log in again.', 'TOKEN_REUSED');
    }
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(claimed.user);
  if (!user || user.status === ACCOUNT_STATUS.DELETED) {
    await revokeFamily(claimed.family, now);
    throw ApiError.unauthorized('Account not found');
  }
  if (user.status === ACCOUNT_STATUS.SUSPENDED) {
    await revokeFamily(claimed.family, now);
    throw ApiError.forbidden('Your account is suspended', 'ACCOUNT_SUSPENDED');
  }

  const session = await issueSession(user, ctx, claimed.family);
  await RefreshToken.updateOne({ _id: claimed._id }, { $set: { replacedBy: session.tokenId } });
  return { user, session };
}

/** Idempotent: unknown or already-revoked tokens are fine. */
async function logout(rawToken) {
  if (!rawToken) return;
  const existing = await RefreshToken.findOne({ tokenHash: sha256(rawToken) }).lean();
  if (existing) await revokeFamily(existing.family);
}

const logoutAll = (userId) => revokeEverything(userId);

const listSessions = (userId) =>
  RefreshToken.find({ user: userId, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 }).lean();

async function revokeSession(userId, tokenId) {
  const token = await RefreshToken.findOne({ _id: tokenId, user: userId }).lean();
  if (!token) throw ApiError.notFound('Session not found');
  await revokeFamily(token.family);
}

/* ---------- password ---------- */

async function forgotPassword(email) {
  const user = await User.findOne({ email });
  if (!user || [ACCOUNT_STATUS.DELETED].includes(user.status)) return; // same response either way (no email enumeration)
  const token = randomToken(32);
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordResetTokenHash: sha256(token), passwordResetExpires: new Date(Date.now() + RESET_TTL_MS) } },
  );
  await mailer.sendMail({
    to: user.email,
    subject: 'Reset your password - E-Waste Network',
    ...renderEmail({
      title: 'Reset your password',
      greeting: `Hi ${user.name},`,
      paragraphs: ['We received a request to reset the password for your account.'],
      button: { label: 'Choose a new password', url: `${env.CLIENT_WEB_URL}/reset-password?token=${token}` },
      footer: 'This link is valid for 1 hour and can be used once. If you did not ask for this, you can ignore this email.',
    }),
  });
}

async function resetPassword({ token, password }) {
  const user = await User.findOne({ passwordResetTokenHash: sha256(token), passwordResetExpires: { $gt: new Date() } });
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired');
  await User.updateOne(
    { _id: user._id },
    {
      $set: { passwordHash: await hashPassword(password), failedLogins: 0 },
      $unset: { passwordResetTokenHash: '', passwordResetExpires: '', lockUntil: '' },
    },
  );
  await revokeEverything(user._id);
}

async function changePassword(userId, { currentPassword, newPassword }, ctx) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  await User.updateOne({ _id: user._id }, { $set: { passwordHash: await hashPassword(newPassword) } });
  await revokeEverything(user._id);
  const fresh = await User.findById(user._id);
  return { user: fresh, session: await issueSession(fresh, ctx) }; // keep the current device signed in
}

/* ---------- email verification ---------- */

async function verifyEmail(token) {
  const user = await User.findOne({ emailVerifyTokenHash: sha256(token), emailVerifyExpires: { $gt: new Date() } });
  if (!user) throw ApiError.badRequest('This verification link is invalid or has expired');
  await User.updateOne({ _id: user._id }, { $set: { emailVerified: true }, $unset: { emailVerifyTokenHash: '', emailVerifyExpires: '' } });
}

async function resendVerification(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.unauthorized();
  if (user.emailVerified) throw ApiError.conflict('Your email is already verified', 'ALREADY_VERIFIED');
  await sendVerificationEmail(user);
}

/* ---------- account deletion ---------- */

/** Soft account deletion: PII is wiped, sessions end, the email address becomes free again. */
async function deleteAccount(userId, password) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw ApiError.badRequest('Password is incorrect');
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        status: ACCOUNT_STATUS.DELETED,
        name: 'Deleted user',
        email: `deleted+${user._id}@deleted.invalid`,
        passwordHash: await hashPassword(randomToken(24)),
      },
      $unset: { phone: '', avatar: '', passwordResetTokenHash: '', emailVerifyTokenHash: '' },
    },
  );
  await revokeEverything(user._id);
}

module.exports = {
  register, login, refresh, logout, logoutAll, listSessions, revokeSession,
  forgotPassword, resetPassword, changePassword, verifyEmail, resendVerification, deleteAccount, revokeEverything,
};

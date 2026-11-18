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
const CODE_TTL_MS = 15 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
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

// The 6-digit code is stored hashed together with the user id, so a leaked database does not reveal live codes.
const hashCode = (userId, code) => sha256(`${userId}:${code}`);

/** Emails the person a 6-digit code (and a link that does the same). Returns how it was delivered: smtp, console or failed. */
async function sendVerificationEmail(user) {
  const token = randomToken(32);
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  await User.updateOne(
    { _id: user._id },
    {
      $set: {
        emailVerifyTokenHash: sha256(token),
        emailVerifyExpires: new Date(Date.now() + VERIFY_TTL_MS),
        emailVerifyCodeHash: hashCode(user._id, code),
        emailVerifyCodeExpires: new Date(Date.now() + CODE_TTL_MS),
        emailVerifyCodeAttempts: 0,
      },
    },
  );
  const sent = await mailer.sendMail({
    to: user.email,
    subject: `${code} is your E-Waste Network verification code`,
    ...renderEmail({
      title: 'Confirm your email address',
      greeting: `Hi ${user.name},`,
      paragraphs: ['Thanks for joining. Enter this 6-digit code on the verification page to confirm your email address:'],
      code,
      button: { label: 'Or confirm with one click', url: `${env.CLIENT_WEB_URL}/verify-email?token=${token}` },
      footer: 'The code is valid for 15 minutes. If you did not create an account, you can ignore this email.',
    }),
  });
  return sent.delivered;
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

  // Two tabs (or an app and a widget) can refresh with the same token at the same instant. The second one is not theft, so for a
  // few seconds after a token was rotated, presenting it again is answered with a second, separate session on the same chain
  // instead of ending the chain. Each token can be answered this way at most twice, and only if it was really replaced (a token
  // that was revoked by logging out never qualifies).
  let grace = null;
  if (!claimed) {
    const existing = await RefreshToken.findOne({ tokenHash }).lean();
    if (existing?.revokedAt) {
      const graceMs = env.REFRESH_GRACE_SECONDS * 1000;
      const justRotated = Boolean(existing.replacedBy) && graceMs > 0 && now.getTime() - existing.revokedAt.getTime() <= graceMs;
      if (justRotated) {
        grace = await RefreshToken.findOneAndUpdate(
          { _id: existing._id, $or: [{ graceUses: { $exists: false } }, { graceUses: { $lt: 2 } }] },
          { $inc: { graceUses: 1 } },
          { new: true },
        );
      }
      if (!grace) {
        // A rotated/revoked token came back: assume theft, end the whole session chain.
        await revokeFamily(existing.family, now);
        throw new ApiError(401, 'Session ended. Please log in again.', 'TOKEN_REUSED');
      }
    } else {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }
  }

  const source = claimed || grace;
  const user = await User.findById(source.user);
  if (!user || user.status === ACCOUNT_STATUS.DELETED) {
    await revokeFamily(source.family, now);
    throw ApiError.unauthorized('Account not found');
  }
  if (user.status === ACCOUNT_STATUS.SUSPENDED) {
    await revokeFamily(source.family, now);
    throw ApiError.forbidden('Your account is suspended', 'ACCOUNT_SUSPENDED');
  }

  const session = await issueSession(user, ctx, source.family);
  if (claimed) await RefreshToken.updateOne({ _id: claimed._id }, { $set: { replacedBy: session.tokenId } });
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
  const delivered = await sendVerificationEmail(user);
  if (delivered === 'failed') throw new ApiError(502, 'We could not send the email. Check the address is right, or try again in a minute.', 'EMAIL_NOT_SENT');
  return delivered;
}

/** The person types the 6-digit code from their email. Five wrong tries lock the code until a new one is sent. */
async function verifyEmailCode(userId, code) {
  const user = await User.findById(userId).select('+emailVerifyCodeHash +emailVerifyCodeExpires +emailVerifyCodeAttempts');
  if (!user) throw ApiError.unauthorized();
  if (user.emailVerified) return;
  if (!user.emailVerifyCodeHash || !user.emailVerifyCodeExpires || user.emailVerifyCodeExpires < new Date()) {
    throw ApiError.badRequest('That code has expired. Ask for a new one.', undefined);
  }
  if ((user.emailVerifyCodeAttempts || 0) >= MAX_CODE_ATTEMPTS) {
    throw new ApiError(429, 'Too many wrong tries. Ask for a new code.', 'TOO_MANY_ATTEMPTS');
  }
  const given = Buffer.from(hashCode(user._id, code));
  const real = Buffer.from(user.emailVerifyCodeHash);
  if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) {
    await User.updateOne({ _id: user._id }, { $inc: { emailVerifyCodeAttempts: 1 } });
    const left = MAX_CODE_ATTEMPTS - (user.emailVerifyCodeAttempts || 0) - 1;
    throw ApiError.badRequest(left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'That code is not right. Ask for a new code.');
  }
  await User.updateOne(
    { _id: user._id },
    { $set: { emailVerified: true }, $unset: { emailVerifyTokenHash: '', emailVerifyExpires: '', emailVerifyCodeHash: '', emailVerifyCodeExpires: '', emailVerifyCodeAttempts: '' } },
  );
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
      $unset: { phone: '', avatar: '', passwordResetTokenHash: '', emailVerifyTokenHash: '', emailVerifyCodeHash: '' },
    },
  );
  await revokeEverything(user._id);
}

module.exports = {
  register, login, refresh, logout, logoutAll, listSessions, revokeSession,
  forgotPassword, resetPassword, changePassword, verifyEmail, verifyEmailCode, resendVerification, deleteAccount, revokeEverything,
};

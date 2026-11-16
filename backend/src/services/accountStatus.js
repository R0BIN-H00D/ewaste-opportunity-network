'use strict';
// Single place that knows which account-status changes are legal (used by verification review and admin tools in Phase 6).
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { ACCOUNT_STATUS: S } = require('../config/constants');
const { revokeEverything } = require('./authService');

const TRANSITIONS = {
  [S.PENDING]: [S.ACTIVE, S.SUSPENDED, S.DELETED],
  [S.ACTIVE]: [S.SUSPENDED, S.DELETED],
  [S.SUSPENDED]: [S.ACTIVE, S.PENDING, S.DELETED],
  [S.DELETED]: [],
};

const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

async function transition(userId, to, { by, reason } = {}) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (!canTransition(user.status, to)) {
    throw ApiError.conflict(`Cannot change account from ${user.status} to ${to}`, 'INVALID_TRANSITION');
  }
  if (to === S.SUSPENDED && !reason) throw ApiError.validation([{ field: 'reason', message: 'A reason is required to suspend an account' }]);

  user.status = to;
  user.suspension = to === S.SUSPENDED ? { reason, by, at: new Date() } : undefined;
  await user.save();
  if (to === S.SUSPENDED || to === S.DELETED) await revokeEverything(user._id); // end sessions immediately
  return user;
}

module.exports = { TRANSITIONS, canTransition, transition };

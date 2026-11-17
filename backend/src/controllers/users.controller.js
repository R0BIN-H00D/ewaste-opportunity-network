'use strict';
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/response');
const profiles = require('../services/profileService');
const auth = require('../services/authService');
const UserProfile = require('../models/UserProfile');
const { toUser, toOwnProfile, toOwnRoleProfile } = require('../serializers/user');

exports.getPublic = asyncHandler(async (req, res) => ok(res, await profiles.getPublicCard(req.params.id)));

exports.updateMe = asyncHandler(async (req, res) => {
  ok(res, toUser(await profiles.updateUser(req.user.id, req.body)), 'Account updated');
});

exports.getProfile = asyncHandler(async (req, res) => {
  ok(res, toOwnProfile(await UserProfile.findOne({ user: req.user.id })) || {});
});

exports.updateProfile = asyncHandler(async (req, res) => {
  ok(res, toOwnProfile(await profiles.updateProfile(req.user.id, req.body)), 'Profile updated');
});

exports.uploadAvatar = asyncHandler(async (req, res) => {
  ok(res, toUser(await profiles.updateAvatar(req.user.id, req.files?.[0])), 'Avatar updated');
});

exports.removeAvatar = asyncHandler(async (req, res) => {
  ok(res, toUser(await profiles.removeAvatar(req.user.id)), 'Avatar removed');
});

exports.getRoleProfile = asyncHandler(async (req, res) => {
  ok(res, toOwnRoleProfile(await profiles.getRoleProfile(req.user)));
});

exports.updateRoleProfile = asyncHandler(async (req, res) => {
  ok(res, toOwnRoleProfile(await profiles.updateRoleProfile(req.user, req.body)), 'Profile updated');
});

exports.deleteAccount = asyncHandler(async (req, res) => {
  await auth.deleteAccount(req.user.id, req.body.password);
  res.clearCookie('ewaste_rt', { path: '/api/auth' });
  ok(res, null, 'Your account has been deleted');
});

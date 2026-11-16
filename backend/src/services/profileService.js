'use strict';
const ApiError = require('../utils/ApiError');
const storage = require('./integrations/storage');
const User = require('../models/User');
const UserProfile = require('../models/UserProfile');
const Category = require('../models/Category');
const { ROLE_PROFILE_MODEL } = require('./profileModels');
const { ROLE_PROFILE_BODY, nonEmpty, NON_EMPTY } = require('../validators/profile.validators');

const POINT_FIELDS = new Set(['location', 'serviceLocation']);
const CATEGORY_FIELDS = ['deviceCategories', 'categories', 'acceptedCategories'];

const toPoint = (v) => (v ? { type: 'Point', coordinates: [v.lng, v.lat] } : undefined);

/** Applies a validated body to a mongoose doc: points are converted, nested objects merge instead of replace. */
function applyFields(doc, body) {
  for (const [key, value] of Object.entries(body)) {
    if (POINT_FIELDS.has(key)) doc.set(key, toPoint(value));
    else if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      if (doc.get(key) == null) doc.set(key, value); // sub-document does not exist yet: create it whole
      else for (const [k, v] of Object.entries(value)) doc.set(`${key}.${k}`, v);
    } else doc.set(key, value === null ? undefined : value);
  }
}

async function updateUser(userId, body) {
  const user = await User.findById(userId);
  if (body.phone === null) user.phone = undefined;
  else if (body.phone !== undefined) user.phone = body.phone;
  if (body.name !== undefined) user.name = body.name;
  await user.save();
  return user;
}

async function updateProfile(userId, body) {
  let profile = await UserProfile.findOne({ user: userId });
  if (!profile) profile = new UserProfile({ user: userId });
  applyFields(profile, body); // the model hook recomputes the fuzzed publicLocation whenever `location` changes
  await profile.save();
  return profile;
}

async function updateAvatar(userId, file) {
  if (!file) throw ApiError.validation([{ field: 'avatar', message: 'Attach an image file' }]);
  const user = await User.findById(userId);
  const old = user.avatar?.publicId;
  const saved = await storage.save(file, { folder: `avatars/${userId}` });
  user.avatar = storage.toPhoto(saved);
  await user.save();
  if (old) await storage.remove(old);
  return user;
}

async function removeAvatar(userId) {
  const user = await User.findById(userId);
  const old = user.avatar?.publicId;
  user.avatar = undefined;
  await user.save();
  if (old) await storage.remove(old);
  return user;
}

async function assertCategoriesExist(body) {
  for (const field of CATEGORY_FIELDS) {
    const list = body[field];
    if (!list?.length) continue;
    const unique = [...new Set(list)];
    const found = await Category.countDocuments({ _id: { $in: unique } });
    if (found !== unique.length) throw ApiError.validation([{ field, message: 'One or more categories do not exist' }]);
  }
}

async function getRoleProfile(user) {
  const Model = ROLE_PROFILE_MODEL[user.role];
  if (!Model) throw ApiError.notFound('This account type has no role profile');
  const profile = await Model.findOne({ user: user.id });
  if (!profile) throw ApiError.notFound('Role profile not found');
  return profile;
}

/** Body shape depends on the caller's role, so it is validated here rather than in the route. */
async function updateRoleProfile(user, rawBody) {
  const schema = ROLE_PROFILE_BODY[user.role];
  if (!schema) throw ApiError.notFound('This account type has no role profile');
  const parsed = schema.safeParse(rawBody);
  if (!parsed.success) {
    throw ApiError.validation(parsed.error.issues.map((i) => ({ field: ['body', ...i.path].join('.'), message: i.message })));
  }
  if (!nonEmpty(parsed.data)) throw ApiError.validation([{ field: 'body', message: NON_EMPTY.message }]);
  await assertCategoriesExist(parsed.data);
  const profile = await getRoleProfile(user);
  applyFields(profile, parsed.data);
  await profile.save();
  return profile;
}

module.exports = { updateUser, updateProfile, updateAvatar, removeAvatar, getRoleProfile, updateRoleProfile, toPoint };

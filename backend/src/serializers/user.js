'use strict';
// Explicit allow-lists: nothing leaves the API unless it is named here.
const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));

const toUser = (u) => ({
  _id: u._id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  status: u.status,
  emailVerified: u.emailVerified,
  avatar: u.avatar ? pick(u.avatar, ['url', 'bytes', 'mime']) : undefined,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
});

// Owner view (the person looking at their own profile): exact address/location included.
const toOwnProfile = (p) =>
  p && pick(p.toObject ? p.toObject() : p, [
    'bio', 'addressLine', 'addressArea', 'city', 'state', 'pincode', 'location', 'publicLocation', 'orgProfile', 'preferences',
  ]);

const toOwnRoleProfile = (p) => {
  if (!p) return undefined;
  const o = p.toObject ? p.toObject() : p;
  const { user, createdAt, updatedAt, __v, ...rest } = o; // eslint-disable-line no-unused-vars
  return rest;
};

const toSession = (t, currentFamily) => ({
  _id: t._id,
  device: t.device,
  ip: t.ip,
  createdAt: t.createdAt,
  expiresAt: t.expiresAt,
  current: currentFamily ? t.family === currentFamily : undefined,
});

module.exports = { toUser, toOwnProfile, toOwnRoleProfile, toSession, pick };

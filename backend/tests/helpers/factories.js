'use strict';
const User = require('../../src/models/User');
const Category = require('../../src/models/Category');
const { signAccessToken } = require('../../src/utils/tokens');
const { CATEGORY_SEED } = require('../../src/config/constants');

// 1x1 transparent PNG (valid magic bytes)
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let n = 0;
async function makeUser(role = 'user', extra = {}) {
  n += 1;
  const doc = await User.create({ name: `Test ${role} ${n}`, email: `${role}${n}@test.local`, role, passwordHash: 'not-a-real-hash', ...extra });
  return { doc, id: String(doc._id), token: signAccessToken(doc) };
}

const authHeader = (u) => ({ Authorization: `Bearer ${u.token}` });

async function seedCategories() {
  const out = {};
  for (const [i, [name, slug, icon, hazardous]] of CATEGORY_SEED.entries()) {
    out[slug] = await Category.create({ name, slug, icon, hazardous, order: i });
  }
  return out;
}

/** A technician with an admin-approved profile near Bengaluru (BR-01), unless overridden. */
async function makeTechnician({ user = {}, profile = {} } = {}) {
  const TechnicianProfile = require('../../src/models/TechnicianProfile');
  const u = await makeUser('technician', user);
  const doc = await TechnicianProfile.create({
    user: u.id,
    serviceLocation: { type: 'Point', coordinates: [77.59, 12.97] },
    serviceRadiusKm: 25,
    baseRate: 500,
    city: 'Bengaluru',
    verification: { status: 'approved' },
    ...profile,
  });
  return { ...u, profile: doc };
}

/** A listed device (repair by default) owned by `owner`. */
async function makeListing(owner, category, extra = {}) {
  const Device = require('../../src/models/Device');
  const DeviceListing = require('../../src/models/DeviceListing');
  const device = await Device.create({ owner: owner.id, name: 'HP Pavilion laptop', category: category._id });
  const listing = await DeviceListing.create({
    device: device._id,
    owner: owner.id,
    category: category._id,
    title: 'HP Pavilion laptop',
    condition: 'minor_damage',
    preferredService: 'repair',
    location: { type: 'Point', coordinates: [77.595, 12.975] },
    addressArea: 'Indiranagar',
    city: 'Bengaluru',
    ...extra,
  });
  return listing;
}

module.exports = { PNG, makeUser, makeTechnician, makeListing, authHeader, seedCategories };

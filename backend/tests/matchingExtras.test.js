'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const RefurbisherProfile = require('../src/models/RefurbisherProfile');
const RecyclingCenter = require('../src/models/RecyclingCenter');
const WantedRequest = require('../src/models/WantedRequest');

const app = createApp();
let owner; let cats; let listing;
const get = (user, id, kind) => request(app).get(`/api/matching/listing/${id}/${kind}`).set(authHeader(user));
const near = [77.6, 12.98];
const far = [78.5, 13.9];

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  owner = await makeUser('user');
  listing = await makeListing(owner, cats.laptop, { brand: 'Dell', condition: 'minor_damage' });
});

async function refurbisher(name, over = {}) {
  const u = await makeUser('refurbisher', { name });
  await RefurbisherProfile.create({ user: u.id, businessName: name, city: 'Bengaluru', location: { type: 'Point', coordinates: near }, categories: [cats.laptop._id], verification: { status: 'approved' }, ...over });
  return u;
}

describe('refurbishers for a device', () => {
  it('ranks the near, well-rated one first and says why', async () => {
    await refurbisher('Far Works', { location: { type: 'Point', coordinates: far }, ratingAvg: 3, ratingCount: 2 });
    await refurbisher('Near Works', { ratingAvg: 4.8, ratingCount: 30 });
    const res = await get(owner, listing._id, 'refurbishers');
    expect(res.status).toBe(200);
    expect(res.body.data.map((m) => m.name)).toEqual(['Near Works', 'Far Works']);
    expect(res.body.data[0].reasons.join(' ')).toMatch(/km away/);
    expect(res.body.data[0].reasons.join(' ')).toMatch(/4\.8 stars from 30 reviews/);
    expect(res.body.data[0].score).toBeGreaterThan(res.body.data[1].score);
  });

  it('skips unverified refurbishers and those that do not take this category', async () => {
    await refurbisher('Pending', { verification: { status: 'pending' } });
    await refurbisher('Phones only', { categories: [cats.smartphone._id] });
    expect((await get(owner, listing._id, 'refurbishers')).body.data).toEqual([]);
  });
});

describe('recycling centres for a device', () => {
  it('lists approved centres that accept the category, nearest first', async () => {
    const a = await makeUser('recycler');
    const b = await makeUser('recycler');
    await RecyclingCenter.create({ user: a.id, name: 'Far Recyclers', city: 'Mysuru', location: { type: 'Point', coordinates: far }, acceptedCategories: [cats.laptop._id], verification: { status: 'approved' } });
    await RecyclingCenter.create({ user: b.id, name: 'Near Recyclers', city: 'Bengaluru', location: { type: 'Point', coordinates: near }, acceptedCategories: [cats.laptop._id], verification: { status: 'approved' } });
    await RecyclingCenter.create({ user: (await makeUser('recycler')).id, name: 'Phones Only', acceptedCategories: [cats.smartphone._id], verification: { status: 'approved' } });
    const res = await get(owner, listing._id, 'recyclers');
    expect(res.body.data.map((m) => m.name)).toEqual(['Near Recyclers', 'Far Recyclers']);
  });
});

describe('wanted requests a device would satisfy', () => {
  it('matches by category, brand and condition, best first', async () => {
    const r = await makeUser('refurbisher');
    await WantedRequest.create({ refurbisher: r.id, title: 'Any laptop', category: cats.laptop._id, city: 'Bengaluru' });
    await WantedRequest.create({ refurbisher: r.id, title: 'Dell laptops', category: cats.laptop._id, brand: 'Dell', minCondition: 'minor_damage', city: 'Bengaluru' });
    await WantedRequest.create({ refurbisher: r.id, title: 'Perfect laptops only', category: cats.laptop._id, minCondition: 'fully_working' });
    await WantedRequest.create({ refurbisher: r.id, title: 'Phones', category: cats.smartphone._id });
    await WantedRequest.create({ refurbisher: r.id, title: 'Closed Dell', category: cats.laptop._id, brand: 'Dell', status: 'closed' });
    const res = await get(owner, listing._id, 'wanted');
    expect(res.body.data.map((m) => m.title)).toEqual(['Dell laptops', 'Any laptop']);
    expect(res.body.data[0].reasons).toContain('Looking for Dell');
  });
});

describe('who may ask', () => {
  it('only the owner of the device', async () => {
    const other = await makeUser('user');
    expect((await get(other, listing._id, 'refurbishers')).status).toBe(404);
    expect((await get(owner, listing._id, 'nonsense')).status).toBe(404);
    expect((await request(app).get(`/api/matching/listing/${listing._id}/wanted`)).status).toBe(401);
  });
});

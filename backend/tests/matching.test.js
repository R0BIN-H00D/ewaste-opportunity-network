'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const matching = require('../src/services/matching');

const app = createApp();
let owner; let cats; let listing;

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  owner = await makeUser('user');
  listing = await makeListing(owner, cats.laptop);
});

describe('matching rules (pure)', () => {
  const ctx = () => ({ listing: listing.toObject() });
  const cand = (profile = {}, user = {}) => ({
    profile: { verification: { status: 'approved' }, deviceCategories: [], serviceRadiusKm: 25, baseRate: 500, serviceLocation: { type: 'Point', coordinates: [77.59, 12.97] }, ...profile },
    user: { _id: 'tech1', status: 'active', ...user },
  });

  it('accepts an approved, active, available technician in range', () => {
    expect(matching.checkEligibility({ ...cand(), distanceKm: 3 }, ctx()).ok).toBe(true);
  });

  it.each([
    ['not verified', { profile: { verification: { status: 'pending' } } }, 'not_verified'],
    ['unavailable', { profile: { availability: { status: 'unavailable' } } }, 'unavailable'],
    ['suspended account', { user: { status: 'suspended' } }, 'account_not_active'],
  ])('rejects a technician who is %s', (_n, over, why) => {
    const c = cand(over.profile, over.user);
    expect(matching.checkEligibility({ ...c, distanceKm: 1 }, ctx())).toEqual({ ok: false, why });
  });

  it('rejects a technician outside their own service radius', () => {
    expect(matching.checkEligibility({ ...cand({ serviceRadiusKm: 5 }), distanceKm: 12 }, ctx())).toEqual({ ok: false, why: 'outside_service_radius' });
  });

  it('never matches a technician with the device owner (own listing)', () => {
    expect(matching.checkEligibility({ ...cand({}, { _id: owner.id }), distanceKm: 1 }, ctx())).toEqual({ ok: false, why: 'own_listing' });
  });

  it('ranks a nearer, better rated technician first and explains why', () => {
    const near = cand({ ratingAvg: 4.8, ratingCount: 40, completedJobs: 30, serviceLocation: { type: 'Point', coordinates: [77.596, 12.976] } }, { _id: 'near' });
    const far = cand({ ratingAvg: 3.2, ratingCount: 3, serviceLocation: { type: 'Point', coordinates: [77.75, 13.1] } }, { _id: 'far' });
    const ranked = matching.rankCandidates([far, near], ctx());
    expect(ranked.map((r) => r.user._id)).toEqual(['near', 'far']);
    expect(ranked[0].score).toBeGreaterThan(ranked[1].score);
    expect(ranked[0].breakdown.length).toBeGreaterThan(0);
    expect(ranked[0].estimatedCharge).toEqual(expect.objectContaining({ isEstimate: true }));
  });
});

describe('GET /api/matching/recommendations', () => {
  const get = (user, id) => request(app).get('/api/matching/recommendations').query({ listingId: id }).set(user ? authHeader(user) : {});

  it('requires authentication', async () => {
    expect((await get(null, String(listing._id))).status).toBe(401);
  });

  it('returns only eligible technicians, best first, without private data', async () => {
    const good = await makeTechnician({ profile: { ratingAvg: 4.9, ratingCount: 30, completedJobs: 20 } });
    await makeTechnician({ profile: { verification: { status: 'pending' } } }); // not verified
    await makeTechnician({ profile: { availability: { status: 'unavailable' } } });
    await makeTechnician({ profile: { serviceLocation: { type: 'Point', coordinates: [80.27, 13.08] }, serviceRadiusKm: 10 } }); // Chennai
    await makeTechnician({ profile: { deviceCategories: [cats.smartphone._id] } }); // different category
    const ok = await makeTechnician({ profile: { ratingAvg: 3.0, ratingCount: 2 } });

    const res = await get(owner, String(listing._id));
    expect(res.status).toBe(200);
    const ids = res.body.data.map((r) => r.technician._id);
    expect(ids).toEqual([good.id, ok.id]);
    const first = res.body.data[0];
    expect(first.score).toBeGreaterThan(res.body.data[1].score);
    expect(first.reasons.length).toBeGreaterThan(0);
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('serviceLocation');
    expect(json).not.toContain('earningsTotal');
    expect(json).not.toContain('email');
  });

  it("hides other people's listings (404)", async () => {
    const other = await makeUser('user');
    expect((await get(other, String(listing._id))).status).toBe(404);
  });

  it('validates the listing id', async () => {
    expect((await get(owner, 'nope')).status).toBe(422);
  });
});

describe('technician directory', () => {
  it('lists only verified, active technicians and hides exact location', async () => {
    const shown = await makeTechnician();
    await makeTechnician({ profile: { verification: { status: 'pending' } } });
    await makeTechnician({ user: { status: 'suspended' } });
    const res = await request(app).get('/api/technicians');
    expect(res.status).toBe(200);
    expect(res.body.data.map((t) => t._id)).toEqual([shown.id]);
    expect(JSON.stringify(res.body)).not.toContain('"coordinates"');
    expect(res.body.meta.total).toBe(1);
  });

  it('shows one technician and 404s for an unverified one', async () => {
    const shown = await makeTechnician();
    const hidden = await makeTechnician({ profile: { verification: { status: 'pending' } } });
    expect((await request(app).get(`/api/technicians/${shown.id}`)).status).toBe(200);
    expect((await request(app).get(`/api/technicians/${hidden.id}`)).status).toBe(404);
  });

  it('finds nearby technicians sorted by distance', async () => {
    const near = await makeTechnician({ profile: { serviceLocation: { type: 'Point', coordinates: [77.592, 12.972] } } });
    const farther = await makeTechnician({ profile: { serviceLocation: { type: 'Point', coordinates: [77.7, 13.05] }, serviceRadiusKm: 40 } });
    const res = await request(app).get('/api/technicians/nearby').query({ lat: 12.97, lng: 77.59, radiusKm: 30, sort: 'distance' });
    expect(res.status).toBe(200);
    expect(res.body.data.map((t) => t._id)).toEqual([near.id, farther.id]);
    expect(res.body.data[0].distanceKm).toBeLessThan(res.body.data[1].distanceKm);
  });

  it('lets a technician change availability, and only a technician', async () => {
    const tech = await makeTechnician();
    const res = await request(app).put('/api/technicians/availability').set(authHeader(tech)).send({ status: 'limited' });
    expect(res.status).toBe(200);
    expect((await request(app).put('/api/technicians/availability').set(authHeader(owner)).send({ status: 'limited' })).status).toBe(403);
    expect((await request(app).put('/api/technicians/availability').set(authHeader(tech)).send({ status: 'bogus' })).status).toBe(422);
  });
});

'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { PNG, makeUser, authHeader, seedCategories } = require('./helpers/factories');
const DeviceListing = require('../src/models/DeviceListing');
const Device = require('../src/models/Device');

const app = createApp();
let owner; let other; let admin; let cats;

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  owner = await makeUser('user');
  other = await makeUser('user');
  admin = await makeUser('admin');
});

function create(user, fields = {}, { photo = true } = {}) {
  let r = request(app).post('/api/devices');
  if (user) r = r.set(authHeader(user));
  const body = { name: 'HP Pavilion laptop', category: 'laptop', condition: 'minor_damage', preferredService: 'repair', lat: 12.97, lng: 77.59, city: 'Bengaluru', ...fields };
  for (const [k, v] of Object.entries(body)) if (v !== undefined) r = r.field(k, String(v));
  if (photo) r = r.attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' });
  return r;
}

describe('POST /api/devices', () => {
  it('requires authentication', async () => {
    expect((await create(null)).status).toBe(401);
  });

  it('rejects roles that cannot list devices (student)', async () => {
    const student = await makeUser('student');
    expect((await create(student)).status).toBe(403);
  });

  it('creates a listing with photo, category and exact location visible to the owner', async () => {
    const res = await create(owner);
    expect(res.status).toBe(201);
    const l = res.body.data;
    expect(l.title).toBe('HP Pavilion laptop');
    expect(l.status).toBe('listed');
    expect(l.isOwner).toBe(true);
    expect(l.location.coordinates).toEqual([77.59, 12.97]);
    expect(l.publicLocation.coordinates).not.toEqual([77.59, 12.97]); // fuzzed
    expect(l.device.photos).toHaveLength(1);
    expect(l.device.photos[0].url).toMatch(/^\/uploads\//);
    expect(l.category.slug).toBe('laptop');
  });

  it('returns field-level validation errors (422)', async () => {
    const res = await create(owner, { name: undefined, condition: 'broken-ish' });
    expect(res.status).toBe(422);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['body.name', 'body.condition']));
  });

  it('rejects unknown fields (no mass assignment)', async () => {
    const res = await create(owner, { owner: other.id, status: 'listed', role: 'admin' });
    expect(res.status).toBe(422);
  });

  it('requires a photo to publish, but allows a draft without one', async () => {
    expect((await create(owner, {}, { photo: false })).status).toBe(422);
    const draft = await create(owner, { status: 'draft' }, { photo: false });
    expect(draft.status).toBe(201);
    expect(draft.body.data.status).toBe('draft');
  });

  it('rejects a file whose bytes are not really an image', async () => {
    const res = await request(app).post('/api/devices').set(authHeader(owner))
      .field('name', 'Fake').field('category', 'laptop').field('condition', 'minor_damage').field('preferredService', 'repair')
      .attach('photos', Buffer.from('this is plain text, not an image'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(422);
  });

  it('rejects an unknown category', async () => {
    expect((await create(owner, { category: 'toaster' })).status).toBe(422);
  });
});

describe('GET /api/devices (public browse)', () => {
  beforeEach(async () => {
    await create(owner, { name: 'Dell Inspiron laptop', category: 'laptop', condition: 'minor_damage', expectedPrice: 8000 });
    await create(owner, { name: 'Samsung Galaxy phone', category: 'smartphone', condition: 'not_working', preferredService: 'recycling', expectedPrice: 500 });
    await create(other, { name: 'Logitech keyboard', category: 'keyboard', condition: 'fully_working', preferredService: 'reuse', expectedPrice: 900 });
    await create(owner, { name: 'Secret draft tablet', category: 'tablet', status: 'draft' }, { photo: false });
  });

  it('shows only live listings and never leaks private fields', async () => {
    const res = await request(app).get('/api/devices');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta).toMatchObject({ page: 1, total: 3 });
    for (const l of res.body.data) {
      expect(l.location).toBeUndefined();
      expect(l.lockedBy).toBeUndefined();
      expect(l.reportCount).toBeUndefined();
      expect(l.publicLocation).toBeDefined();
      expect(Object.keys(l.owner).sort()).toEqual(expect.arrayContaining(['_id', 'name']));
      expect(JSON.stringify(l)).not.toMatch(/@test\.local/);
    }
  });

  it('filters by category, condition, service, price and text search', async () => {
    const get = (qs) => request(app).get(`/api/devices?${qs}`);
    expect((await get('category=laptop')).body.data).toHaveLength(1);
    expect((await get('condition=not_working')).body.data[0].title).toBe('Samsung Galaxy phone');
    expect((await get('service=reuse')).body.data).toHaveLength(1);
    expect((await get('minPrice=600&maxPrice=9000')).body.data).toHaveLength(2);
    const search = await get('q=Logitech');
    expect(search.body.data).toHaveLength(1);
    expect(search.body.data[0].title).toBe('Logitech keyboard');
  });

  it('paginates with meta', async () => {
    const res = await request(app).get('/api/devices?limit=2&page=2');
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 2, total: 3, pages: 2 });
  });

  it('filters by distance', async () => {
    await create(owner, { name: 'Delhi laptop', lat: 28.61, lng: 77.2, city: 'Delhi' });
    const near = await request(app).get('/api/devices?lat=12.97&lng=77.59&radiusKm=50');
    expect(near.body.data.map((l) => l.title)).not.toContain('Delhi laptop');
    expect(near.body.data).toHaveLength(3);
  });

  it('rejects NoSQL-operator payloads in the query string', async () => {
    expect((await request(app).get('/api/devices?category[$ne]=x')).status).toBe(422);
    expect((await request(app).get('/api/devices?q[$ne]=x')).status).toBe(422);
    expect((await request(app).get('/api/devices?unknown=1')).status).toBe(422);
  });

  it('mine=true needs auth and includes own drafts', async () => {
    expect((await request(app).get('/api/devices?mine=true')).status).toBe(401);
    const res = await request(app).get('/api/devices?mine=true').set(authHeader(owner));
    expect(res.body.data).toHaveLength(3); // 2 live + 1 draft
    expect(res.body.data.every((l) => l.isOwner)).toBe(true);
  });
});

describe('GET /api/devices/:id', () => {
  it('shows live listings publicly, hides drafts from others, 404 on bad ids', async () => {
    const live = (await create(owner)).body.data;
    const draft = (await create(owner, { status: 'draft' }, { photo: false })).body.data;

    const pub = await request(app).get(`/api/devices/${live._id}`);
    expect(pub.status).toBe(200);
    expect(pub.body.data.location).toBeUndefined();

    expect((await request(app).get(`/api/devices/${draft._id}`)).status).toBe(404);
    expect((await request(app).get(`/api/devices/${draft._id}`).set(authHeader(other))).status).toBe(404);
    expect((await request(app).get(`/api/devices/${draft._id}`).set(authHeader(owner))).status).toBe(200);
    expect((await request(app).get('/api/devices/not-an-id')).status).toBe(404);
  });

  it('rejects an invalid bearer token with 401', async () => {
    const res = await request(app).get('/api/devices').set({ Authorization: 'Bearer garbage' });
    expect(res.status).toBe(401);
  });
});

describe('PUT /api/devices/:id', () => {
  let listing;
  beforeEach(async () => { listing = (await create(owner)).body.data; });

  it('lets the owner edit and keeps denormalised fields in sync', async () => {
    const res = await request(app).put(`/api/devices/${listing._id}`).set(authHeader(owner)).field('name', 'HP Pavilion 15').field('expectedPrice', '7000');
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('HP Pavilion 15');
    expect(res.body.data.device.name).toBe('HP Pavilion 15');
    expect(res.body.data.expectedPrice).toBe(7000);
  });

  it('forbids other users but allows admin', async () => {
    expect((await request(app).put(`/api/devices/${listing._id}`).set(authHeader(other)).field('name', 'Hacked')).status).toBe(403);
    expect((await request(app).put(`/api/devices/${listing._id}`).set(authHeader(admin)).field('name', 'Moderated title')).status).toBe(200);
  });

  it('enforces legal status transitions', async () => {
    const put = (status) => request(app).put(`/api/devices/${listing._id}`).set(authHeader(owner)).field('status', status);
    expect((await put('withdrawn')).status).toBe(200);
    expect((await put('listed')).status).toBe(200);
    expect((await put('completed')).status).toBe(422); // not an allowed value
  });

  it('cannot remove the last photo of a live listing', async () => {
    const pid = listing.device.photos[0].publicId;
    const res = await request(app).put(`/api/devices/${listing._id}`).set(authHeader(owner)).field('removePhotoIds', JSON.stringify([pid]));
    expect(res.status).toBe(422);
  });

  it('is locked while the listing is in an active service (BR-03)', async () => {
    await DeviceListing.updateOne({ _id: listing._id }, { status: 'in_service' });
    const put = await request(app).put(`/api/devices/${listing._id}`).set(authHeader(owner)).field('name', 'Nope');
    expect(put.status).toBe(409);
    expect(put.body.code).toBe('LISTING_LOCKED');
    expect((await request(app).delete(`/api/devices/${listing._id}`).set(authHeader(owner))).status).toBe(409);
  });
});

describe('DELETE /api/devices/:id (soft delete)', () => {
  it('soft-deletes for the owner; hidden afterwards but retained in the DB', async () => {
    const listing = (await create(owner)).body.data;
    expect((await request(app).delete(`/api/devices/${listing._id}`).set(authHeader(other))).status).toBe(403);
    expect((await request(app).delete(`/api/devices/${listing._id}`).set(authHeader(owner))).status).toBe(200);

    expect((await request(app).get(`/api/devices/${listing._id}`)).status).toBe(404);
    expect((await request(app).get('/api/devices')).body.data).toHaveLength(0);
    const raw = await DeviceListing.findById(listing._id).setOptions({ withDeleted: true });
    expect(raw.deletedAt).toBeInstanceOf(Date);
    expect((await Device.findById(listing.device._id).setOptions({ withDeleted: true })).deletedAt).toBeInstanceOf(Date);
  });
});

describe('categories, reports, stubs, auth edge cases', () => {
  it('lists the 15 active categories publicly', async () => {
    const res = await request(app).get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(15);
    expect(cats.laptop.slug).toBe('laptop');
  });

  it('reports a listing once, not your own, and bumps reportCount', async () => {
    const listing = (await create(owner)).body.data;
    const body = { targetType: 'listing', targetId: listing._id, reason: 'spam' };
    expect((await request(app).post('/api/reports').send(body)).status).toBe(401);
    expect((await request(app).post('/api/reports').set(authHeader(owner)).send(body)).status).toBe(400);
    expect((await request(app).post('/api/reports').set(authHeader(other)).send(body)).status).toBe(201);
    const dup = await request(app).post('/api/reports').set(authHeader(other)).send(body);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('ALREADY_REPORTED');
    expect((await DeviceListing.findById(listing._id)).reportCount).toBe(1);
    expect((await request(app).post('/api/reports').set(authHeader(other)).send({ ...body, reason: 'x' })).status).toBe(422);
  });

  it('answers 501 (not fake success) for modules not built yet', async () => {
    const res = await request(app).get('/api/geo');
    expect(res.status).toBe(501);
    expect(res.body.code).toBe('NOT_IMPLEMENTED');
  });

  it('blocks suspended accounts', async () => {
    const bad = await makeUser('user', { status: 'suspended' });
    const res = await request(app).get('/api/devices?mine=true').set(authHeader(bad));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('rejects tokens after tokenVersion is bumped (session revocation)', async () => {
    const u = await makeUser('user');
    await u.doc.updateOne({ $inc: { tokenVersion: 1 } });
    expect((await request(app).get('/api/devices?mine=true').set(authHeader(u))).status).toBe(401);
  });
});

'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { PNG, seedCategories } = require('./helpers/factories');
const { signup, login, mailer, PASSWORD } = require('./helpers/auth');
const User = require('../src/models/User');
const UserProfile = require('../src/models/UserProfile');
const TechnicianProfile = require('../src/models/TechnicianProfile');
const RecyclingCenter = require('../src/models/RecyclingCenter');

const app = createApp();
const api = (method, path, u, body) => {
  const r = request(app)[method](`/api${path}`).set(u.auth);
  return body === undefined ? r : r.send(body);
};

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  mailer.outbox.length = 0;
});

describe('PATCH /users/me', () => {
  it('updates name and phone, and can clear the phone', async () => {
    const u = await signup(app);
    const res = await api('patch', '/users/me', u, { name: 'Asha K Rao', phone: '+91 98450 12345' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Asha K Rao', phone: '+91 98450 12345' });
    const cleared = await api('patch', '/users/me', u, { phone: null });
    expect(cleared.body.data.phone).toBeUndefined();
  });

  it('cannot change role, status or email', async () => {
    const u = await signup(app);
    for (const field of [{ role: 'admin' }, { status: 'active' }, { email: 'x@test.local' }, { emailVerified: true }]) {
      expect((await api('patch', '/users/me', u, field)).status).toBe(422);
    }
    expect((await User.findById(u.id)).role).toBe('user');
  });

  it('validates input and refuses an empty update', async () => {
    const u = await signup(app);
    expect((await api('patch', '/users/me', u, { phone: 'call me' })).status).toBe(422);
    expect((await api('patch', '/users/me', u, {})).status).toBe(422);
    expect((await request(app).patch('/api/users/me').send({ name: 'No Token' })).status).toBe(401);
  });
});

describe('profile', () => {
  it('stores address details and merges preferences instead of replacing them', async () => {
    const u = await signup(app);
    await api('patch', '/users/me/profile', u, { city: 'Bengaluru', preferences: { theme: 'dark' } });
    const res = await api('patch', '/users/me/profile', u, { preferences: { emailNotifications: false } });
    expect(res.status).toBe(200);
    expect(res.body.data.city).toBe('Bengaluru');
    expect(res.body.data.preferences).toMatchObject({ theme: 'dark', emailNotifications: false });
  });

  it('keeps the exact location private to the owner and derives a different public one', async () => {
    const u = await signup(app);
    const res = await api('patch', '/users/me/profile', u, { location: { lat: 12.9716, lng: 77.5946 } });
    expect(res.status).toBe(200);
    expect(res.body.data.location.coordinates).toEqual([77.5946, 12.9716]);
    expect(res.body.data.publicLocation.coordinates).not.toEqual([77.5946, 12.9716]);

    const cleared = await api('patch', '/users/me/profile', u, { location: null });
    expect(cleared.body.data.location).toBeUndefined();
    expect(cleared.body.data.publicLocation).toBeUndefined();
  });

  it('rejects out-of-range coordinates and server-controlled fields', async () => {
    const u = await signup(app);
    expect((await api('patch', '/users/me/profile', u, { location: { lat: 123, lng: 0 } })).status).toBe(422);
    expect((await api('patch', '/users/me/profile', u, { role: 'admin' })).status).toBe(422);
    expect((await api('patch', '/users/me/profile', u, { orgProfile: { recipientVerification: { status: 'approved' } } })).status).toBe(422);
  });

  it('lets a person describe their organisation (verification stays admin-only)', async () => {
    const u = await signup(app);
    const res = await api('patch', '/users/me/profile', u, { orgProfile: { isOrg: true, orgType: 'school', orgName: 'Sunrise School' } });
    expect(res.status).toBe(200);
    expect(res.body.data.orgProfile).toMatchObject({ isOrg: true, orgType: 'school', orgName: 'Sunrise School' });
    const doc = await UserProfile.findOne({ user: u.id });
    expect(doc.orgProfile.recipientVerification.status).toBe('not_submitted');
  });
});

describe('avatar', () => {
  const upload = (u, buf = PNG, opts = { filename: 'me.png', contentType: 'image/png' }) =>
    request(app).post('/api/users/me/avatar').set(u.auth).attach('avatar', buf, opts);

  it('accepts a real image and replaces the old one', async () => {
    const u = await signup(app);
    const first = await upload(u);
    expect(first.status).toBe(200);
    expect(first.body.data.avatar.url).toMatch(/^\/uploads\/avatars\//);
    const second = await upload(u);
    expect(second.body.data.avatar.url).not.toBe(first.body.data.avatar.url);
    expect(JSON.stringify(second.body)).not.toMatch(/publicId/);
  });

  it('rejects wrong types, disguised files and a missing file', async () => {
    const u = await signup(app);
    expect((await upload(u, Buffer.from('hello world, not an image'), { filename: 'a.txt', contentType: 'text/plain' })).status).toBe(422);
    expect((await upload(u, Buffer.from('this is plain text pretending to be a png'), { filename: 'a.png', contentType: 'image/png' })).status).toBe(422);
    expect((await request(app).post('/api/users/me/avatar').set(u.auth)).status).toBe(422);
  });

  it('removes the avatar', async () => {
    const u = await signup(app);
    await upload(u);
    const res = await api('delete', '/users/me/avatar', u);
    expect(res.status).toBe(200);
    expect(res.body.data.avatar).toBeUndefined();
  });
});

describe('role profile', () => {
  it('does not exist for plain users', async () => {
    const u = await signup(app);
    expect((await api('get', '/users/me/role-profile', u)).status).toBe(404);
    expect((await api('patch', '/users/me/role-profile', u, { headline: 'x' })).status).toBe(404);
  });

  it('lets a technician fill in their details', async () => {
    const cats = await seedCategories();
    const u = await signup(app, { role: 'technician' });
    const res = await api('patch', '/users/me/role-profile', u, {
      headline: 'Laptop and phone repair',
      experienceYears: 6,
      specializations: ['screen replacement', 'battery'],
      deviceCategories: [String(cats.laptop._id), String(cats.smartphone._id)],
      serviceLocation: { lat: 12.97, lng: 77.59 },
      serviceRadiusKm: 20,
      baseRate: 400,
      availability: { status: 'limited' },
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ headline: 'Laptop and phone repair', experienceYears: 6, serviceRadiusKm: 20 });
    expect(res.body.data.availability.status).toBe('limited');

    const stored = await TechnicianProfile.findOne({ user: u.id });
    expect(Array.from(stored.serviceLocation.coordinates)).toEqual([77.59, 12.97]);
    expect(stored.deviceCategories).toHaveLength(2);
    expect(stored.verification.status).toBe('not_submitted'); // untouched
  });

  it('refuses fields a provider must never set themselves', async () => {
    const u = await signup(app, { role: 'technician' });
    for (const bad of [{ verification: { status: 'approved' } }, { ratingAvg: 5 }, { earningsTotal: 1e6 }, { completedJobs: 99 }]) {
      expect((await api('patch', '/users/me/role-profile', u, bad)).status).toBe(422);
    }
    expect((await TechnicianProfile.findOne({ user: u.id })).verification.status).toBe('not_submitted');
  });

  it('rejects unknown categories and empty updates', async () => {
    await seedCategories();
    const u = await signup(app, { role: 'technician' });
    const res = await api('patch', '/users/me/role-profile', u, { deviceCategories: ['64b7f0f0f0f0f0f0f0f0f0f0'] });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('deviceCategories');
    expect((await api('patch', '/users/me/role-profile', u, {})).status).toBe(422);
  });

  it('uses the right rules per role (recycler)', async () => {
    const u = await signup(app, { role: 'recycler', organizationName: 'GreenLoop' });
    const res = await api('patch', '/users/me/role-profile', u, {
      name: 'GreenLoop Recyclers Pvt Ltd',
      authorizationNo: 'KSPCB/2024/118',
      validUntil: '2028-03-31',
      location: { lat: 12.95, lng: 77.6 },
    });
    expect(res.status).toBe(200);
    const stored = await RecyclingCenter.findOne({ user: u.id });
    expect(stored.name).toBe('GreenLoop Recyclers Pvt Ltd');
    expect(stored.validUntil.getUTCFullYear()).toBe(2028);
    expect((await api('patch', '/users/me/role-profile', u, { headline: 'technician field' })).status).toBe(422); // another role's field
  });

});

describe('DELETE /users/me', () => {
  it('needs the password', async () => {
    const u = await signup(app);
    expect((await api('delete', '/users/me', u, { password: 'Wrong-pass1' })).status).toBe(400);
    expect((await api('delete', '/users/me', u, {})).status).toBe(422);
  });

  it('wipes personal data, ends all sessions and frees the email', async () => {
    const u = await signup(app, { phone: '+91 98450 12345' });
    const res = await api('delete', '/users/me', u, { password: PASSWORD });
    expect(res.status).toBe(200);

    const stored = await User.findById(u.id);
    expect(stored).toMatchObject({ status: 'deleted', name: 'Deleted user' });
    expect(stored.email).not.toBe(u.email);
    expect(stored.phone).toBeUndefined();

    expect((await request(app).get('/api/auth/me').set(u.auth)).status).toBe(401);
    expect((await login(app, u.email)).status).toBe(401);
    expect((await request(app).post('/api/auth/register').send({ ...u.body })).status).toBe(201); // same email can sign up again
  });
});

describe('GET /users/:id (public card)', () => {
  it('shows only a name, picture, role, join date and the verified flag, with no sign-in', async () => {
    const tech = await signup(app, { role: 'technician' });
    await TechnicianProfile.updateOne({ user: tech.id }, { $set: { 'verification.status': 'approved' } });
    await User.updateOne({ _id: tech.id }, { $set: { status: 'active' } });
    const res = await request(app).get(`/api/users/${tech.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ _id: tech.id, role: 'technician', verified: true, avatarUrl: null });
    expect(Object.keys(res.body.data).sort()).toEqual(['_id', 'avatarUrl', 'memberSince', 'name', 'role', 'verified']);
    expect(JSON.stringify(res.body)).not.toContain(tech.email);
  });

  it('leaves the verified flag out for ordinary members', async () => {
    const u = await signup(app);
    const res = await request(app).get(`/api/users/${u.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.verified).toBeUndefined();
  });

  it('answers not found for suspended people, admins and bad ids, and keeps /users/me private', async () => {
    const u = await signup(app);
    const admin = await signup(app);
    await User.updateOne({ _id: admin.id }, { $set: { role: 'admin' } });
    await User.updateOne({ _id: u.id }, { $set: { status: 'suspended' } });
    expect((await request(app).get(`/api/users/${u.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/users/${admin.id}`)).status).toBe(404);
    expect((await request(app).get('/api/users/0123456789abcdef01234567')).status).toBe(404);
    expect((await request(app).get('/api/users/me/profile')).status).toBe(401);
  });
});

describe('/technicians/verification alias', () => {
  it('serves the same verification status as /verification/status', async () => {
    const tech = await signup(app, { role: 'technician' });
    const a = await request(app).get('/api/verification/status').set(tech.auth);
    const b = await request(app).get('/api/technicians/verification/status').set(tech.auth);
    expect(b.status).toBe(200);
    expect(b.body.data).toEqual(a.body.data);
    expect((await request(app).get('/api/technicians/verification/status')).status).toBe(401);
  });
});

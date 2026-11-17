'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, authHeader, seedCategories } = require('./helpers/factories');

// A sweep over every route the app has, so a route added later is covered without anyone remembering to add a test (P10-06).
// It checks three things: nothing answers a signed-out caller except the routes listed as public here, no route turns a
// malformed id or a query-operator trick into a server error, and a signed-in person of the wrong role is refused.
const app = createApp();

function pathOf(regexp) {
  return regexp.source.replace('\\/?(?=\\/|$)', '').replace(/^\^/, '').replace(/\\\//g, '/').replace(/\$$/, '').replace(/\(\?:\(\[\^\/\]\+\?\)\)/g, ':param');
}
function collect(stack, prefix = '', out = []) {
  for (const layer of stack) {
    if (layer.route) {
      for (const method of Object.keys(layer.route.methods)) out.push({ method, path: prefix + layer.route.path });
    } else if (layer.name === 'router' && layer.handle.stack) {
      collect(layer.handle.stack, prefix + pathOf(layer.regexp), out);
    }
  }
  return out;
}
const clean = (path) => (path.length > 1 ? path.replace(/\/+$/, '') : path);
const seen = new Set();
const ROUTES = collect(app._router.stack)
  .map((r) => ({ ...r, path: clean(r.path) }))
  .filter((r) => r.path.startsWith('/api'))
  .filter((r) => { const k = `${r.method} ${r.path}`; if (seen.has(k)) return false; seen.add(k); return true; });
const key = (r) => `${r.method.toUpperCase()} ${r.path}`;
const ID = '000000000000000000000001';
const concrete = (path, value = ID) => path.replace(/:[A-Za-z]+/g, value);

// Routes a signed-out caller is MEANT to reach. Anything else answering 2xx without a login is a hole.
const PUBLIC = new Set([
  'GET /api/health', 'GET /api/categories',
  'POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/refresh', 'POST /api/auth/logout', 'POST /api/auth/forgot-password',
  'POST /api/auth/reset-password', 'POST /api/auth/verify-email',
  'GET /api/devices', 'GET /api/devices/:id',
  'GET /api/technicians', 'GET /api/technicians/nearby', 'GET /api/technicians/:id',
  'GET /api/recycling-centers', 'GET /api/recycling-centers/:id',
  'GET /api/donations', 'GET /api/donations/:id',
  'GET /api/marketplace', 'GET /api/marketplace/:id',
  'GET /api/reviews',
  'GET /api/students/opportunities', 'GET /api/students/opportunities/:id', 'GET /api/students/certificates/verify/:certNo',
  'GET /api/education', 'GET /api/education/:slug',
  'GET /api/announcements', 'POST /api/contact',
  'GET /api/analytics/platform-impact', 'GET /api/analytics/rules',
  'GET /api/analytics/monthly', // the platform-wide months are public; `scope=me` needs a login (checked below)
  'GET /api/analytics/yearly', 'GET /api/analytics/by-category', // the same: platform-wide is public, `scope=me` needs a login
]);

let admin; let user;
beforeAll(async () => {
  await db.connect();
  await db.clear();
  await seedCategories();
  admin = await makeUser('admin');
  user = await makeUser('user');
});
afterAll(db.disconnect);

const send = (r, who, body) => {
  let req = request(app)[r.method](concrete(r.path));
  if (who) req = req.set(authHeader(who));
  return ['post', 'put', 'patch'].includes(r.method) ? req.send(body || {}) : req;
};

describe('the route table', () => {
  it('is found, and is big enough that the sweeps below mean something', () => {
    expect(ROUTES.length).toBeGreaterThan(150);
    expect(ROUTES.some((r) => key(r) === 'GET /api/education/:slug')).toBe(true);
    expect(ROUTES.some((r) => key(r) === 'PUT /api/admin/education/:id')).toBe(true);
  });
});

describe('signed-out callers', () => {
  it('get a login demand from every route that is not public, and never a server error from any', async () => {
    const holes = [];
    const errors = [];
    for (const r of ROUTES) {
      const res = await send(r, null);
      if (res.status >= 500) errors.push(`${key(r)} -> ${res.status}`);
      if (res.status < 400 && !PUBLIC.has(key(r))) holes.push(`${key(r)} -> ${res.status}`);
      if (!PUBLIC.has(key(r)) && res.status !== 401 && res.status !== 404 && res.status < 400) holes.push(`${key(r)} -> ${res.status}`);
    }
    expect(errors).toEqual([]);
    expect(holes).toEqual([]);
  });

  it('only public routes answer without a login: every non-public route says 401 (or 404 for a missing resource)', async () => {
    const odd = [];
    for (const r of ROUTES.filter((x) => !PUBLIC.has(key(x)))) {
      const res = await send(r, null);
      if (![401, 404].includes(res.status)) odd.push(`${key(r)} -> ${res.status}`);
    }
    expect(odd).toEqual([]);
  });

  it('keeps the personal scope of a public route behind a login', async () => {
    expect((await request(app).get('/api/analytics/monthly?scope=me')).status).toBe(401);
    expect((await request(app).get('/api/analytics/monthly')).status).toBe(200);
    for (const path of ['yearly', 'by-category']) {
      expect((await request(app).get(`/api/analytics/${path}?scope=me`)).status).toBe(401);
      expect((await request(app).get(`/api/analytics/${path}`)).status).toBe(200);
    }
  });

  it('every public route that is listed really exists', () => {
    const have = new Set(ROUTES.map(key));
    const missing = [...PUBLIC].filter((p) => !have.has(p));
    expect(missing).toEqual([]);
  });
});

describe('admin routes', () => {
  it('refuse every non-administrator, whatever the method', async () => {
    const wrong = [];
    for (const r of ROUTES.filter((x) => x.path.startsWith('/api/admin'))) {
      const res = await send(r, user);
      if (res.status !== 403) wrong.push(`${key(r)} -> ${res.status}`);
    }
    expect(wrong).toEqual([]);
  });
});

describe('malformed ids and query tricks', () => {
  const BAD_IDS = ['not-an-id', '{"$ne":1}', '%00', "'; drop table", '0'.repeat(30)];

  it('never cause a server error on any route that takes an id, for an administrator (who can reach the most)', async () => {
    const errors = [];
    for (const r of ROUTES.filter((x) => /:id\b|:userId\b|:docId\b/.test(x.path))) {
      for (const bad of BAD_IDS) {
        let req = request(app)[r.method](concrete(r.path, encodeURIComponent(bad))).set(authHeader(admin));
        if (['post', 'put', 'patch'].includes(r.method)) req = req.send({});
        const res = await req;
        if (res.status >= 500) errors.push(`${key(r)} with ${bad} -> ${res.status}`);
      }
    }
    expect(errors).toEqual([]);
  }, 120000);

  it('never cause a server error on a list route given operator-style or nested query parameters', async () => {
    const errors = [];
    const lists = ROUTES.filter((r) => r.method === 'get' && !/:[A-Za-z]+/.test(r.path));
    for (const r of lists) {
      for (const qs of ['?q[$ne]=1', '?page[$gt]=0', '?sort[$where]=1', '?status[]=a&status[]=b', '?limit=-5', '?page=abc', `?${'a'.repeat(5000)}=1`]) {
        const res = await request(app).get(`${r.path}${qs}`).set(authHeader(admin));
        if (res.status >= 500) errors.push(`${key(r)}${qs.slice(0, 30)} -> ${res.status}`);
      }
    }
    expect(errors).toEqual([]);
  }, 180000);

  it('treat an operator in a JSON body as a validation problem, not a query', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: { $ne: null }, password: { $ne: null } });
    expect(res.status).toBe(422);
    const res2 = await request(app).post('/api/auth/forgot-password').send({ email: { $gt: '' } });
    expect(res2.status).toBeLessThan(500);
    expect(res2.status).not.toBe(200);
  });
});
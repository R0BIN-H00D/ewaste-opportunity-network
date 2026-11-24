'use strict';
require('./helpers/env');
const express = require('express');
const request = require('supertest');
const createApp = require('../src/app');
const limiters = require('../src/middleware/rateLimit');

// Rate limiting (P3-11, NFR-SEC). The test environment turns the limits up so other tests are never throttled, so this file
// checks two things separately: that a limiter does what it should when it is set low, and that the routes that need one use one.

describe('a limiter set low', () => {
  /** A copy of the middleware module built with the given limit, then restored, because the limit is read once at load time. */
  function build(env) {
    const saved = { ...process.env };
    Object.assign(process.env, env);
    let mod;
    jest.isolateModules(() => { mod = require('../src/middleware/rateLimit'); });
    process.env = saved;
    return mod;
  }
  const appWith = (limiter) => { const app = express(); app.post('/try', limiter, (_req, res) => res.json({ ok: true })); return app; };

  it('lets the first few attempts through, then answers 429 in the usual shape, and says when the allowance returns', async () => {
    const { authLimiter } = build({ AUTH_RATE_LIMIT_MAX: '3', RATE_LIMIT_WINDOW_MS: '60000' });
    const app = appWith(authLimiter);
    const statuses = [];
    let last;
    for (let i = 0; i < 5; i += 1) { last = await request(app).post('/try'); statuses.push(last.status); }
    expect(statuses).toEqual([200, 200, 200, 429, 429]);
    expect(last.body).toMatchObject({ success: false, code: 'RATE_LIMITED' });
    expect(last.body.message).toMatch(/^Too many requests\. Please wait about (a minute|\d+ minutes) and try again\.$/);
    expect(last.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(last.body.retryAfterSeconds).toBeLessThanOrEqual(60);
    expect(last.headers['ratelimit-limit'] || last.headers['ratelimit-policy']).toBeDefined();
    expect(last.headers['retry-after']).toBeDefined();
  });

  it('counts each caller separately: one person being throttled does not lock out another', async () => {
    const { authLimiter } = build({ AUTH_RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' });
    const app = express();
    app.set('trust proxy', true);
    app.post('/try', authLimiter, (_req, res) => res.json({ ok: true }));
    const from = (ip) => request(app).post('/try').set('X-Forwarded-For', ip);
    await from('10.0.0.1'); await from('10.0.0.1');
    expect((await from('10.0.0.1')).status).toBe(429);
    expect((await from('10.0.0.2')).status).toBe(200);
  });

  it('says how long to wait, in minutes, when the wait is longer than one', async () => {
    const { authLimiter } = build({ AUTH_RATE_LIMIT_MAX: '1', RATE_LIMIT_WINDOW_MS: '600000' });
    const app = appWith(authLimiter);
    await request(app).post('/try');
    const res = await request(app).post('/try');
    expect(res.status).toBe(429);
    expect(res.body.message).toMatch(/Please wait about (9|10) minutes and try again/);
    expect(res.body.retryAfterSeconds).toBeGreaterThan(500);
  });

  it('counts only the failed sign-ins, so a person who signs in again and again is never locked out', async () => {
    const { loginLimiter } = build({ AUTH_RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' });
    const app = express();
    app.post('/login', loginLimiter, (req, res) => res.status(req.query.ok === '1' ? 200 : 401).json({}));
    for (let i = 0; i < 6; i += 1) expect((await request(app).post('/login?ok=1')).status).toBe(200); // successes are free
    expect((await request(app).post('/login?ok=0')).status).toBe(401);
    expect((await request(app).post('/login?ok=0')).status).toBe(401);
    expect((await request(app).post('/login?ok=0')).status).toBe(429); // the third failure is refused
  });

  it('does not count the background checks against the general allowance', async () => {
    const { globalLimiter } = build({ RATE_LIMIT_MAX: '2', RATE_LIMIT_WINDOW_MS: '60000' });
    const app = express();
    app.use(globalLimiter);
    app.get('/api/chat/unread-count', (_req, res) => res.json({ n: 0 }));
    app.get('/api/health', (_req, res) => res.json({ ok: true }));
    app.get('/api/things', (_req, res) => res.json({ ok: true }));
    for (let i = 0; i < 6; i += 1) {
      expect((await request(app).get('/api/chat/unread-count')).status).toBe(200);
      expect((await request(app).get('/api/health')).status).toBe(200);
    }
    expect((await request(app).get('/api/things')).status).toBe(200);
    expect((await request(app).get('/api/things')).status).toBe(200);
    expect((await request(app).get('/api/things')).status).toBe(429); // real requests still count
  });

  it('the contact form has its own, tighter allowance', async () => {
    const { contactLimiter } = build({ CONTACT_RATE_LIMIT_MAX: '1', RATE_LIMIT_WINDOW_MS: '60000' });
    const app = appWith(contactLimiter);
    expect((await request(app).post('/try')).status).toBe(200);
    expect((await request(app).post('/try')).status).toBe(429);
  });
});

describe('the routes that need a limiter have one', () => {
  const app = createApp();

  function walk(stack, prefix = '', out = []) {
    for (const layer of stack) {
      if (layer.route) out.push({ key: `${Object.keys(layer.route.methods)[0].toUpperCase()} ${(prefix + layer.route.path).replace(/\/+$/, '') || '/'}`, handlers: layer.route.stack.map((l) => l.handle) });
      else if (layer.name === 'router' && layer.handle.stack) {
        const mount = layer.regexp.source.replace('\\/?(?=\\/|$)', '').replace(/^\^/, '').replace(/\\\//g, '/').replace(/\$$/, '');
        walk(layer.handle.stack, prefix + mount, out);
      }
    }
    return out;
  }
  const routes = walk(app._router.stack);
  const handlersOf = (key) => routes.find((r) => r.key === key)?.handlers || [];

  it.each([
    ['POST /api/auth/login', 'loginLimiter'], ['POST /api/auth/register', 'authLimiter'], ['POST /api/auth/forgot-password', 'authLimiter'],
    ['POST /api/auth/reset-password', 'authLimiter'], ['POST /api/auth/verify-email', 'authLimiter'], ['POST /api/contact', 'contactLimiter'],
  ])('%s is limited by %s', (key, name) => {
    expect(handlersOf(key)).toContain(limiters[name]);
  });

  it('uploads are limited', () => {
    for (const key of ['POST /api/devices', 'POST /api/marketplace']) expect(handlersOf(key)).toContain(limiters.uploadLimiter);
  });

  it('every administrator route sits behind the admin limiter', () => {
    const router = require('../src/routes/admin.routes');
    expect(router.stack.some((l) => l.handle === limiters.adminLimiter)).toBe(true);
  });

  it('everything is behind the global limiter', () => {
    expect(app._router.stack.some((l) => l.handle === limiters.globalLimiter)).toBe(true);
  });
});
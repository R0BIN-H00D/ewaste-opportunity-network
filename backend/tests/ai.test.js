'use strict';
require('./helpers/env');
process.env.GEMINI_ENABLED = 'true';
process.env.GEMINI_API_KEY = 'test-key';
process.env.GEMINI_DAILY_LIMIT = '3';
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const gemini = require('../src/services/integrations/gemini');
const { PNG, makeUser, makeListing, authHeader, seedCategories } = require('./helpers/factories');

const app = createApp();
let owner; let cats; let sent;
const reply = (obj) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });
const GOOD = { categorySlug: 'laptop', brand: 'Dell', model: 'Inspiron 15', title: 'Dell Inspiron 15 laptop', condition: 'major_damage', problems: ['Cracked screen'], recommendation: 'repair', alternatives: ['refurbishment'], reasons: ['A screen swap is cheaper than a new laptop.'], skillsNeeded: ['Laptop screen replacement'], resaleMin: 8000, resaleMax: 12000, repairMin: 3000, repairMax: 5000, confidence: 0.8 };

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  owner = await makeUser('user');
  sent = [];
  gemini._resetQuota();
  global.fetch = jest.fn(async (url, opts) => { sent.push({ url, opts, body: JSON.parse(opts.body) }); return reply(GOOD); });
});

const analyze = (user, { text, photo = true } = {}) => {
  let r = request(app).post('/api/ai/analyze-device').set(authHeader(user));
  if (text) r = r.field('text', text);
  if (photo) r = r.attach('photos', PNG, { filename: 'd.png', contentType: 'image/png' });
  return r;
};

describe('device from a photo', () => {
  it('fills in the device from the photo, with a labelled estimate and advice', async () => {
    const res = await analyze(owner);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.source).toBe('ai');
    expect(d.category).toMatchObject({ slug: 'laptop' });
    expect(d).toMatchObject({ brand: 'Dell', model: 'Inspiron 15', condition: 'major_damage' });
    expect(d.problems).toEqual(['Cracked screen']);
    expect(d.advice.recommendation).toBe('repair');
    expect(d.estimate).toMatchObject({ isEstimate: true, currency: 'INR', resale: { min: 8000, max: 12000 }, repair: { min: 3000, max: 5000 } });
    expect(d.notice).toMatch(/suggestion/i);
  });

  it('sends the photo and key to Gemini, and the key never reaches the client', async () => {
    const res = await analyze(owner, { text: 'cracked screen' });
    expect(sent[0].url).toContain('generativelanguage.googleapis.com');
    expect(sent[0].opts.headers['x-goog-api-key']).toBe('test-key');
    expect(sent[0].body.contents[0].parts.some((p) => p.inline_data?.mime_type === 'image/png')).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('test-key');
  });

  it('ignores a category or condition the AI made up', async () => {
    global.fetch = jest.fn(async () => reply({ ...GOOD, categorySlug: 'spaceship', condition: 'shiny', recommendation: 'sell-on-moon', resaleMin: 'lots' }));
    const d = (await analyze(owner, { text: 'old laptop not working' })).body.data;
    expect(d.category.slug).toBe('laptop'); // from the words instead
    expect(d.condition).toBe('not_working');
    expect(['repair', 'recycling', 'reuse', 'refurbishment', 'donation']).toContain(d.advice.recommendation);
    expect(d.estimate.resale).toBeNull();
  });

  it('falls back to rules when Gemini fails, and says so', async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) }));
    const res = await analyze(owner, { text: 'Samsung phone with a cracked screen' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'rules', brand: 'Samsung', condition: 'major_damage' });
    expect(res.body.data.category.slug).toBe('smartphone');
    expect(res.body.data.unavailableReason).toBeTruthy();
  });

  it('stops calling Gemini once the daily limit is used', async () => {
    for (let i = 0; i < 3; i += 1) await analyze(owner);
    const res = await analyze(owner, { text: 'old tv' });
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('rules');
    expect(res.body.data.unavailableReason).toMatch(/quota/i);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it('needs a photo or some words, a signed-in person and a real image', async () => {
    expect((await analyze(owner, { photo: false })).status).toBe(422);
    expect((await request(app).post('/api/ai/analyze-device').field('text', 'x')).status).toBe(401);
    const bad = await request(app).post('/api/ai/analyze-device').set(authHeader(owner)).attach('photos', Buffer.from('not an image'), { filename: 'a.png', contentType: 'image/png' });
    expect(bad.status).toBe(422);
  });
});

describe('repair, reuse or recycle advice', () => {
  it('advises from a description', async () => {
    const res = await request(app).post('/api/ai/advice').set(authHeader(owner)).send({ category: 'laptop', condition: 'major_damage', issue: 'Screen is cracked' });
    expect(res.status).toBe(200);
    expect(res.body.data.source).toBe('ai');
    expect(res.body.data.advice).toMatchObject({ recommendation: 'repair', skillsNeeded: ['Laptop screen replacement'] });
    expect(res.body.data.estimate.repair).toEqual({ min: 3000, max: 5000 });
  });

  it('advises from one of my own listings and hides other people\'s', async () => {
    const mine = await makeListing(owner, cats.laptop);
    const other = await makeUser('user');
    const theirs = await makeListing(other, cats.laptop);
    expect((await request(app).post('/api/ai/advice').set(authHeader(owner)).send({ listingId: String(mine._id) })).status).toBe(200);
    expect((await request(app).post('/api/ai/advice').set(authHeader(owner)).send({ listingId: String(theirs._id) })).status).toBe(404);
  });

  it('refuses an empty question', async () => {
    expect((await request(app).post('/api/ai/advice').set(authHeader(owner)).send({})).status).toBe(422);
  });
});

describe('when Google is busy', () => {
  it('tries again and succeeds on a later attempt', async () => {
    process.env.GEMINI_RETRY_MS = '0';
    let calls = 0;
    global.fetch = jest.fn(async () => { calls += 1; return calls < 3 ? { ok: false, status: 503, json: async () => ({ error: { message: 'high demand' } }) } : reply(GOOD); });
    const res = await analyze(owner);
    expect(res.body.data.source).toBe('ai');
    expect(calls).toBe(3);
  });
});

describe('when Google is slow or drops the connection', () => {
  const timeout = () => Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
  const env = require('../src/config/env');

  it('counts a timeout like a busy answer and tries the next model', async () => {
    const urls = [];
    let calls = 0;
    global.fetch = jest.fn(async (url) => { urls.push(url); calls += 1; if (calls < 3) throw timeout(); return reply(GOOD); });
    const res = await analyze(owner);
    expect(res.body.data.source).toBe('ai');
    expect(calls).toBe(3);
    expect(new Set(urls).size).toBeGreaterThan(1); // not the same model every time
  });

  it('says the service is slow, and still answers from the rules, when every try times out', async () => {
    global.fetch = jest.fn(async () => { throw timeout(); });
    const res = await analyze(owner, { text: 'Dell laptop will not turn on' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'rules', brand: 'Dell', condition: 'not_working' });
    expect(res.body.data.unavailableReason).toMatch(/slow right now/);
    expect(global.fetch).toHaveBeenCalledTimes(env.GEMINI_ATTEMPTS);
  });

  it('remembers a good answer, so the same photos and words are not sent again', async () => {
    const before = env.GEMINI_CACHE_TTL_MS;
    env.GEMINI_CACHE_TTL_MS = 60000;
    try {
      const first = await analyze(owner, { text: 'old laptop' });
      const second = await analyze(owner, { text: 'old laptop' });
      expect(first.body.data.source).toBe('ai');
      expect(second.body.data).toEqual(first.body.data);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      await analyze(owner, { text: 'a different laptop' }); // other words: asked again
      expect(global.fetch).toHaveBeenCalledTimes(2);
    } finally {
      env.GEMINI_CACHE_TTL_MS = before;
    }
  });

  it('does not remember a failure', async () => {
    const before = env.GEMINI_CACHE_TTL_MS;
    env.GEMINI_CACHE_TTL_MS = 60000;
    try {
      global.fetch = jest.fn(async () => { throw timeout(); });
      await analyze(owner, { text: 'old tablet' });
      global.fetch = jest.fn(async () => reply(GOOD));
      const again = await analyze(owner, { text: 'old tablet' });
      expect(again.body.data.source).toBe('ai');
    } finally {
      env.GEMINI_CACHE_TTL_MS = before;
    }
  });
});

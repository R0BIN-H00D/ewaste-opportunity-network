'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const env = require('../src/config/env');
const AiUsage = require('../src/models/AiUsage');
const Device = require('../src/models/Device');
const { classifyByRules } = require('../src/services/classifierRules');
const classifier = require('../src/services/classifierService');
const { PNG, makeUser, authHeader, seedCategories } = require('./helpers/factories');

const app = createApp();
let user; let admin; let cats;

const classify = (who, fields = {}, photo = false) => {
  let r = request(app).post('/api/ai/classify');
  if (who) r = r.set(authHeader(who));
  for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
  if (photo) r = r.attach('photo', PNG, { filename: 'a.png', contentType: 'image/png' });
  return r;
};
const geminiAnswer = (over = {}) => ({
  ok: true,
  status: 200,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ category: 'laptop', deviceType: 'Laptop', brand: 'Dell', visibleDamage: ['Scratches on the lid'], possibleRepairs: ['Hinge check'], confidence: 0.82, ...over }) }] } }] }),
});

const original = { enabled: env.GEMINI_ENABLED, key: env.GEMINI_API_KEY, limit: env.GEMINI_DAILY_LIMIT };
const turnOn = (limit = 50) => { env.GEMINI_ENABLED = true; env.GEMINI_API_KEY = 'test-key'; env.GEMINI_DAILY_LIMIT = limit; };

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  user = await makeUser('user');
  admin = await makeUser('admin');
});
afterEach(() => {
  env.GEMINI_ENABLED = original.enabled; env.GEMINI_API_KEY = original.key; env.GEMINI_DAILY_LIMIT = original.limit;
  jest.restoreAllMocks();
});

describe('the rule-based classifier', () => {
  it('picks the category the words point to, title first', () => {
    expect(classifyByRules({ title: 'Dell Inspiron laptop' }).slug).toBe('laptop');
    expect(classifyByRules({ title: 'Old Samsung Galaxy phone' }).slug).toBe('smartphone');
    expect(classifyByRules({ title: 'Wireless mouse' }).slug).toBe('mouse');
    expect(classifyByRules({ title: 'Some old thing', description: 'it is a printer with spare cartridges' }).slug).toBe('printer');
    expect(classifyByRules({ title: 'Kitchen mixer' }).slug).toBeNull();
    expect(classifyByRules({ title: '' }).confidence).toBe(0);
  });

  it('matches whole words only', () => {
    expect(classifyByRules({ title: 'Tablet stand' }).slug).toBe('tablet');
    expect(classifyByRules({ title: 'Ramshackle shed' }).slug).toBeNull(); // "ram" inside a word is not RAM
    expect(classifyByRules({ title: 'Mobiles shop sign' }).slug).toBeNull();
  });

  it('finds the brand, the damage the text describes and what to look at', () => {
    const r = classifyByRules({ title: 'HP laptop', description: 'Cracked screen and a dent on the lid. Battery is swollen. It will not turn on.' });
    expect(r.brand).toBe('HP');
    expect(r.visibleDamage).toEqual(expect.arrayContaining(['Cracked or broken screen', 'Dents', 'Swollen battery']));
    expect(r.possibleRepairs).toEqual(expect.arrayContaining(['Screen replacement', 'Check the charger, battery and power circuit']));
  });

  it('is never more than moderately sure', () => {
    const r = classifyByRules({ title: 'laptop notebook macbook thinkpad', description: 'chromebook ideapad' });
    expect(r.confidence).toBeLessThanOrEqual(0.8);
    expect(r.confidence).toBeGreaterThan(0.3);
  });
});

describe('POST /api/ai/classify', () => {
  it('needs a login and a role that can list devices', async () => {
    expect((await classify(null, { title: 'laptop' })).status).toBe(401);
    expect((await classify(admin, { title: 'laptop' })).status).toBe(403);
  });

  it('answers from the words when Gemini is not set up, with the category, the disclaimer and the reason', async () => {
    const res = await classify(user, { title: 'Lenovo ThinkPad laptop', description: 'Scratches on the lid' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      source: 'rules', brand: 'Lenovo', usedPhoto: false, fallbackReason: 'not_configured', visibleDamage: ['Scratches'],
      category: { slug: 'laptop', name: 'Laptop' }, deviceType: 'Laptop',
    });
    expect(res.body.data.category._id).toBe(String(cats.laptop._id));
    expect(res.body.data.disclaimer).toMatch(/cannot show whether a device is damaged inside/);
  });

  it('says it does not know rather than guessing', async () => {
    const res = await classify(user, { title: 'Thing' });
    expect(res.body.data).toMatchObject({ category: null, deviceType: null, confidence: 0, brand: null, visibleDamage: [], possibleRepairs: [] });
  });

  it('works with only a photo and no words, and says the photo was not read when Gemini is off', async () => {
    const res = await classify(user, {}, true);
    expect(res.status).toBe(200);
    expect(res.body.data.usedPhoto).toBe(false);
    expect(res.body.data.fallbackReason).toBe('not_configured');
  });

  it('refuses a file that is not an image, and unknown fields', async () => {
    const bad = await request(app).post('/api/ai/classify').set(authHeader(user)).attach('photo', Buffer.from('plain text'), { filename: 'x.png', contentType: 'image/png' });
    expect(bad.status).toBe(422);
    expect((await classify(user, { title: 'laptop', extra: 'x' })).status).toBe(422);
  });

  it('uses Gemini for a photo when it is on, sends the key in a header and keeps it out of the URL', async () => {
    turnOn();
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(geminiAnswer());
    const res = await classify(user, { title: 'old computer' }, true);
    expect(res.body.data).toMatchObject({ source: 'gemini', usedPhoto: true, fallbackReason: null, brand: 'Dell', deviceType: 'Laptop', confidence: 0.82, category: { slug: 'laptop' } });
    expect(res.body.data.visibleDamage).toEqual(['Scratches on the lid']);
    const [url, options] = spy.mock.calls[0];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).not.toContain('test-key');
    expect(options.headers['x-goog-api-key']).toBe('test-key');
    expect(JSON.parse(options.body).contents[0].parts[1].inline_data.mime_type).toBe('image/png');
    expect(await AiUsage.countDocuments()).toBe(1);
  });

  it('does not call Gemini without a photo, and says why', async () => {
    turnOn();
    const spy = jest.spyOn(global, 'fetch');
    const res = await classify(user, { title: 'Dell laptop' });
    expect(spy).not.toHaveBeenCalled();
    expect(res.body.data).toMatchObject({ source: 'rules', fallbackReason: 'no_photo', category: { slug: 'laptop' } });
  });

  it('falls back to the words when Gemini fails, times out, answers badly or names a category that does not exist', async () => {
    turnOn();
    const cases = [
      () => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 429, json: async () => ({}) }),
      () => jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new Error('timeout'), { name: 'TimeoutError' })),
      () => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json' }] } }] }) }),
      () => jest.spyOn(global, 'fetch').mockResolvedValue(geminiAnswer({ confidence: 7 })), // out of range
    ];
    for (const setUp of cases) {
      jest.restoreAllMocks();
      setUp();
      const res = await classify(user, { title: 'HP laptop' }, true);
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ source: 'rules', usedPhoto: false, fallbackReason: 'unavailable', brand: 'HP', category: { slug: 'laptop' } });
    }
    jest.restoreAllMocks();
    jest.spyOn(global, 'fetch').mockResolvedValue(geminiAnswer({ category: 'spaceship' }));
    const odd = await classify(user, { title: 'HP laptop' }, true);
    expect(odd.body.data.category.slug).toBe('laptop'); // an invented category is ignored, the words still count
  });

  it('stops using Gemini when the day\'s allowance is used up, and starts again the next day', async () => {
    turnOn(2);
    const spy = jest.spyOn(global, 'fetch').mockResolvedValue(geminiAnswer());
    const a = await classify(user, { title: 'laptop' }, true);
    const b = await classify(user, { title: 'laptop' }, true);
    const c = await classify(user, { title: 'laptop' }, true);
    expect([a, b, c].map((r) => r.body.data.source)).toEqual(['gemini', 'gemini', 'rules']);
    expect(c.body.data.fallbackReason).toBe('quota');
    expect(spy).toHaveBeenCalledTimes(2);
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
    const next = await classifier.classify({ title: 'laptop', photo: { buffer: PNG, mime: 'image/png' }, now: tomorrow });
    expect(next.source).toBe('gemini');
  });

  it('never goes over the allowance when requests arrive together', async () => {
    turnOn(3);
    jest.spyOn(global, 'fetch').mockResolvedValue(geminiAnswer());
    const out = await Promise.all(Array.from({ length: 8 }, () => classify(user, { title: 'laptop' }, true)));
    expect(out.filter((r) => r.body.data.source === 'gemini')).toHaveLength(3);
    expect((await AiUsage.findOne()).count).toBe(3);
  });

  it('a limit of zero means never', async () => {
    turnOn(0);
    const spy = jest.spyOn(global, 'fetch');
    const res = await classify(user, { title: 'laptop' }, true);
    expect(spy).not.toHaveBeenCalled();
    expect(res.body.data.fallbackReason).toBe('quota');
  });
});

describe('saving a confirmed suggestion with a listing', () => {
  const create = (suggestion) => {
    let r = request(app).post('/api/devices').set(authHeader(user))
      .field('name', 'Dell laptop').field('category', 'laptop').field('condition', 'minor_damage').field('preferredService', 'repair')
      .attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' });
    if (suggestion !== undefined) r = r.field('aiSuggestion', typeof suggestion === 'string' ? suggestion : JSON.stringify(suggestion));
    return r;
  };

  it('stores what the person accepted, marked as confirmed', async () => {
    const res = await create({ source: 'gemini', category: 'laptop', type: 'Laptop', brand: 'Dell', visibleDamage: ['Scratches'], possibleRepairs: [], confidence: 0.8 });
    expect(res.status).toBe(201);
    const device = await Device.findOne();
    expect(device.aiSuggestion).toMatchObject({ source: 'gemini', brand: 'Dell', confirmedByUser: true });
    expect(device.aiSuggestion.visibleDamage).toEqual(['Scratches']);
  });

  it('is optional, and a malformed one is refused rather than stored', async () => {
    expect((await create()).status).toBe(201);
    expect((await Device.findOne()).aiSuggestion?.source).toBeUndefined();
    expect((await create('not json')).status).toBe(422);
    expect((await create({ source: 'magic' })).status).toBe(422);
    expect((await create({ source: 'rules', confirmedByUser: false })).status).toBe(422); // the server decides what is confirmed
  });
});
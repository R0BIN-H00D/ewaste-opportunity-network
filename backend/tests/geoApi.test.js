'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const geocoder = require('../src/services/integrations/geocoder');
const { makeUser, authHeader } = require('./helpers/factories');

const app = createApp();
let user; let admin;
const nominatim = (over = {}) => ({
  display_name: 'Indiranagar, Bengaluru, Karnataka, 560038, India', lat: '12.971599', lon: '77.641234',
  address: { suburb: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', postcode: '560038' }, ...over,
});
const answer = (body, ok = true, status = 200) => ({ ok, status, json: async () => body });
const search = (q, who = user) => { const r = request(app).get('/api/geo/search').query({ q }); return who ? r.set(authHeader(who)) : r; };
const reverse = (lat, lng, who = user) => { const r = request(app).get('/api/geo/reverse').query({ lat, lng }); return who ? r.set(authHeader(who)) : r; };

beforeAll(async () => { await db.connect(); });
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  geocoder._reset();
  user = await makeUser('user');
  admin = await makeUser('admin');
});
afterEach(() => geocoder._setFetch(null));

describe('GET /api/geo/search', () => {
  it('turns a typed address into places to choose from, with the area and city to fill in', async () => {
    const f = jest.fn().mockResolvedValue(answer([nominatim(), nominatim({ lat: '13.0', lon: '77.6', display_name: 'Somewhere else', address: { town: 'Hosur' } })]));
    geocoder._setFetch(f);
    const res = await search('Indiranagar Bengaluru');
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toEqual({ label: 'Indiranagar, Bengaluru, Karnataka, 560038, India', lat: 12.9716, lng: 77.64123, area: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', postcode: '560038' });
    expect(res.body.data[1]).toMatchObject({ area: '', city: 'Hosur' });
  });

  it('follows the service\'s usage policy: a real User-Agent, India only, five at most, no bulk', async () => {
    const f = jest.fn().mockResolvedValue(answer([]));
    geocoder._setFetch(f);
    await search('12 MG Road');
    const [url, options] = f.mock.calls[0];
    expect(url).toContain('/search?');
    expect(url).toContain('countrycodes=in');
    expect(url).toContain('limit=5');
    expect(options.headers['User-Agent']).toMatch(/EWaste/);
    expect(options.signal).toBeDefined();
  });

  it('keeps answers, so the same search is not sent twice (even typed differently)', async () => {
    const f = jest.fn().mockResolvedValue(answer([nominatim()]));
    geocoder._setFetch(f);
    await search('Indiranagar  Bengaluru');
    await search('indiranagar bengaluru');
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('sends searches one after another, never together', async () => {
    let running = 0; let most = 0;
    geocoder._setFetch(async () => { running += 1; most = Math.max(most, running); await new Promise((r) => setTimeout(r, 20)); running -= 1; return answer([nominatim()]); });
    const results = await Promise.all(['aaa one', 'bbb two', 'ccc three', 'ddd four'].map((q) => search(q)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(most).toBe(1);
  });

  it('says plainly when the service is unavailable, and carries on afterwards', async () => {
    const f = jest.fn().mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'TimeoutError' })).mockResolvedValueOnce(answer({}, false, 429)).mockResolvedValue(answer([nominatim()]));
    geocoder._setFetch(f);
    const a = await search('first try here');
    expect(a.status).toBe(503);
    expect(a.body.code).toBe('GEOCODER_UNAVAILABLE');
    expect(a.body.message).toMatch(/enter the area and city yourself/);
    expect((await search('second try here')).status).toBe(503);
    expect((await search('third try here')).status).toBe(200); // a failure did not block the queue
  });

  it('does not remember a failure', async () => {
    const f = jest.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(answer([nominatim()]));
    geocoder._setFetch(f);
    expect((await search('same text here')).status).toBe(503);
    expect((await search('same text here')).status).toBe(200);
  });

  it('ignores rows without a usable position, and an answer that is not a list', async () => {
    geocoder._setFetch(jest.fn().mockResolvedValueOnce(answer([nominatim({ lat: 'x' }), nominatim()])).mockResolvedValueOnce(answer({ error: 'odd' })));
    expect((await search('has a bad row')).body.data).toHaveLength(1);
    expect((await search('odd answer here')).body.data).toEqual([]);
  });

  it('checks what was typed, and needs a sign-in and a role that has addresses', async () => {
    geocoder._setFetch(jest.fn());
    expect((await search('ab')).status).toBe(422);
    expect((await search('x'.repeat(121))).status).toBe(422);
    expect((await request(app).get('/api/geo/search').set(authHeader(user)).query({ q: 'abc', extra: '1' })).status).toBe(422);
    expect((await request(app).get('/api/geo/search').set(authHeader(user)).query({ 'q[$ne]': 'abc' })).status).toBe(422);
    expect((await search('valid text', null)).status).toBe(401);
    expect((await search('valid text', admin)).status).toBe(403);
  });

  it('never writes what was searched for to the log', async () => {
    const logger = require('../src/utils/logger');
    const spy = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    geocoder._setFetch(jest.fn().mockRejectedValue(new Error('down')));
    await search('my secret home address 12');
    expect(JSON.stringify(spy.mock.calls)).not.toContain('secret');
    spy.mockRestore();
  });
});

describe('GET /api/geo/reverse', () => {
  it('names the area and city for a point', async () => {
    const f = jest.fn().mockResolvedValue(answer(nominatim()));
    geocoder._setFetch(f);
    const res = await reverse(12.9716, 77.6412);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ area: 'Indiranagar', city: 'Bengaluru' });
    expect(f.mock.calls[0][0]).toContain('/reverse?');
  });

  it('shares one answer between points a stone\'s throw apart', async () => {
    const f = jest.fn().mockResolvedValue(answer(nominatim()));
    geocoder._setFetch(f);
    await reverse(12.97161, 77.64121);
    await reverse(12.97162, 77.64122);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('says "not found" for a point with nothing known there, and remembers that too', async () => {
    const f = jest.fn().mockResolvedValue(answer({ error: 'Unable to geocode' }));
    geocoder._setFetch(f);
    expect((await reverse(0.001, 0.001)).status).toBe(404);
    expect((await reverse(0.001, 0.001)).status).toBe(404);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('checks the coordinates', async () => {
    geocoder._setFetch(jest.fn());
    expect((await reverse(91, 0)).status).toBe(422);
    expect((await reverse(0, 181)).status).toBe(422);
    expect((await request(app).get('/api/geo/reverse').set(authHeader(user)).query({ lat: 'north', lng: 1 })).status).toBe(422);
    expect((await request(app).get('/api/geo/reverse').set(authHeader(user)).query({ lat: 1 })).status).toBe(422);
    expect((await reverse(1, 1, null)).status).toBe(401);
  });

  it('says the service is unavailable rather than guessing', async () => {
    geocoder._setFetch(jest.fn().mockRejectedValue(new Error('down')));
    expect((await reverse(12.9, 77.6)).status).toBe(503);
  });
});
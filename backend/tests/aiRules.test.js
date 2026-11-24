'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, authHeader, seedCategories } = require('./helpers/factories');
const { ruleAdvice } = require('../src/services/aiService');

const app = createApp();
let owner;
beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => { await db.clear(); await seedCategories(); owner = await makeUser('user'); global.fetch = jest.fn(); });

describe('with AI switched off', () => {
  it('reports that photo reading is off', async () => {
    expect((await request(app).get('/api/ai/status').set(authHeader(owner))).body.data.photoAi).toBe(false);
  });

  it('still reads the words and never calls an AI service', async () => {
    const res = await request(app).post('/api/ai/analyze-device').set(authHeader(owner)).field('text', 'Dell laptop, will not turn on');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ source: 'rules', brand: 'Dell', condition: 'not_working' });
    expect(res.body.data.category.slug).toBe('laptop');
    expect(res.body.data.advice.recommendation).toBe('repair');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('the rule of thumb', () => {
  it('recycles hazardous devices that do not work, reuses working ones, repairs small faults', () => {
    expect(ruleAdvice({ category: { hazardous: true }, condition: 'not_working' }).recommendation).toBe('recycling');
    expect(ruleAdvice({ category: { hazardous: false }, condition: 'for_spare_parts' }).recommendation).toBe('recycling');
    expect(ruleAdvice({ category: {}, condition: 'fully_working' }).recommendation).toBe('reuse');
    expect(ruleAdvice({ category: {}, condition: 'minor_damage' }).recommendation).toBe('repair');
    expect(ruleAdvice({ category: {}, condition: 'major_damage' }).recommendation).toBe('refurbishment');
  });
});

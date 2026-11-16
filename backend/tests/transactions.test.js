'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const ServiceRequest = require('../src/models/ServiceRequest');
const Transaction = require('../src/models/Transaction');

const app = createApp();
let owner; let tech; let sr; let tx;

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  const cats = await seedCategories();
  owner = await makeUser('user', { name: 'Asha Rao' });
  tech = await makeTechnician({ user: { name: 'Ravi Kumar' } });
  const listing = await makeListing(owner, cats.laptop);
  sr = await ServiceRequest.create({ listing: listing._id, customer: owner.id, technician: tech.id, mode: 'targeted', status: 'service_completed', issueDescription: 'Screen' });
  tx = await Transaction.create({ type: 'repair', refType: 'ServiceRequest', refId: sr._id, payer: owner.id, payee: tech.id, amount: 800, method: 'offline', status: 'recorded' });
});

const get = (user, path = '', query = {}) => request(app).get(`/api/transactions${path}`).query(query).set(user ? authHeader(user) : {});
const confirm = (user, id, body = {}) => request(app).put(`/api/transactions/${id}/confirm`).set(user ? authHeader(user) : {}).send(body);

describe('GET /api/transactions', () => {
  it('requires authentication', async () => {
    expect((await get(null)).status).toBe(401);
  });

  it('shows the customer what they paid and to whom', async () => {
    const res = await get(owner);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      direction: 'paid', amount: 800, status: 'recorded', method: 'offline', canConfirm: false,
      counterparty: { name: 'Ravi Kumar' },
      subject: { kind: 'repair', title: 'HP Pavilion laptop', link: `/dashboard/requests/${sr._id}` },
    });
    expect(JSON.stringify(res.body)).not.toContain('@test.local');
  });

  it('shows the technician what they received, with the option to confirm', async () => {
    const res = await get(tech);
    expect(res.body.data[0]).toMatchObject({ direction: 'received', counterparty: { name: 'Asha Rao' }, canConfirm: true });
  });

  it('shows nothing to people who were not part of it', async () => {
    const stranger = await makeUser('user');
    expect((await get(stranger)).body.data).toEqual([]);
  });

  it('filters by direction, type and status and validates the filters', async () => {
    expect((await get(owner, '', { direction: 'received' })).body.data).toHaveLength(0);
    expect((await get(owner, '', { direction: 'paid', type: 'repair', status: 'recorded' })).body.data).toHaveLength(1);
    expect((await get(owner, '', { type: 'recycling' })).body.data).toHaveLength(0);
    expect((await get(owner, '', { type: 'bogus' })).status).toBe(422);
  });

  it('paginates', async () => {
    await Transaction.create({ type: 'repair', refType: 'ServiceRequest', refId: sr._id, payer: owner.id, payee: tech.id, amount: 100 });
    const res = await get(owner, '', { limit: 1, page: 2 });
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 2, pages: 2, page: 2 });
  });
});

describe('GET /api/transactions/summary', () => {
  it('totals what was paid and received, and what still needs confirming', async () => {
    const t = (await get(tech, '/summary')).body.data;
    expect(t).toMatchObject({ received: { count: 1, total: 800 }, paid: { count: 0, total: 0 }, awaitingConfirmation: 1 });
    const o = (await get(owner, '/summary')).body.data;
    expect(o).toMatchObject({ paid: { count: 1, total: 800 }, received: { total: 0 }, awaitingConfirmation: 0 });
  });

  it('leaves disputed records out', async () => {
    await Transaction.updateOne({ _id: tx._id }, { $set: { status: 'disputed' } });
    expect((await get(tech, '/summary')).body.data.received).toEqual({ count: 0, total: 0 });
  });
});

describe('PUT /api/transactions/:id/confirm', () => {
  it('lets the person who was paid confirm, once, with a reference', async () => {
    const res = await confirm(tech, tx._id, { reference: 'UPI 12345' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'confirmed', reference: 'UPI 12345', canConfirm: false });
    expect((await Transaction.findById(tx._id)).confirmedBy.toString()).toBe(tech.id);
    expect((await confirm(tech, tx._id)).status).toBe(409);
    expect((await get(tech, '/summary')).body.data.awaitingConfirmation).toBe(0);
  });

  it('does not let the payer confirm their own payment', async () => {
    expect((await confirm(owner, tx._id)).status).toBe(403);
    expect((await Transaction.findById(tx._id)).status).toBe('recorded');
  });

  it('hides it from strangers and rejects bad ids and fields', async () => {
    const stranger = await makeUser('user');
    expect((await confirm(stranger, tx._id)).status).toBe(404);
    expect((await confirm(tech, 'nope')).status).toBe(404);
    expect((await confirm(tech, tx._id, { amount: 1 })).status).toBe(422);
    expect((await confirm(null, tx._id)).status).toBe(401);
  });
});

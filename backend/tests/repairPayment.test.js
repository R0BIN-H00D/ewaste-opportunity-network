'use strict';
require('./helpers/env');
process.env.RAZORPAY_KEY_ID = 'rzp_test_demo123';
process.env.RAZORPAY_KEY_SECRET = 'demo_secret_value';
const crypto = require('crypto');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { PNG, makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const Transaction = require('../src/models/Transaction');

const app = createApp();
let owner; let tech; let cats; let listing; let calls;
const sign = (o, p) => crypto.createHmac('sha256', 'demo_secret_value').update(`${o}|${p}`).digest('hex');
const GOOD = () => ({ razorpay_order_id: 'order_REP12345', razorpay_payment_id: 'pay_REP1', razorpay_signature: sign('order_REP12345', 'pay_REP1') });
const base = (id, path) => `/api/service-requests/${id}${path}`;
const post = (user, id, path, body = {}) => request(app).post(base(id, path)).set(authHeader(user)).send(body);
const get = (user, id) => request(app).get(base(id, '')).set(authHeader(user));

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  owner = await makeUser('user');
  tech = await makeTechnician();
  listing = await makeListing(owner, cats.laptop);
  calls = [];
  global.fetch = jest.fn(async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    return { ok: true, json: async () => ({ id: 'order_REP12345', amount: 80000, currency: 'INR' }) };
  });
});

/** An on-site repair at "repair in progress" with an approved quotation of 800. */
async function toRepair() {
  const res = await request(app).post('/api/service-requests').set(authHeader(owner)).send({ listingId: String(listing._id), technicianId: tech.id, issueDescription: 'Screen is cracked', onSite: true });
  const id = res.body.data._id;
  await request(app).put(base(id, '/status')).set(authHeader(tech)).send({ status: 'technician_assigned' });
  await request(app).put(base(id, '/status')).set(authHeader(tech)).send({ status: 'diagnosis_in_progress' });
  const q = await post(tech, id, '/quotation', { amount: 800 });
  await request(app).put(base(id, `/quotation/${q.body.data.activeQuotation._id}/decision`)).set(authHeader(owner)).send({ decision: 'accept' });
  return id;
}
const finishWork = (id) => request(app).put(base(id, '/status')).set(authHeader(tech)).field('status', 'repair_completed').field('note', 'Done').attach('photos', PNG, { filename: 'd.png', contentType: 'image/png' });

describe('paying for a repair online (Razorpay test mode)', () => {
  it('offers Pay only after the quotation is approved, and only to the customer', async () => {
    const id = await toRepair();
    expect((await get(owner, id)).body.data.actions).toContain('pay');
    expect((await get(tech, id)).body.data.actions).not.toContain('pay');
  });

  it('does not offer Pay before the quotation is approved', async () => {
    const res = await request(app).post('/api/service-requests').set(authHeader(owner)).send({ listingId: String(listing._id), technicianId: tech.id, issueDescription: 'Screen is cracked', onSite: true });
    expect((await get(owner, res.body.data._id)).body.data.actions).not.toContain('pay');
    expect((await post(owner, res.body.data._id, '/payment')).status).toBe(409);
  });

  it('creates the gateway order from the approved quotation amount, in paise', async () => {
    const id = await toRepair();
    const res = await post(owner, id, '/payment');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ keyId: 'rzp_test_demo123', gatewayOrderId: 'order_REP12345', testMode: true });
    expect(calls[0].body.amount).toBe(80000);
    expect((await post(tech, id, '/payment')).status).toBe(403);
  });

  it('marks it paid on a correct signature, hides Pay, and blocks revising the quotation', async () => {
    const id = await toRepair();
    await post(owner, id, '/payment');
    const res = await post(owner, id, '/payment/verify', GOOD());
    expect(res.status).toBe(200);
    expect(res.body.data.payment.status).toBe('paid_online');
    expect(res.body.data.actions).not.toContain('pay');
    expect((await post(owner, id, '/payment/verify', GOOD())).status).toBe(200); // repeating is harmless
    expect((await get(tech, id)).body.data.actions).not.toContain('revise_quotation');
    expect((await post(tech, id, '/quotation', { amount: 900 })).status).toBe(409);
  });

  it('rejects a wrong signature and a payment for another gateway order', async () => {
    const id = await toRepair();
    await post(owner, id, '/payment');
    expect((await post(owner, id, '/payment/verify', { ...GOOD(), razorpay_signature: 'f'.repeat(64) })).status).toBe(400);
    expect((await post(owner, id, '/payment/verify', { razorpay_order_id: 'order_OTHER99', razorpay_payment_id: 'pay_X1234', razorpay_signature: sign('order_OTHER99', 'pay_X1234') })).status).toBe(400);
    expect((await get(owner, id)).body.data.payment.status).toBe('unpaid');
  });

  it('refuses a second payment', async () => {
    const id = await toRepair();
    await post(owner, id, '/payment');
    await post(owner, id, '/payment/verify', GOOD());
    expect((await post(owner, id, '/payment')).status).toBe(409);
  });

  it('records a confirmed online transaction when the customer confirms the work', async () => {
    const id = await toRepair();
    await post(owner, id, '/payment');
    await post(owner, id, '/payment/verify', GOOD());
    expect((await finishWork(id)).status).toBe(200);
    expect((await post(owner, id, '/confirm-completion')).status).toBe(200);
    expect(await Transaction.findOne({ refId: id })).toMatchObject({ method: 'online', status: 'confirmed', reference: 'pay_REP1', amount: 800 });
  });

  it('still records an offline transaction when nobody paid online', async () => {
    const id = await toRepair();
    await finishWork(id);
    await post(owner, id, '/confirm-completion');
    expect(await Transaction.findOne({ refId: id })).toMatchObject({ method: 'offline', status: 'recorded' });
  });
});

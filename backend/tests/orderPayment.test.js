'use strict';
require('./helpers/env');
process.env.RAZORPAY_KEY_ID = 'rzp_test_demo123';
process.env.RAZORPAY_KEY_SECRET = 'demo_secret_value';
const crypto = require('crypto');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, authHeader, seedCategories } = require('./helpers/factories');
const RefurbisherProfile = require('../src/models/RefurbisherProfile');
const MarketplaceProduct = require('../src/models/MarketplaceProduct');
const Order = require('../src/models/Order');
const Transaction = require('../src/models/Transaction');

const app = createApp();
let cats; let seller; let buyer; let other;
const DELIVERY = { deliveryArea: 'Indiranagar', deliveryCity: 'Bengaluru', deliveryPincode: '560038' };
const api = (method, url, user, body) => {
  const r = request(app)[method](`/api/orders${url}`).set(authHeader(user));
  return body === undefined ? r : r.send(body);
};
const sign = (orderId, paymentId) => crypto.createHmac('sha256', 'demo_secret_value').update(`${orderId}|${paymentId}`).digest('hex');
const GOOD = () => ({ razorpay_order_id: 'order_TEST12345', razorpay_payment_id: 'pay_TEST1', razorpay_signature: sign('order_TEST12345', 'pay_TEST1') });
let calls;
beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  seller = await makeUser('refurbisher', { name: 'Ravi' });
  await RefurbisherProfile.create({ user: seller.id, businessName: 'Ravi Works', city: 'Bengaluru', verification: { status: 'approved' } });
  buyer = await makeUser('user', { name: 'Buyer' });
  other = await makeUser('user', { name: 'Other' });
  calls = [];
  global.fetch = jest.fn(async (url, opts) => {
    calls.push({ url, body: opts.body ? JSON.parse(opts.body) : null });
    const json = url.endsWith('/orders') ? { id: 'order_TEST12345', amount: 1500000, currency: 'INR' } : { id: 'rfnd_TEST1' };
    return { ok: true, json: async () => json };
  });
});
const makeOrder = async (paymentMethod = 'online') => {
  const p = await MarketplaceProduct.create({ seller: seller.id, title: 'ThinkPad', category: cats.laptop._id, condition: 'good', refurbishmentInfo: 'New battery and SSD, tested.', price: 15000, stock: 2, photos: [{ url: '/u/p.png', publicId: 'p' }] });
  const res = await api('post', '', buyer, { productId: String(p._id), paymentMethod, ...DELIVERY });
  return res.body.data;
};
const payFully = async (o) => {
  await api('post', `/${o._id}/payment`, buyer);
  return api('post', `/${o._id}/payment/verify`, buyer, GOOD());
};

describe('online payment (Razorpay test mode)', () => {
  it('lets a buyer place an online order and shows a pay action', async () => {
    const o = await makeOrder();
    expect(o.paymentMethod).toBe('online');
    expect(o.actions).toContain('pay');
  });

  it('creates a gateway order with the amount taken from the server, in paise', async () => {
    const o = await makeOrder();
    const res = await api('post', `/${o._id}/payment`, buyer);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ keyId: 'rzp_test_demo123', gatewayOrderId: 'order_TEST12345', testMode: true });
    expect(calls[0].body.amount).toBe(1500000);
    expect(JSON.stringify(res.body)).not.toContain('demo_secret_value');
  });

  it('only the buyer can pay, and only online orders', async () => {
    const o = await makeOrder();
    expect((await api('post', `/${o._id}/payment`, seller)).status).toBe(403);
    expect((await api('post', `/${o._id}/payment`, other)).status).toBe(404);
    const cod = await makeOrder('cod');
    expect((await api('post', `/${cod._id}/payment`, buyer)).status).toBe(409);
  });

  it('marks the order paid when the signature is right, and repeating is harmless', async () => {
    const o = await makeOrder();
    const res = await payFully(o);
    expect(res.status).toBe(200);
    expect(res.body.data.paymentStatus).toBe('paid_online');
    expect(res.body.data.actions).not.toContain('pay');
    expect((await api('post', `/${o._id}/payment/verify`, buyer, GOOD())).status).toBe(200);
  });

  it('rejects a wrong signature and leaves the order unpaid', async () => {
    const o = await makeOrder();
    await api('post', `/${o._id}/payment`, buyer);
    const res = await api('post', `/${o._id}/payment/verify`, buyer, { ...GOOD(), razorpay_signature: 'f'.repeat(64) });
    expect(res.status).toBe(400);
    expect((await Order.findById(o._id)).paymentStatus).toBe('unpaid');
  });

  it('rejects a payment for a different gateway order', async () => {
    const o = await makeOrder();
    await api('post', `/${o._id}/payment`, buyer);
    const res = await api('post', `/${o._id}/payment/verify`, buyer, { razorpay_order_id: 'order_OTHER999', razorpay_payment_id: 'pay_TEST1', razorpay_signature: sign('order_OTHER999', 'pay_TEST1') });
    expect(res.status).toBe(400);
  });

  it('records a confirmed online transaction when the buyer completes the order', async () => {
    const o = await makeOrder();
    await payFully(o);
    for (const s of ['confirmed', 'ready', 'delivered']) await api('put', `/${o._id}/status`, seller, { status: s });
    await api('put', `/${o._id}/status`, buyer, { status: 'completed' });
    expect((await Order.findById(o._id)).paymentStatus).toBe('paid_online');
    const t = await Transaction.findOne({ refId: o._id });
    expect(t).toMatchObject({ method: 'online', status: 'confirmed', reference: 'pay_TEST1', amount: 15000 });
  });

  it('refunds a paid order that is cancelled', async () => {
    const o = await makeOrder();
    await payFully(o);
    expect((await api('post', `/${o._id}/cancel`, buyer, { reason: 'Changed my mind' })).status).toBe(200);
    expect(calls.some((c) => c.url.endsWith('/payments/pay_TEST1/refund'))).toBe(true);
    expect((await Order.findById(o._id)).paymentStatus).toBe('refunded');
  });

  it('marks refund_pending when the gateway refund fails', async () => {
    const o = await makeOrder();
    await payFully(o);
    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({ error: { description: 'nope' } }) }));
    await api('post', `/${o._id}/cancel`, buyer, {});
    expect((await Order.findById(o._id)).paymentStatus).toBe('refund_pending');
  });
});

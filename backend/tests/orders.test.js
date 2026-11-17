'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, authHeader, seedCategories } = require('./helpers/factories');
const RefurbisherProfile = require('../src/models/RefurbisherProfile');
const MarketplaceProduct = require('../src/models/MarketplaceProduct');
const Order = require('../src/models/Order');
const Transaction = require('../src/models/Transaction');
const EnvironmentalImpact = require('../src/models/EnvironmentalImpact');
const Notification = require('../src/models/Notification');
const workflow = require('../src/services/workflow/order');

const app = createApp();
let cats; let seller; let buyer; let buyer2; let admin;

const api = (method, url, user, body) => {
  const r = request(app)[method](`/api/orders${url}`);
  if (user) r.set(authHeader(user));
  return body === undefined ? r : r.send(body);
};
async function makeRefurbisher(name, status = 'approved') {
  const u = await makeUser('refurbisher', { name });
  await RefurbisherProfile.create({ user: u.id, businessName: `${name} Works`, city: 'Bengaluru', verification: { status } });
  return u;
}
const makeProduct = (extra = {}) => MarketplaceProduct.create({
  seller: seller.id, title: 'Refurbished ThinkPad T450', category: cats.laptop._id, condition: 'good',
  refurbishmentInfo: 'New battery and SSD, fully tested.', price: 15000, stock: 1, photos: [{ url: '/uploads/p.png', publicId: 'p' }], ...extra,
});
const place = (product, user = buyer, body = {}) => api('post', '', user, { productId: String(product._id), ...body });
const status = (id, to, user = seller) => api('put', `/${id}/status`, user, { status: to });
/** Walks an order to the wanted status through the API. */
async function orderAt(target, product, user = buyer) {
  const id = (await place(product, user)).body.data._id;
  const steps = ['confirmed', 'ready', 'delivered', 'completed'];
  for (const s of steps.slice(0, steps.indexOf(target) + 1)) {
    await status(id, s, s === 'completed' ? user : seller);
  }
  return id;
}

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  seller = await makeRefurbisher('Ravi Kumar');
  buyer = await makeUser('user', { name: 'Buyer One' });
  buyer2 = await makeUser('user', { name: 'Buyer Two' });
  admin = await makeUser('admin');
});

describe('workflow rules', () => {
  it('lets the seller move the order forward and the buyer complete it', () => {
    expect(workflow.canTransition('placed', 'confirmed', 'seller')).toBe(true);
    expect(workflow.canTransition('placed', 'confirmed', 'buyer')).toBe(false);
    expect(workflow.canTransition('confirmed', 'ready', 'seller')).toBe(true);
    expect(workflow.canTransition('ready', 'delivered', 'seller')).toBe(true);
    expect(workflow.canTransition('delivered', 'completed', 'buyer')).toBe(true);
    expect(workflow.canTransition('delivered', 'completed', 'seller')).toBe(false); // only the buyer confirms receipt
    expect(workflow.canTransition('placed', 'ready', 'seller')).toBe(false); // no skipping steps
  });

  it('allows cancelling only until the order is handed over, and the buyer only early', () => {
    expect(workflow.canTransition('placed', 'cancelled', 'buyer')).toBe(true);
    expect(workflow.canTransition('confirmed', 'cancelled', 'buyer')).toBe(true);
    expect(workflow.canTransition('ready', 'cancelled', 'buyer')).toBe(false);
    expect(workflow.canTransition('ready', 'cancelled', 'seller')).toBe(true);
    expect(workflow.canTransition('delivered', 'cancelled', 'seller')).toBe(false);
    expect(workflow.canTransition('completed', 'cancelled', 'admin')).toBe(false);
  });

  it('lists the actions each side can take', () => {
    expect(workflow.availableActions({ status: 'placed' }, 'seller')).toEqual(['confirm', 'cancel']);
    expect(workflow.availableActions({ status: 'placed' }, 'buyer')).toEqual(['cancel']);
    expect(workflow.availableActions({ status: 'ready' }, 'seller')).toEqual(['mark_delivered', 'cancel']);
    expect(workflow.availableActions({ status: 'delivered' }, 'buyer')).toEqual(['complete']);
    expect(workflow.availableActions({ status: 'delivered' }, 'seller')).toEqual([]);
    expect(workflow.availableActions({ status: 'completed' }, 'buyer')).toEqual([]);
  });
});

describe('POST /api/orders', () => {
  it('places an order for cash on delivery and tells the seller', async () => {
    const p = await makeProduct();
    const res = await place(p, buyer, { deliveryArea: 'Indiranagar, Bengaluru', notes: 'Evening please' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'placed', quantity: 1, priceAtOrder: 15000, total: 15000, paymentMethod: 'cod', paymentStatus: 'unpaid',
      deliveryArea: 'Indiranagar, Bengaluru', viewerRole: 'buyer', actions: ['cancel'],
      product: { title: 'Refurbished ThinkPad T450', condition: 'good', label: 'Refurbished' },
      seller: { businessName: 'Ravi Kumar Works' },
    });
    expect((await Order.findById(res.body.data._id)).statusHistory.map((h) => h.status)).toEqual(['placed']);
    expect(await Notification.countDocuments({ user: seller.id, type: 'order.placed' })).toBe(1);
  });

  it('does not take stock yet: that happens when the seller confirms', async () => {
    const p = await makeProduct({ stock: 3 });
    await place(p, buyer, { quantity: 2 });
    expect((await MarketplaceProduct.findById(p._id)).stock).toBe(3);
  });

  it('needs sign-in and valid input, and takes no card details', async () => {
    const p = await makeProduct();
    expect((await request(app).post('/api/orders').send({ productId: String(p._id) })).status).toBe(401);
    expect((await place(p, buyer, { quantity: 0 })).status).toBe(422);
    expect((await place(p, buyer, { paymentMethod: 'card' })).status).toBe(422);
    expect((await place(p, buyer, { cardNumber: '4111111111111111' })).status).toBe(422);
    expect((await api('post', '', buyer, { productId: 'nope' })).status).toBe(422);
    expect((await api('post', '', buyer, { productId: '64b000000000000000000000' })).status).toBe(404);
    expect(await Order.countDocuments()).toBe(0);
  });

  it('refuses your own product, unavailable products, too many items and a second open order', async () => {
    const p = await makeProduct({ stock: 2 });
    expect((await place(p, seller)).body.code).toBe('OWN_PRODUCT');
    expect((await place(p, buyer, { quantity: 3 })).body.code).toBe('OUT_OF_STOCK');
    expect((await place(await makeProduct({ status: 'hidden' }))).body.code).toBe('PRODUCT_UNAVAILABLE');
    expect((await place(await makeProduct({ stock: 0, status: 'sold' }))).body.code).toBe('PRODUCT_UNAVAILABLE');
    const pending = await makeRefurbisher('Pending Shop', 'pending');
    expect((await place(await makeProduct({ seller: pending.id }))).body.code).toBe('PRODUCT_UNAVAILABLE'); // BR-01
    expect((await place(p, buyer)).status).toBe(201);
    expect((await place(p, buyer)).body.code).toBe('ALREADY_ORDERED');
    expect((await place(p, buyer2)).status).toBe(201); // another buyer may order the same item
  });
});

describe('reading orders', () => {
  it('shows each side their own orders, and strangers get 404', async () => {
    const p = await makeProduct({ stock: 5 });
    const id = (await place(p, buyer)).body.data._id;
    await place(p, buyer2);
    const mine = await api('get', '', buyer);
    expect(mine.body.data).toHaveLength(1);
    expect(mine.body.data[0]).toMatchObject({ _id: id, viewerRole: 'buyer' });
    expect((await api('get', '', seller)).body.data).toHaveLength(2); // refurbishers default to seller view
    expect((await api('get', '?as=buyer', seller)).body.data).toHaveLength(0);
    expect((await api('get', `/${id}`, seller)).body.data).toMatchObject({ viewerRole: 'seller', buyer: { name: 'Buyer One' }, actions: ['confirm', 'cancel'] });
    expect((await api('get', `/${id}`, buyer2)).status).toBe(404);
    expect((await api('get', `/${id}`, admin)).body.data.viewerRole).toBe('admin');
    expect((await api('get', '/nope', buyer)).status).toBe(404);
    expect((await api('get', '?status=bogus', buyer)).status).toBe(422);
  });
});

describe('seller confirms (stock, FR-MKT-010)', () => {
  it('takes the stock when the seller confirms and notifies the buyer', async () => {
    const p = await makeProduct({ stock: 3 });
    const id = (await place(p, buyer, { quantity: 2 })).body.data._id;
    const res = await status(id, 'confirmed');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'confirmed', actions: ['mark_ready', 'cancel'] });
    const after = await MarketplaceProduct.findById(p._id);
    expect(after).toMatchObject({ stock: 1, status: 'active' });
    expect(await Notification.countDocuments({ user: buyer.id, type: 'order.confirmed' })).toBe(1);
  });

  it('is the seller\'s step only, and cannot be repeated', async () => {
    const p = await makeProduct({ stock: 3 });
    const id = (await place(p, buyer)).body.data._id;
    expect((await status(id, 'confirmed', buyer)).body.code).toBe('INVALID_TRANSITION');
    expect((await status(id, 'ready')).body.code).toBe('INVALID_TRANSITION');
    expect((await status(id, 'confirmed')).status).toBe(200);
    expect((await status(id, 'confirmed')).body.code).toBe('INVALID_TRANSITION');
    expect((await MarketplaceProduct.findById(p._id)).stock).toBe(2); // taken once
    expect((await status(id, 'cancelled')).status).toBe(422); // cancelling goes through /cancel
  });

  it('marks the product sold when the last item is confirmed and cancels the other waiting orders', async () => {
    const p = await makeProduct({ stock: 1 });
    const first = (await place(p, buyer)).body.data._id;
    const second = (await place(p, buyer2)).body.data._id;
    await status(first, 'confirmed');
    expect((await MarketplaceProduct.findById(p._id)).status).toBe('sold');
    const lost = await api('get', `/${second}`, buyer2);
    expect(lost.body.data).toMatchObject({ status: 'cancelled', cancelReason: 'The last item was sold to another buyer.', actions: [] });
    expect(await Notification.countDocuments({ user: buyer2.id, type: 'order.cancelled' })).toBe(1);
    expect((await request(app).get('/api/marketplace')).body.meta.total).toBe(0); // sold items leave the marketplace
    expect((await place(p, buyer2)).body.code).toBe('PRODUCT_UNAVAILABLE');
  });

  it('cannot confirm more than is in stock, even if the stock changed after the order was placed', async () => {
    const p = await makeProduct({ stock: 2 });
    const id = (await place(p, buyer, { quantity: 2 })).body.data._id;
    await MarketplaceProduct.updateOne({ _id: p._id }, { $set: { stock: 1 } });
    const res = await status(id, 'confirmed');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OUT_OF_STOCK');
    expect((await Order.findById(id)).status).toBe('placed');
    expect((await MarketplaceProduct.findById(p._id)).stock).toBe(1);
  });

  it('cannot confirm an order for a product that was hidden', async () => {
    const p = await makeProduct({ stock: 2 });
    const id = (await place(p, buyer)).body.data._id;
    await MarketplaceProduct.updateOne({ _id: p._id }, { $set: { status: 'hidden' } });
    expect((await status(id, 'confirmed')).body.code).toBe('OUT_OF_STOCK');
  });
});

describe('cancelling', () => {
  it('lets the buyer cancel a placed or confirmed order, and returns the stock', async () => {
    const p = await makeProduct({ stock: 1 });
    const id = (await place(p, buyer)).body.data._id;
    await status(id, 'confirmed');
    expect((await MarketplaceProduct.findById(p._id)).status).toBe('sold');
    const res = await api('post', `/${id}/cancel`, buyer, { reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', cancelReason: 'Changed my mind', actions: [] });
    expect(await MarketplaceProduct.findById(p._id)).toMatchObject({ stock: 1, status: 'active' }); // back on sale
    expect(await Notification.countDocuments({ user: seller.id, type: 'order.cancelled' })).toBe(1);
    expect((await api('post', `/${id}/cancel`, buyer)).body.code).toBe('INVALID_TRANSITION');
  });

  it('does not give stock back for an order that never took any', async () => {
    const p = await makeProduct({ stock: 2 });
    const id = (await place(p, buyer)).body.data._id;
    expect((await api('post', `/${id}/cancel`, buyer)).status).toBe(200);
    expect((await MarketplaceProduct.findById(p._id)).stock).toBe(2);
  });

  it('lets only the seller cancel once the order is ready, and nobody after delivery', async () => {
    const p = await makeProduct({ stock: 1 });
    const id = await orderAt('ready', p);
    expect((await api('post', `/${id}/cancel`, buyer)).body.code).toBe('INVALID_TRANSITION');
    expect((await api('post', `/${id}/cancel`, seller, { reason: 'Item damaged' })).status).toBe(200);
    const p2 = await makeProduct({ stock: 1 });
    const delivered = await orderAt('delivered', p2, buyer2);
    expect((await api('post', `/${delivered}/cancel`, seller)).body.code).toBe('INVALID_TRANSITION');
  });

  it('keeps strangers out', async () => {
    const id = (await place(await makeProduct())).body.data._id;
    expect((await api('post', `/${id}/cancel`, buyer2)).status).toBe(404);
  });
});

describe('completing an order (BR-05, BR-10)', () => {
  it('lets only the buyer confirm receipt, then records the offline payment and the verified impact', async () => {
    const p = await makeProduct({ stock: 1 });
    const id = await orderAt('delivered', p);
    expect((await status(id, 'completed', seller)).body.code).toBe('INVALID_TRANSITION');
    expect(await Transaction.countDocuments()).toBe(0);
    expect(await EnvironmentalImpact.countDocuments()).toBe(0);

    const res = await status(id, 'completed', buyer);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'completed', paymentStatus: 'paid_offline', canReview: true, actions: [] });

    const tx = await Transaction.findOne({ refType: 'Order' });
    expect(tx).toMatchObject({ type: 'order', amount: 15000, method: 'cod', status: 'recorded' });
    expect(String(tx.payer)).toBe(buyer.id);
    expect(String(tx.payee)).toBe(seller.id);
    const impact = await EnvironmentalImpact.findOne({ refId: id });
    expect(impact).toMatchObject({ type: 'refurbishment', devices: 1 });
    expect(String(impact.user)).toBe(seller.id);
    expect(String(impact.verifiedBy)).toBe(buyer.id);
    // The seller earns 40 points once the buyer confirms receipt; the buyer earns none for buying.
    const ledger = await require('../src/models/GreenScoreLedger').find().lean();
    expect(ledger.map((l) => [String(l.user), l.points, l.rule])).toEqual([[seller.id, 40, 'refurbishment_sold']]);
    expect(res.body.data.history.map((h) => h.status)).toEqual(['placed', 'confirmed', 'ready', 'delivered', 'completed']);
  });

  it('multiplies the total by the quantity and cannot complete twice', async () => {
    const p = await makeProduct({ stock: 4, price: 2000 });
    const id = (await place(p, buyer, { quantity: 3 })).body.data._id;
    for (const s of ['confirmed', 'ready', 'delivered']) await status(id, s);
    await status(id, 'completed', buyer);
    expect((await Transaction.findOne({ refType: 'Order' })).amount).toBe(6000);
    expect((await EnvironmentalImpact.findOne({ refId: id })).devices).toBe(3);
    expect((await status(id, 'completed', buyer)).body.code).toBe('INVALID_TRANSITION');
    expect(await Transaction.countDocuments()).toBe(1);
  });

  it('shows the order in the transaction history and syncs the payment when the seller confirms it', async () => {
    const id = await orderAt('completed', await makeProduct());
    const list = await request(app).get('/api/transactions').set(authHeader(seller));
    expect(list.body.data[0]).toMatchObject({ type: 'order', amount: 15000, direction: 'received', canConfirm: true, subject: { kind: 'order', title: 'Refurbished ThinkPad T450', link: `/dashboard/orders/${id}` } });
    const confirm = await request(app).put(`/api/transactions/${list.body.data[0]._id}/confirm`).set(authHeader(seller)).send({});
    expect(confirm.status).toBe(200);
    expect((await Order.findById(id)).paymentStatus).toBe('confirmed');
  });
});

describe('reviewing the seller (BR-04)', () => {
  const review = (user, body) => request(app).post('/api/reviews').set(authHeader(user)).send(body);

  it('lets the buyer review a completed order once and updates the refurbisher rating', async () => {
    const id = await orderAt('completed', await makeProduct());
    const res = await review(buyer, { contextType: 'order', contextId: id, rating: 5, comment: 'Works like new.' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ rating: 5, reviewer: { name: 'Buyer O.' } });
    expect(await RefurbisherProfile.findOne({ user: seller.id })).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    expect((await api('get', `/${id}`, buyer)).body.data).toMatchObject({ reviewed: true, canReview: false });
    expect((await review(buyer, { contextType: 'order', contextId: id, rating: 1 })).body.code).toBe('ALREADY_REVIEWED');
  });

  it('needs a completed order that belongs to the reviewer', async () => {
    const p = await makeProduct({ stock: 2 });
    const open = (await place(p, buyer)).body.data._id;
    const early = await review(buyer, { contextType: 'order', contextId: open, rating: 4 });
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('NOT_COMPLETED');
    const done = await orderAt('completed', await makeProduct(), buyer2);
    expect((await review(buyer, { contextType: 'order', contextId: done, rating: 4 })).status).toBe(404);
    expect((await review(seller, { contextType: 'order', contextId: done, rating: 5 })).status).toBe(404); // sellers cannot rate themselves
  });
});

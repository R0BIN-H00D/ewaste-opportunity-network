'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { PNG, makeUser, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const RefurbisherProfile = require('../src/models/RefurbisherProfile');
const RefurbishmentJob = require('../src/models/RefurbishmentJob');
const MarketplaceProduct = require('../src/models/MarketplaceProduct');
const DeviceListing = require('../src/models/DeviceListing');
const Order = require('../src/models/Order');
const Notification = require('../src/models/Notification');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');

const app = createApp();
let cats; let seller; let seller2; let buyer; let admin;

const api = (method, url, user, body) => {
  const r = request(app)[method](`/api/marketplace${url}`);
  if (user) r.set(authHeader(user));
  return body === undefined ? r : r.send(body);
};

async function makeRefurbisher(name, status = 'approved') {
  const u = await makeUser('refurbisher', { name });
  await RefurbisherProfile.create({ user: u.id, businessName: `${name} Works`, city: 'Bengaluru', verification: { status } });
  return u;
}
const photoDoc = (n = 1) => ({ url: `/uploads/p${n}.png`, publicId: `p${n}` });
/** A product saved straight to the database, for browse and read tests. */
const makeProduct = (sellerUser = seller, extra = {}) => MarketplaceProduct.create({
  seller: sellerUser.id, title: 'Refurbished ThinkPad T450', category: cats.laptop._id, brand: 'Lenovo', model: 'T450',
  condition: 'good', refurbishmentInfo: 'New battery and SSD, fully tested.', price: 15000, stock: 1, photos: [photoDoc()], ...extra,
});
const form = (user, fields = {}, { photos = 1, method = 'post', url = '' } = {}) => {
  const r = request(app)[method](`/api/marketplace${url}`).set(authHeader(user));
  const all = { title: 'Refurbished ThinkPad T450', category: 'laptop', condition: 'good', refurbishmentInfo: 'New battery and SSD, fully tested.', price: '15000', ...fields };
  for (const [k, v] of Object.entries(all)) if (v !== undefined) r.field(k, v);
  for (let i = 0; i < photos; i += 1) r.attach('photos', PNG, { filename: `p${i}.png`, contentType: 'image/png' });
  return r;
};
/** A job that has finished its work and is waiting to be listed. */
async function readyJob(refurbisher = seller) {
  const owner = await makeUser('user', { name: 'Asha Rao' });
  const listing = await makeListing(owner, cats.laptop, { preferredService: 'refurbishment', status: 'in_service', lockedBy: { kind: 'refurbishment', refId: owner.doc._id } });
  const job = await RefurbishmentJob.create({
    listing: listing._id, owner: owner.id, refurbisher: refurbisher.id, status: 'ready_to_list', offer: { amount: 1000, status: 'accepted' },
    beforePhotos: [photoDoc(8)], afterPhotos: [photoDoc(9)],
  });
  return { owner, listing, job };
}

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  seller = await makeRefurbisher('Ravi Kumar');
  seller2 = await makeRefurbisher('Meena Iyer');
  buyer = await makeUser('user', { name: 'Buyer One' });
  admin = await makeUser('admin');
});

describe('POST /api/marketplace', () => {
  it('lets a verified refurbisher list a product, always labelled Refurbished with its condition (BR-11)', async () => {
    const res = await form(seller, { brand: 'Lenovo', model: 'T450', stock: '3', specs: JSON.stringify({ RAM: '8 GB', Storage: '256 GB SSD' }) });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Refurbished ThinkPad T450', condition: 'good', price: 15000, stock: 3, status: 'active',
      isRefurbished: true, label: 'Refurbished', specs: { RAM: '8 GB', Storage: '256 GB SSD' },
      category: { slug: 'laptop' }, seller: { businessName: 'Ravi Kumar Works', city: 'Bengaluru' }, isMine: true,
    });
    expect(res.body.data.photos).toHaveLength(1);
  });

  it('cannot be switched off: the Refurbished flag is not accepted from the client', async () => {
    const res = await form(seller, { isRefurbished: 'false' });
    expect(res.status).toBe(422);
  });

  it('requires a condition, refurbishment details, a price and a photo', async () => {
    const noCondition = await form(seller, { condition: undefined });
    expect(noCondition.status).toBe(422);
    expect(noCondition.body.errors.map((e) => e.field).join()).toMatch(/condition/);
    const noInfo = await form(seller, { refurbishmentInfo: undefined });
    expect(noInfo.body.errors.map((e) => e.field).join()).toMatch(/refurbishmentInfo/);
    expect((await form(seller, { price: '-5' })).status).toBe(422);
    expect((await form(seller, { condition: 'mint' })).status).toBe(422);
    const noPhoto = await form(seller, {}, { photos: 0 });
    expect(noPhoto.status).toBe(422);
    expect(noPhoto.body.errors[0].field).toBe('photos');
    expect((await form(seller, { category: 'spaceship' })).status).toBe(422);
  });

  it('is only for verified refurbishers (BR-01)', async () => {
    const pending = await makeRefurbisher('New Shop', 'pending');
    expect((await form(pending)).status).toBe(403);
    expect((await form(buyer)).status).toBe(403);
    expect((await request(app).post('/api/marketplace').send({})).status).toBe(401);
    expect(await MarketplaceProduct.countDocuments()).toBe(0);
  });

  it('lists a finished job: reuses its after photos, marks the job listed and frees the device', async () => {
    const { owner, listing, job } = await readyJob();
    const res = await form(seller, { jobId: String(job._id) }, { photos: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data.photos.map((p) => p.publicId)).toEqual(['p9']);
    expect(res.body.data.refurbishmentJob).toBe(String(job._id));
    const done = await RefurbishmentJob.findById(job._id);
    expect(done.status).toBe('listed');
    expect(String(done.product)).toBe(res.body.data._id);
    expect(done.history.at(-1).status).toBe('listed');
    const freed = await DeviceListing.findById(listing._id);
    expect(freed.status).toBe('completed');
    expect(freed.lockedBy).toBeUndefined();
    expect(await Notification.countDocuments({ user: owner.id, type: 'refurbishment.listed' })).toBe(1);
  });

  it('lists a job only once, only for its refurbisher, and only when it is ready', async () => {
    const { job } = await readyJob();
    expect((await form(seller, { jobId: String(job._id) }, { photos: 0 })).status).toBe(201);
    const again = await form(seller, { jobId: String(job._id) }, { photos: 0 });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('JOB_NOT_READY');
    const other = await readyJob();
    expect((await form(seller2, { jobId: String(other.job._id) }, { photos: 0 })).status).toBe(404);
    await RefurbishmentJob.updateOne({ _id: other.job._id }, { $set: { status: 'testing' } });
    expect((await form(seller, { jobId: String(other.job._id) }, { photos: 0 })).body.code).toBe('JOB_NOT_READY');
    expect(await MarketplaceProduct.countDocuments()).toBe(1);
  });

  it('gives a product made from one device a stock of 1', async () => {
    const { job } = await readyJob();
    const res = await form(seller, { jobId: String(job._id), stock: '4' }, { photos: 0 });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('stock');
    expect((await RefurbishmentJob.findById(job._id)).status).toBe('ready_to_list');
  });
});

describe('GET /api/marketplace', () => {
  beforeEach(async () => {
    await makeProduct(seller, { title: 'Dell Latitude E7450', brand: 'Dell', model: 'E7450', price: 18000, condition: 'excellent' });
    await makeProduct(seller, { title: 'Samsung Galaxy S9', brand: 'Samsung', model: 'S9', price: 7000, condition: 'fair', category: cats.smartphone._id });
    await makeProduct(seller2, { title: 'HP EliteBook 840', brand: 'HP', model: '840', price: 22000, condition: 'like_new' });
  });

  it('is public and returns the Refurbished label, condition and seller business only', async () => {
    const res = await request(app).get('/api/marketplace');
    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ total: 3 });
    for (const p of res.body.data) {
      expect(p).toMatchObject({ isRefurbished: true, label: 'Refurbished', status: 'active' });
      expect(p.condition).toBeTruthy();
      expect(p.seller.businessName).toMatch(/Works$/);
      expect(p.seller.location).toBeUndefined();
      expect(p.refurbishmentJob).toBeUndefined();
    }
  });

  it('hides products that are sold out, hidden, removed or from sellers who are not verified', async () => {
    const pending = await makeRefurbisher('Pending Shop', 'pending');
    await makeProduct(pending, { title: 'Hidden by verification' });
    await makeProduct(seller, { title: 'Sold one', status: 'sold', stock: 0 });
    await makeProduct(seller, { title: 'Hidden one', status: 'hidden' });
    await makeProduct(seller, { title: 'No stock', stock: 0 });
    const titles = (await request(app).get('/api/marketplace')).body.data.map((p) => p.title);
    expect(titles).toHaveLength(3);
    expect(titles).not.toEqual(expect.arrayContaining(['Hidden by verification', 'Sold one', 'Hidden one', 'No stock']));
  });

  it('searches, filters by category, condition and price, and sorts', async () => {
    const get = (q) => request(app).get('/api/marketplace').query(q);
    expect((await get({ q: 'latitude' })).body.data.map((p) => p.title)).toEqual(['Dell Latitude E7450']);
    expect((await get({ q: 'samsung' })).body.meta.total).toBe(1);
    expect((await get({ category: 'smartphone' })).body.data.map((p) => p.title)).toEqual(['Samsung Galaxy S9']);
    expect((await get({ category: 'no-such-category' })).body.meta.total).toBe(0);
    expect((await get({ condition: 'like_new' })).body.data.map((p) => p.brand)).toEqual(['HP']);
    expect((await get({ minPrice: 10000, maxPrice: 20000 })).body.data.map((p) => p.brand)).toEqual(['Dell']);
    expect((await get({ sort: 'price_asc' })).body.data.map((p) => p.price)).toEqual([7000, 18000, 22000]);
    expect((await get({ sort: 'price_desc' })).body.data.map((p) => p.price)).toEqual([22000, 18000, 7000]);
    expect((await get({ seller: seller2.id })).body.data.map((p) => p.brand)).toEqual(['HP']);
  });

  it('paginates and refuses a reversed price range', async () => {
    const page = await request(app).get('/api/marketplace').query({ limit: 2, page: 2, sort: 'price_asc' });
    expect(page.body.data.map((p) => p.price)).toEqual([22000]);
    expect(page.body.meta).toMatchObject({ page: 2, pages: 2, total: 3 });
    expect((await request(app).get('/api/marketplace').query({ minPrice: 500, maxPrice: 100 })).status).toBe(422);
    expect((await request(app).get('/api/marketplace').query({ sort: 'cheapest' })).status).toBe(422);
  });
});

describe('GET /api/marketplace/:id and /mine', () => {
  it('shows the full product page to anyone, with specs and the refurbishment details', async () => {
    const p = await makeProduct(seller, { specs: { RAM: '8 GB' } });
    const res = await request(app).get(`/api/marketplace/${p._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ label: 'Refurbished', condition: 'good', specs: { RAM: '8 GB' }, refurbishmentInfo: 'New battery and SSD, fully tested.', seller: { businessName: 'Ravi Kumar Works' } });
    expect(res.body.data.isMine).toBeUndefined();
  });

  it('keeps hidden products and unverified sellers out of sight, except for the seller and admin', async () => {
    const hidden = await makeProduct(seller, { status: 'hidden' });
    expect((await request(app).get(`/api/marketplace/${hidden._id}`)).status).toBe(404);
    expect((await api('get', `/${hidden._id}`, buyer)).status).toBe(404);
    expect((await api('get', `/${hidden._id}`, seller)).body.data.isMine).toBe(true);
    expect((await api('get', `/${hidden._id}`, admin)).status).toBe(200);
    const pending = await makeRefurbisher('Pending Shop', 'pending');
    const theirs = await makeProduct(pending);
    expect((await request(app).get(`/api/marketplace/${theirs._id}`)).status).toBe(404);
    expect((await api('get', `/${theirs._id}`, pending)).status).toBe(200);
  });

  it('keeps a sold product readable by link (so a buyer can still open it) but not for sale', async () => {
    const sold = await makeProduct(seller, { status: 'sold', stock: 0 });
    const res = await request(app).get(`/api/marketplace/${sold._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('sold');
  });

  it('answers 404 for an unknown or malformed id', async () => {
    expect((await request(app).get('/api/marketplace/64b000000000000000000000')).status).toBe(404);
    expect((await request(app).get('/api/marketplace/not-an-id')).status).toBe(404);
  });

  it('lists a seller their own products in every state, newest first', async () => {
    await makeProduct(seller, { title: 'Active one' });
    await makeProduct(seller, { title: 'Hidden one', status: 'hidden' });
    await makeProduct(seller2, { title: 'Not mine' });
    const res = await api('get', '/mine', seller);
    expect(res.body.data.map((p) => p.title).sort()).toEqual(['Active one', 'Hidden one']);
    expect((await api('get', '/mine?status=hidden', seller)).body.data).toHaveLength(1);
    expect((await api('get', '/mine', buyer)).status).toBe(403);
  });
});

describe('PUT and DELETE /api/marketplace/:id', () => {
  it('lets the seller change details, hide and show the product', async () => {
    const p = await makeProduct();
    const res = await form(seller, { title: 'Refurbished ThinkPad T450 (16 GB)', price: '14000', status: 'hidden' }, { method: 'put', url: `/${p._id}`, photos: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'Refurbished ThinkPad T450 (16 GB)', price: 14000, status: 'hidden' });
    const shown = await form(seller, { status: 'active' }, { method: 'put', url: `/${p._id}`, photos: 0 });
    expect(shown.body.data.status).toBe('active');
  });

  it('never lets the label or the condition disappear', async () => {
    const p = await makeProduct();
    expect((await form(seller, { condition: 'mint' }, { method: 'put', url: `/${p._id}`, photos: 0 })).status).toBe(422);
    const res = await form(seller, { condition: 'excellent' }, { method: 'put', url: `/${p._id}`, photos: 0 });
    expect(res.body.data).toMatchObject({ condition: 'excellent', isRefurbished: true, label: 'Refurbished' });
    expect((await MarketplaceProduct.findById(p._id)).isRefurbished).toBe(true);
  });

  it('keeps stock and status consistent: no stock means sold, restocking puts it back on sale', async () => {
    const p = await makeProduct(seller, { stock: 2 });
    const sold = await form(seller, { stock: '0' }, { method: 'put', url: `/${p._id}`, photos: 0 });
    expect(sold.body.data).toMatchObject({ stock: 0, status: 'sold' });
    expect((await form(seller, { status: 'active' }, { method: 'put', url: `/${p._id}`, photos: 0 })).status).toBe(409);
    const back = await form(seller, { stock: '2' }, { method: 'put', url: `/${p._id}`, photos: 0 });
    expect(back.body.data).toMatchObject({ stock: 2, status: 'active' });
  });

  it('adds and removes photos but always keeps at least one, and never deletes a job photo from the job', async () => {
    const p = await makeProduct(seller, { photos: [photoDoc(1), photoDoc(2)] });
    const added = await form(seller, {}, { method: 'put', url: `/${p._id}`, photos: 1 });
    expect(added.body.data.photos).toHaveLength(3);
    const removed = await form(seller, { removePhotoIds: JSON.stringify(['p1']) }, { method: 'put', url: `/${p._id}`, photos: 0 });
    expect(removed.body.data.photos.map((x) => x.publicId)).not.toContain('p1');
    const all = removed.body.data.photos.map((x) => x.publicId);
    const none = await form(seller, { removePhotoIds: JSON.stringify(all) }, { method: 'put', url: `/${p._id}`, photos: 0 });
    expect(none.status).toBe(422);
    expect((await MarketplaceProduct.findById(p._id)).photos.length).toBeGreaterThan(0);
  });

  it('hides other sellers\' products as not found, and lets admin act', async () => {
    const p = await makeProduct();
    expect((await form(seller2, { price: '1' }, { method: 'put', url: `/${p._id}`, photos: 0 })).status).toBe(404);
    expect((await form(buyer, { price: '1' }, { method: 'put', url: `/${p._id}`, photos: 0 })).status).toBe(403);
    expect((await api('delete', `/${p._id}`, seller2)).status).toBe(404);
    expect((await form(admin, { status: 'hidden' }, { method: 'put', url: `/${p._id}`, photos: 0 })).status).toBe(200);
  });

  it('removes a product from sale, but not while orders are open', async () => {
    const p = await makeProduct();
    await Order.create({ product: p._id, buyer: buyer.id, seller: seller.id, priceAtOrder: 15000, status: 'confirmed' });
    const blocked = await api('delete', `/${p._id}`, seller);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('HAS_OPEN_ORDERS');
    await Order.updateMany({}, { $set: { status: 'completed' } });
    expect((await api('delete', `/${p._id}`, seller)).status).toBe(200);
    expect((await request(app).get(`/api/marketplace/${p._id}`)).status).toBe(404);
    expect((await request(app).get('/api/marketplace')).body.meta.total).toBe(0);
  });
});

describe('POST /api/marketplace/:id/enquiries', () => {
  it('sends the seller a question, keeps it in one conversation and notifies them', async () => {
    const p = await makeProduct();
    const res = await api('post', `/${p._id}/enquiries`, buyer, { message: 'Does it come with a charger?' });
    expect(res.status).toBe(201);
    expect(res.body.data.sent).toBe(true);
    await api('post', `/${p._id}/enquiries`, buyer, { message: 'And is the battery original?' });
    const convs = await Conversation.find({ contextType: 'enquiry', contextId: p._id });
    expect(convs).toHaveLength(1);
    expect(convs[0].participants.map(String).sort()).toEqual([buyer.id, seller.id].sort());
    expect(convs[0].lastMessage.text).toBe('And is the battery original?');
    expect(convs[0].unread.get(seller.id)).toBe(2);
    expect(await Message.countDocuments({ conversation: convs[0]._id })).toBe(2);
    expect(await Notification.countDocuments({ user: seller.id, type: 'marketplace.enquiry' })).toBe(2);
  });

  it('needs sign-in, a real question, and a product that is on sale from someone else', async () => {
    const p = await makeProduct();
    expect((await request(app).post(`/api/marketplace/${p._id}/enquiries`).send({ message: 'Hello there' })).status).toBe(401);
    expect((await api('post', `/${p._id}/enquiries`, buyer, { message: 'hi' })).status).toBe(422);
    const own = await api('post', `/${p._id}/enquiries`, seller, { message: 'Asking myself' });
    expect(own.status).toBe(409);
    expect(own.body.code).toBe('OWN_PRODUCT');
    const hidden = await makeProduct(seller, { status: 'hidden' });
    expect((await api('post', `/${hidden._id}/enquiries`, buyer, { message: 'Is this still there?' })).status).toBe(409);
    expect(await Conversation.countDocuments()).toBe(0);
  });
});

'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const Conversation = require('../src/models/Conversation');
const Message = require('../src/models/Message');
const ServiceRequest = require('../src/models/ServiceRequest');
const Order = require('../src/models/Order');
const MarketplaceProduct = require('../src/models/MarketplaceProduct');
const RefurbisherProfile = require('../src/models/RefurbisherProfile');
const User = require('../src/models/User');

const app = createApp();
let cats; let owner; let tech; let stranger; let listing; let repair;

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  owner = await makeUser('user');
  tech = await makeTechnician();
  stranger = await makeUser('user');
  listing = await makeListing(owner, cats.laptop);
  repair = await ServiceRequest.create({ listing: listing._id, customer: owner.id, technician: tech.id });
});

const api = (user, method, path, body, query) => {
  const r = request(app)[method](`/api/chat${path}`).set(authHeader(user));
  if (query) r.query(query);
  return body ? r.send(body) : r;
};
const open = (user, contextType, contextId) => api(user, 'post', '/conversations', { contextType, contextId: String(contextId) });

describe('opening a conversation', () => {
  it('is opened by either person on the repair and is the same thread both times', async () => {
    const a = await open(owner, 'service', repair._id);
    expect(a.status).toBe(200);
    expect(a.body.data).toMatchObject({ contextType: 'service', unread: 0, lastMessage: null });
    expect(a.body.data.other).toMatchObject({ _id: tech.id, role: 'technician' });

    const b = await open(tech, 'service', repair._id);
    expect(b.body.data._id).toBe(a.body.data._id);
    expect(b.body.data.other._id).toBe(owner.id);
    expect(await Conversation.countDocuments()).toBe(1);
  });

  it('cannot be opened by someone who is not on the repair, and looks the same as a missing one', async () => {
    const outsider = await open(stranger, 'service', repair._id);
    const missing = await open(stranger, 'service', '64b000000000000000000000');
    expect(outsider.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(outsider.body.message).toBe(missing.body.message);
    expect(await Conversation.countDocuments()).toBe(0);
  });

  it('has nobody to talk to until a technician is chosen', async () => {
    const open2 = await ServiceRequest.create({ listing: listing._id, customer: owner.id });
    expect((await open(owner, 'service', open2._id)).status).toBe(404);
  });

  it('works for an order between its buyer and seller only', async () => {
    const seller = await makeUser('refurbisher');
    await RefurbisherProfile.create({ user: seller.id, businessName: 'Ravi Works', city: 'Bengaluru', verification: { status: 'approved' } });
    const buyer = await makeUser('user');
    const product = await MarketplaceProduct.create({
      seller: seller.id, title: 'Refurbished ThinkPad', category: cats.laptop._id, condition: 'good',
      refurbishmentInfo: 'New battery and SSD, fully tested.', price: 15000, stock: 1, photos: [{ url: '/uploads/p.png', publicId: 'p' }],
    });
    const placed = await request(app).post('/api/orders').set(authHeader(buyer)).send({ productId: String(product._id), deliveryArea: 'Indiranagar', deliveryCity: 'Bengaluru', deliveryPincode: '560038' });
    expect(placed.status).toBe(201);
    const orderId = placed.body.data._id;

    const asBuyer = await open(buyer, 'order', orderId);
    expect(asBuyer.status).toBe(200);
    expect(asBuyer.body.data.other._id).toBe(seller.id);
    expect((await open(seller, 'order', orderId)).body.data._id).toBe(asBuyer.body.data._id);
    expect((await open(stranger, 'order', orderId)).status).toBe(404);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('lets someone ask the owner about a listed device, but not the owner about their own', async () => {
    const asked = await open(stranger, 'enquiry', listing._id);
    expect(asked.status).toBe(200);
    expect(asked.body.data.other._id).toBe(owner.id);
    // The owner opening the enquiry on their own listing would be a conversation with themselves.
    expect((await open(owner, 'enquiry', listing._id)).status).toBe(404);
    // A device that is not on sale cannot be asked about.
    await listing.updateOne({ status: 'draft' });
    expect((await open(stranger, 'enquiry', listing._id)).status).toBe(404);
  });

  it('can be fetched by its id by either person, and by nobody else', async () => {
    const convo = (await open(owner, 'service', repair._id)).body.data;
    const mine = await api(owner, 'get', `/conversations/${convo._id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.data).toMatchObject({ _id: convo._id, contextType: 'service', other: { _id: tech.id } });
    expect((await api(tech, 'get', `/conversations/${convo._id}`)).body.data.other._id).toBe(owner.id);
    expect((await api(stranger, 'get', `/conversations/${convo._id}`)).status).toBe(404);
    expect((await api(owner, 'get', '/conversations/not-an-id')).status).toBe(404);
  });

  it('refuses an unknown kind, a malformed id, and needs a sign-in', async () => {
    expect((await open(owner, 'secret', repair._id)).status).toBe(422);
    expect((await api(owner, 'post', '/conversations', { contextType: 'service', contextId: 'abc' })).status).toBe(422);
    expect((await request(app).post('/api/chat/conversations').send({})).status).toBe(401);
  });
});

describe('messages', () => {
  let convo;
  beforeEach(async () => {
    convo = (await open(owner, 'service', repair._id)).body.data;
  });

  const say = (user, text, id = convo._id) => api(user, 'post', `/conversations/${id}/messages`, { text });

  it('sends, trims, and shows the newest message and the other person\'s unread count', async () => {
    const sent = await say(owner, '  Is it fixed yet?  ');
    expect(sent.status).toBe(201);
    expect(sent.body.data).toMatchObject({ text: 'Is it fixed yet?', sender: owner.id, read: false });

    const mine = (await api(owner, 'get', '/conversations')).body;
    expect(mine.data[0].lastMessage).toMatchObject({ text: 'Is it fixed yet?', mine: true });
    expect(mine.data[0].unread).toBe(0);
    expect(mine.meta.unread).toBe(0);

    const theirs = (await api(tech, 'get', '/conversations')).body;
    expect(theirs.data[0].lastMessage).toMatchObject({ mine: false });
    expect(theirs.data[0].unread).toBe(1);
    expect(theirs.meta.unread).toBe(1);
    expect((await api(tech, 'get', '/unread-count')).body.data).toEqual({ unread: 1 });
  });

  it('refuses empty, whitespace-only and over-long text and unknown fields', async () => {
    expect((await say(owner, '')).status).toBe(422);
    expect((await say(owner, '    ')).status).toBe(422);
    expect((await say(owner, 'x'.repeat(2001))).status).toBe(422);
    expect((await api(owner, 'post', `/conversations/${convo._id}/messages`, { text: 'hi', sender: tech.id })).status).toBe(422);
    expect(await Message.countDocuments()).toBe(0);
  });

  it('keeps the thread private: a stranger cannot read, send or mark read, and it looks like a missing thread', async () => {
    await say(owner, 'private');
    expect((await api(stranger, 'get', `/conversations/${convo._id}/messages`)).status).toBe(404);
    expect((await say(stranger, 'hello?')).status).toBe(404);
    expect((await api(stranger, 'put', `/conversations/${convo._id}/read`)).status).toBe(404);
    expect((await api(stranger, 'get', '/conversations')).body.data).toEqual([]);
    expect((await api(owner, 'get', '/conversations/not-an-id/messages')).status).toBe(404);
    expect(await Message.countDocuments()).toBe(1);
  });

  it('lists oldest first and pages backwards with `before`', async () => {
    for (let i = 1; i <= 5; i += 1) await say(i % 2 ? owner : tech, `m${i}`);
    const newest = await api(owner, 'get', `/conversations/${convo._id}/messages`, null, { limit: 2 });
    expect(newest.body.data.map((m) => m.text)).toEqual(['m4', 'm5']);
    expect(newest.body.meta).toMatchObject({ hasMore: true });

    const older = await api(owner, 'get', `/conversations/${convo._id}/messages`, null, { limit: 2, before: newest.body.meta.nextBefore });
    expect(older.body.data.map((m) => m.text)).toEqual(['m2', 'm3']);
    const oldest = await api(owner, 'get', `/conversations/${convo._id}/messages`, null, { limit: 2, before: older.body.meta.nextBefore });
    expect(oldest.body.data.map((m) => m.text)).toEqual(['m1']);
    expect(oldest.body.meta).toMatchObject({ hasMore: false, nextBefore: null });
  });

  it('marking read clears my unread count, flags their messages as read, and leaves the other person\'s count alone', async () => {
    await say(owner, 'one');
    await say(owner, 'two');
    await say(tech, 'reply');
    expect((await api(tech, 'get', '/unread-count')).body.data.unread).toBe(2);
    expect((await api(owner, 'get', '/unread-count')).body.data.unread).toBe(1);

    expect((await api(tech, 'put', `/conversations/${convo._id}/read`)).body.data).toEqual({ unread: 0 });
    expect((await api(tech, 'get', '/unread-count')).body.data.unread).toBe(0);
    expect((await api(owner, 'get', '/unread-count')).body.data.unread).toBe(1);

    const seenByOwner = (await api(owner, 'get', `/conversations/${convo._id}/messages`)).body.data;
    expect(seenByOwner.find((m) => m.text === 'one').read).toBe(true); // the technician read it
    expect(seenByOwner.find((m) => m.text === 'reply').read).toBe(false); // the owner has not yet
    // Reading twice changes nothing.
    await api(tech, 'put', `/conversations/${convo._id}/read`);
    expect((await Message.findOne({ text: 'one' })).readBy).toHaveLength(2);
  });

  it('orders conversations by their latest activity', async () => {
    const other = await makeListing(owner, cats.laptop);
    const repair2 = await ServiceRequest.create({ listing: other._id, customer: owner.id, technician: tech.id });
    const second = (await open(owner, 'service', repair2._id)).body.data;
    await say(owner, 'older thread');
    await say(owner, 'newer thread', second._id);
    const list = (await api(owner, 'get', '/conversations')).body.data;
    expect(list.map((c) => c._id)).toEqual([second._id, convo._id]);
  });

  it('will not deliver to someone whose account is suspended', async () => {
    await User.updateOne({ _id: tech.id }, { status: 'suspended' });
    const res = await say(owner, 'hello');
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RECIPIENT_UNAVAILABLE');
    expect(await Message.countDocuments()).toBe(0);
  });

  it('blocks a suspended sender at the door', async () => {
    await User.updateOne({ _id: owner.id }, { status: 'suspended' });
    expect((await say(owner, 'hello')).status).toBe(403);
  });
});

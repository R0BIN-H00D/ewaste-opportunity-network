'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, authHeader } = require('./helpers/factories');
const RefurbisherProfile = require('../src/models/RefurbisherProfile');
const Notification = require('../src/models/Notification');

const app = createApp();
let refurb; let refurb2; let owner; let tech;

async function makeRefurbisher(status = 'approved') {
  const u = await makeUser('refurbisher');
  await RefurbisherProfile.create({ user: u.id, businessName: 'Works', city: 'Bengaluru', verification: { status } });
  return u;
}
const call = (user, method, path, body, query) => {
  const r = request(app)[method](`/api/wanted-requests${path}`).set(authHeader(user));
  if (query) r.query(query);
  return body ? r.send(body) : r;
};

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  refurb = await makeRefurbisher();
  refurb2 = await makeRefurbisher();
  owner = await makeUser('user');
  tech = await makeTechnician();
});

describe('wanted-device requests', () => {
  it('lets a verified refurbisher post one and only them', async () => {
    const res = await call(refurb, 'post', '', { title: 'Used laptops', quantity: 3 });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('open');
    expect((await call(owner, 'post', '', { title: 'Used laptops' })).status).toBe(403);
    const pending = await makeRefurbisher('pending');
    expect((await call(pending, 'post', '', { title: 'Used laptops' })).status).toBe(403);
  });

  it('shows open requests to owners and technicians but only the poster sees closed ones', async () => {
    const a = (await call(refurb, 'post', '', { title: 'Phones' })).body.data;
    await call(refurb, 'post', '', { title: 'Tablets' });
    await call(refurb, 'put', `/${a._id}/status`, { status: 'closed' });
    for (const u of [owner, tech]) {
      const res = await call(u, 'get', '');
      expect(res.body.data.map((w) => w.title)).toEqual(['Tablets']);
    }
    expect((await call(refurb, 'get', '', null, { as: 'mine' })).body.data).toHaveLength(2);
    expect((await call(refurb2, 'get', '', null, { as: 'mine' })).body.data).toHaveLength(0);
    expect((await call(refurb2, 'put', `/${a._id}/status`, { status: 'open' })).status).toBe(404);
  });

  it('lets an owner and a technician accept once, tells the refurbisher and lists who accepted', async () => {
    const w = (await call(refurb, 'post', '', { title: 'Phones' })).body.data;
    expect((await call(owner, 'post', `/${w._id}/respond`, { message: 'I have two' })).status).toBe(201);
    expect((await call(owner, 'post', `/${w._id}/respond`, {})).status).toBe(409);
    expect((await call(tech, 'post', `/${w._id}/respond`, {})).status).toBe(201);
    expect((await call(refurb2, 'post', `/${w._id}/respond`, {})).status).toBe(403);
    expect(await Notification.countDocuments({ user: refurb.id, type: 'wanted.response' })).toBe(2);

    const board = await call(owner, 'get', '');
    expect(board.body.data[0].hasResponded).toBe(true);
    const mine = await call(refurb, 'get', '', null, { as: 'mine' });
    expect(mine.body.data[0].responseCount).toBe(2);
    const who = await call(refurb, 'get', `/${w._id}/responses`);
    expect(who.body.data).toHaveLength(2);
    expect((await call(refurb2, 'get', `/${w._id}/responses`)).status).toBe(404);
  });

  it('does not accept a closed request, and the accepter and refurbisher can message each other', async () => {
    const w = (await call(refurb, 'post', '', { title: 'Phones' })).body.data;
    const r = await call(owner, 'post', `/${w._id}/respond`, {});
    const chat = (u, id) => request(app).post('/api/chat/conversations').set(authHeader(u)).send({ contextType: 'wanted', contextId: id });
    expect((await chat(refurb, r.body.data._id)).status).toBe(200);
    expect((await chat(owner, r.body.data._id)).status).toBe(200);
    expect((await chat(refurb2, r.body.data._id)).status).toBe(404);
    await call(refurb, 'put', `/${w._id}/status`, { status: 'closed' });
    expect((await call(tech, 'post', `/${w._id}/respond`, {})).status).toBe(404);
  });
});

describe('requests I accepted', () => {
  it('lists them for the accepter, including closed ones', async () => {
    const a = (await call(refurb, 'post', '', { title: 'Phones' })).body.data;
    await call(refurb, 'post', '', { title: 'Tablets' });
    await call(tech, 'post', `/${a._id}/respond`, {});
    await call(refurb, 'put', `/${a._id}/status`, { status: 'closed' });
    const res = await call(tech, 'get', '', null, { as: 'accepted' });
    expect(res.body.data.map((w) => w.title)).toEqual(['Phones']);
    expect(res.body.meta.total).toBe(1);
    expect((await call(owner, 'get', '', null, { as: 'accepted' })).body.data).toHaveLength(0);
  });
});

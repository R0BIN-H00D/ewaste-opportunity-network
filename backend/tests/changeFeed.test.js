'use strict';
require('./helpers/env');
const http = require('http');
const { io: connect } = require('socket.io-client');
const createApp = require('../src/app');
const { attach } = require('../src/sockets');
const { setIo } = require('../src/sockets/emitter');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, seedCategories } = require('./helpers/factories');
const ServiceRequest = require('../src/models/ServiceRequest');
const DeviceListing = require('../src/models/DeviceListing');
const Category = require('../src/models/Category');
const AdminLog = require('../src/models/AdminLog');
const EducationArticle = require('../src/models/EducationArticle');
const WantedRequest = require('../src/models/WantedRequest');
const WantedResponse = require('../src/models/WantedResponse');
const { RESOURCE, userPaths } = require('../src/sockets/changeFeed');

let server; let io; let url; let owner; let tech; let stranger; let admin; let cats;
const open = [];

beforeAll(async () => {
  await db.connect();
  server = http.createServer(createApp());
  io = attach(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  setIo(null);
  await new Promise((resolve) => io.close(resolve));
  await db.disconnect();
});
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  owner = await makeUser('user');
  tech = await makeTechnician();
  stranger = await makeUser('user');
  admin = await makeUser('admin');
});
afterEach(() => {
  while (open.length) open.pop().close();
});

/** A connected, signed-in client that records every change it hears. */
function client(user) {
  const socket = connect(url, { auth: { token: user.token }, transports: ['websocket'], reconnection: false, forceNew: true });
  open.push(socket);
  socket.heard = [];
  socket.on('data:changed', (p) => socket.heard.push(p));
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}
const wait = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const heard = (socket, resource) => socket.heard.filter((e) => e.resource === resource);

describe('the change feed', () => {
  it('tells the people named on a record, and administrators, but not a stranger', async () => {
    const listing = await makeListing(owner, cats.laptop, { status: 'draft' });
    const [o, t, s, a] = await Promise.all([client(owner), client(tech), client(stranger), client(admin)]);
    await wait(50);
    const repair = await ServiceRequest.create({ listing: listing._id, customer: owner.id, technician: tech.id });
    await wait();
    for (const who of [o, t, a]) expect(heard(who, 'request')).toEqual([{ resource: 'request', id: String(repair._id), action: 'created' }]);
    expect(heard(s, 'request')).toEqual([]);
  });

  it('announces updates made on a document, through a query, and by deleting', async () => {
    const listing = await makeListing(owner, cats.laptop, { status: 'draft' });
    const repair = await ServiceRequest.create({ listing: listing._id, customer: owner.id, technician: tech.id });
    const [o] = await Promise.all([client(owner)]);
    await wait(50);

    const doc = await ServiceRequest.findById(repair._id);
    doc.status = 'technician_assigned';
    await doc.save();
    await ServiceRequest.updateOne({ _id: repair._id }, { $set: { status: 'diagnosis_in_progress' } });
    await ServiceRequest.findOneAndUpdate({ _id: repair._id }, { $set: { status: 'quotation_submitted' } });
    await ServiceRequest.deleteOne({ _id: repair._id });
    await wait();
    expect(heard(o, 'request').map((e) => e.action)).toEqual(['updated', 'updated', 'updated', 'deleted']);
    expect(new Set(heard(o, 'request').map((e) => e.id))).toEqual(new Set([String(repair._id)]));
  });

  it('sends only the resource, the id and what happened: never the record', async () => {
    const listing = await makeListing(owner, cats.laptop, { status: 'draft' });
    const o = await client(owner);
    await wait(50);
    await ServiceRequest.create({ listing: listing._id, customer: owner.id, technician: tech.id, problemDescription: 'secret details' });
    await wait();
    const [event] = heard(o, 'request');
    expect(Object.keys(event).sort()).toEqual(['action', 'id', 'resource']);
    expect(JSON.stringify(event)).not.toContain('secret');
  });

  it('tells everyone about a listing that is public, and about one that has just stopped being public, but never about a draft', async () => {
    const s = await client(stranger);
    await wait(50);
    const live = await makeListing(owner, cats.laptop, { status: 'listed' });
    await wait();
    expect(heard(s, 'listing').length).toBeGreaterThan(0);
    s.heard.length = 0;

    await DeviceListing.updateOne({ _id: live._id }, { $set: { status: 'withdrawn' } });
    await wait();
    expect(heard(s, 'listing').map((e) => e.id)).toContain(String(live._id)); // lists drop it

    s.heard.length = 0;
    await makeListing(owner, cats.laptop, { status: 'draft' });
    await DeviceListing.updateOne({ owner: owner.id, status: 'draft' }, { $set: { description: 'edited draft' } });
    await wait();
    expect(heard(s, 'listing')).toEqual([]);
  });

  it('tells everyone about published articles and categories, and nobody but administrators about a draft article', async () => {
    const [s, a] = await Promise.all([client(stranger), client(admin)]);
    await wait(50);
    await EducationArticle.create({ title: 'Draft guide', slug: 'draft-guide', topic: 'reuse', body: 'x'.repeat(30), status: 'draft', author: admin.id });
    await wait();
    expect(heard(s, 'education')).toEqual([]);
    expect(heard(a, 'education')).toHaveLength(1);

    await EducationArticle.create({ title: 'Live guide', slug: 'live-guide', topic: 'reuse', body: 'x'.repeat(30), status: 'published', author: admin.id });
    await Category.updateOne({ _id: cats.laptop._id }, { $set: { icon: 'cpu' } });
    await wait();
    expect(heard(s, 'education')).toHaveLength(1);
    expect(heard(s, 'category')).toHaveLength(1);
  });

  it('tells everyone about an open wanted-device request, and its owner when someone accepts it', async () => {
    const refurbisher = await makeUser('refurbisher');
    const [r, s, o] = await Promise.all([client(refurbisher), client(stranger), client(owner)]);
    await wait(50);
    const wanted = await WantedRequest.create({ refurbisher: refurbisher.id, title: 'Any working laptop' });
    await wait();
    expect(heard(s, 'wanted')).toHaveLength(1); // the board of open requests updates for everyone
    r.heard.length = 0;
    await WantedResponse.create({ request: wanted._id, responder: owner.id, refurbisher: refurbisher.id });
    await wait();
    expect(heard(r, 'wanted')).toHaveLength(1); // the owner's list of who accepted updates
    expect(heard(o, 'wanted').length).toBeGreaterThan(0);
    s.heard.length = 0;
    await WantedRequest.updateOne({ _id: wanted._id }, { $set: { status: 'closed' } });
    await wait();
    expect(heard(s, 'wanted')).toHaveLength(1); // and it drops off the board
  });

  it('does not announce records that are not meant to be (logs, tokens), and nothing when a write fails', async () => {
    const a = await client(admin);
    await wait(50);
    await AdminLog.create({ admin: admin.id, action: 'user.suspend' });
    await expect(ServiceRequest.create({ customer: owner.id })).rejects.toThrow(); // missing required fields
    await wait();
    expect(a.heard).toEqual([]);
  });

  it('does not tell a signed-out or unrelated socket anything private, even if it listens to the right event', async () => {
    const s = await client(stranger);
    const listing = await makeListing(owner, cats.laptop, { status: 'draft' });
    await wait(50);
    await ServiceRequest.create({ listing: listing._id, customer: owner.id, technician: tech.id });
    await DeviceListing.updateOne({ _id: listing._id }, { $set: { description: 'changed' } });
    await wait();
    expect(s.heard).toEqual([]);
  });

  it('only names models it has a client name for, and finds every user reference on them', () => {
    expect(RESOURCE.ServiceRequest).toBe('request');
    expect(RESOURCE.RefreshToken).toBeUndefined();
    expect(RESOURCE.AdminLog).toBeUndefined();
    expect(RESOURCE.Message).toBeUndefined();
    expect(userPaths(ServiceRequest.schema).sort()).toEqual(expect.arrayContaining(['customer', 'technician']));
  });
});
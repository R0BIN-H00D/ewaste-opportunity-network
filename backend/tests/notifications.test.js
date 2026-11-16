'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, authHeader } = require('./helpers/factories');
const { notify } = require('../src/services/notificationService');
const Notification = require('../src/models/Notification');

const app = createApp();
let me; let other;

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  me = await makeUser('user');
  other = await makeUser('user');
});

const get = (user, path, query) => request(app).get(`/api/notifications${path}`).query(query || {}).set(authHeader(user));
const put = (user, path) => request(app).put(`/api/notifications${path}`).set(authHeader(user));

describe('notifications', () => {
  it('lists only my own, newest first, with the unread count', async () => {
    await notify(me.id, { type: 'a', title: 'First' });
    await notify(me.id, { type: 'b', title: 'Second', body: 'More', data: { id: 'x1' } });
    await notify(other.id, { type: 'c', title: 'Not yours' });

    const res = await get(me, '');
    expect(res.status).toBe(200);
    expect(res.body.data.map((n) => n.title)).toEqual(['Second', 'First']);
    expect(res.body.data[0]).toMatchObject({ type: 'b', body: 'More', data: { id: 'x1' }, readAt: null });
    expect(res.body.meta).toMatchObject({ total: 2, unread: 2 });
    expect((await get(me, '/unread-count')).body.data).toEqual({ unread: 2 });
  });

  it('marks one or all as read, and only the unread ones are listed with unread=true', async () => {
    await notify(me.id, { type: 'a', title: 'One' });
    await notify(me.id, { type: 'a', title: 'Two' });
    const [first] = (await get(me, '')).body.data;

    const read = await put(me, `/${first._id}/read`);
    expect(read.status).toBe(200);
    expect(read.body.data.readAt).toBeTruthy();
    const again = await put(me, `/${first._id}/read`); // reading twice keeps the first time
    expect(again.body.data.readAt).toBe(read.body.data.readAt);

    const unreadOnly = await get(me, '', { unread: 'true' });
    expect(unreadOnly.body.data.map((n) => n.title)).toEqual(['One']);
    expect(unreadOnly.body.meta.unread).toBe(1);

    expect((await put(me, '/read-all')).body.data).toEqual({ updated: 1, unread: 0 });
    expect(await Notification.countDocuments({ user: me.id, readAt: null })).toBe(0);
  });

  it('never touches someone else\'s notification, and needs a sign-in', async () => {
    await notify(other.id, { type: 'a', title: 'Theirs' });
    const theirs = await Notification.findOne({ user: other.id }).lean();
    expect((await put(me, `/${theirs._id}/read`)).status).toBe(404);
    expect((await Notification.findById(theirs._id)).readAt).toBeUndefined();
    await put(me, '/read-all');
    expect((await Notification.findById(theirs._id)).readAt).toBeUndefined();
    expect((await request(app).get('/api/notifications')).status).toBe(401);
    expect((await put(me, '/not-an-id/read')).status).toBe(404); // a malformed id looks the same as an unknown one
  });
});

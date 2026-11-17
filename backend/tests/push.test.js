'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const push = require('../src/services/integrations/push');
const { notify } = require('../src/services/notificationService');
const DeviceToken = require('../src/models/DeviceToken');
const Notification = require('../src/models/Notification');
const UserProfile = require('../src/models/UserProfile');
const { makeUser, authHeader } = require('./helpers/factories');

const app = createApp();
let asha; let ravi; let admin;
const TOKEN = (n) => `fcm-token-${String(n).padStart(6, '0')}-xxxxxxxxxxxx`;
const call = (method, url, who, body) => { const r = request(app)[method](url); if (who) r.set(authHeader(who)); return body === undefined ? r : r.send(body); };
/** Waits (up to a second) for something that happens after the request has already answered. */
const until = async (check) => { for (let i = 0; i < 100 && !check(); i += 1) await new Promise((resolve) => setTimeout(resolve, 10)); };

/** A stand-in for Firebase messaging: every token succeeds unless it is listed in `dead` or `failing`. */
function fakeMessaging({ dead = [], failing = [] } = {}) {
  const m = {
    batches: [],
    async sendEachForMulticast(message) {
      m.batches.push(message);
      return {
        responses: message.tokens.map((t) => (dead.includes(t) ? { success: false, error: { code: 'messaging/registration-token-not-registered' } } : failing.includes(t) ? { success: false, error: { code: 'messaging/internal-error' } } : { success: true })),
      };
    },
  };
  return m;
}

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  push._setMessaging(undefined);
  asha = await makeUser('user');
  ravi = await makeUser('user');
  admin = await makeUser('admin');
});
afterEach(() => push._setMessaging(undefined));

describe('push when it is not set up', () => {
  it('is off, says so, and still saves the in-app notification', async () => {
    expect(push.isEnabled()).toBe(false);
    expect(await push.sendToUsers([asha.id], { title: 'Hi', body: 'There' })).toEqual({ skipped: 'off' });
    await notify(asha.id, { type: 'test', title: 'Hello', body: 'World' });
    expect(await Notification.countDocuments({ user: asha.id })).toBe(1);
  });

  it('is off when the service account file cannot be used', async () => {
    const env = require('../src/config/env');
    const was = env.FIREBASE_SERVICE_ACCOUNT_PATH;
    env.FIREBASE_SERVICE_ACCOUNT_PATH = 'C:/does/not/exist.json';
    try {
      expect(push.isEnabled()).toBe(false);
      expect(await push.sendToUsers([asha.id], { title: 'x', body: 'y' })).toEqual({ skipped: 'off' });
    } finally {
      env.FIREBASE_SERVICE_ACCOUNT_PATH = was;
    }
  });
});

describe('sending push', () => {
  it('sends a notification to every device of the people named, with the data as text', async () => {
    const m = fakeMessaging();
    push._setMessaging(m);
    await DeviceToken.create([{ user: asha.id, fcmToken: TOKEN(1) }, { user: asha.id, fcmToken: TOKEN(2), platform: 'web' }, { user: ravi.id, fcmToken: TOKEN(3) }]);
    const res = await push.sendToUsers([asha.id], { title: 'Quote ready', body: 'See it', data: { id: 'r1', deepLink: '/dashboard/requests/r1', count: 3, skip: undefined, none: null } });
    expect(res).toEqual({ sent: 2, failed: 0, removed: 0 });
    expect(m.batches).toHaveLength(1);
    expect(m.batches[0].tokens.sort()).toEqual([TOKEN(1), TOKEN(2)]);
    expect(m.batches[0].notification).toEqual({ title: 'Quote ready', body: 'See it' });
    expect(m.batches[0].data).toEqual({ id: 'r1', deepLink: '/dashboard/requests/r1', count: '3' });
  });

  it('does not send to a person who switched push off, and says nothing about them', async () => {
    const m = fakeMessaging();
    push._setMessaging(m);
    await UserProfile.create({ user: ravi.id, preferences: { pushNotifications: false } });
    await DeviceToken.create([{ user: asha.id, fcmToken: TOKEN(1) }, { user: ravi.id, fcmToken: TOKEN(2) }]);
    const res = await push.sendToUsers([asha.id, ravi.id], { title: 'x', body: 'y' });
    expect(res.sent).toBe(1);
    expect(m.batches[0].tokens).toEqual([TOKEN(1)]);
    expect(await push.sendToUsers([ravi.id], { title: 'x', body: 'y' })).toEqual({ sent: 0, failed: 0, removed: 0 });
  });

  it('sends to a person with no profile yet (push is on by default)', async () => {
    const m = fakeMessaging();
    push._setMessaging(m);
    await DeviceToken.create({ user: asha.id, fcmToken: TOKEN(1) });
    expect((await push.sendToUsers([asha.id], { title: 'x', body: 'y' })).sent).toBe(1);
  });

  it('deletes tokens Firebase says are dead, keeps the others, and counts a temporary failure as failed only', async () => {
    const m = fakeMessaging({ dead: [TOKEN(1)], failing: [TOKEN(2)] });
    push._setMessaging(m);
    await DeviceToken.create([1, 2, 3].map((n) => ({ user: asha.id, fcmToken: TOKEN(n) })));
    const res = await push.sendToUsers([asha.id], { title: 'x', body: 'y' });
    expect(res).toEqual({ sent: 1, failed: 2, removed: 1 });
    expect((await DeviceToken.find().lean()).map((t) => t.fcmToken).sort()).toEqual([TOKEN(2), TOKEN(3)]);
  });

  it('sends in batches of at most 500', async () => {
    const m = fakeMessaging();
    push._setMessaging(m);
    await DeviceToken.insertMany(Array.from({ length: 1001 }, (_, i) => ({ user: asha.id, fcmToken: TOKEN(i) })));
    const res = await push.sendToUsers([asha.id], { title: 'x', body: 'y' });
    expect(res.sent).toBe(1001);
    expect(m.batches.map((b) => b.tokens.length)).toEqual([500, 500, 1]);
  });

  it('never throws, even when Firebase does', async () => {
    push._setMessaging({ sendEachForMulticast: async () => { throw new Error('boom'); } });
    await DeviceToken.create({ user: asha.id, fcmToken: TOKEN(1) });
    expect(await push.sendToUsers([asha.id], { title: 'x', body: 'y' })).toEqual({ skipped: 'error' });
    expect(await push.sendToUsers([], { title: 'x', body: 'y' })).toEqual({ sent: 0, failed: 0, removed: 0 });
  });

  it('is sent after every in-app notification, without being waited for, and a push failure never loses the notification', async () => {
    const m = fakeMessaging();
    push._setMessaging(m);
    await DeviceToken.create({ user: asha.id, fcmToken: TOKEN(1) });
    await notify(asha.id, { type: 'service.quote', title: 'Quote ready', body: 'See it', data: { id: 'r1' } });
    await until(() => m.batches.length > 0);
    expect(m.batches[0].notification).toEqual({ title: 'Quote ready', body: 'See it' });
    expect(await Notification.countDocuments({ user: asha.id })).toBe(1);

    let tried = false;
    push._setMessaging({ sendEachForMulticast: async () => { tried = true; throw new Error('boom'); } });
    await notify(asha.id, { type: 'x', title: 'Again', body: 'Still saved' });
    await until(() => tried);
    expect(await Notification.countDocuments({ user: asha.id })).toBe(2);
  });
});

describe('registering a phone', () => {
  it('needs a sign-in, and checks the token', async () => {
    expect((await call('post', '/api/notifications/devices', null, { token: TOKEN(1) })).status).toBe(401);
    expect((await call('post', '/api/notifications/devices', asha, { token: 'short' })).status).toBe(422);
    expect((await call('post', '/api/notifications/devices', asha, { token: TOKEN(1), platform: 'ios' })).status).toBe(422);
    expect((await call('post', '/api/notifications/devices', asha, { token: TOKEN(1), extra: 1 })).status).toBe(422);
    expect(await DeviceToken.countDocuments()).toBe(0);
  });

  it('saves the token once, however often the app registers it', async () => {
    expect((await call('post', '/api/notifications/devices', asha, { token: TOKEN(1) })).status).toBe(200);
    await call('post', '/api/notifications/devices', asha, { token: TOKEN(1), platform: 'web' });
    const rows = await DeviceToken.find().lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ platform: 'web' });
    expect(String(rows[0].user)).toBe(asha.id);
  });

  it('moves a token to the person who signs in on that phone next', async () => {
    await call('post', '/api/notifications/devices', asha, { token: TOKEN(1) });
    await call('post', '/api/notifications/devices', ravi, { token: TOKEN(1) });
    const rows = await DeviceToken.find().lean();
    expect(rows).toHaveLength(1);
    expect(String(rows[0].user)).toBe(ravi.id);
  });

  it('removes only the person\'s own token, with the same answer for anyone else\'s', async () => {
    await call('post', '/api/notifications/devices', asha, { token: TOKEN(1) });
    const stranger = await call('delete', '/api/notifications/devices', ravi, { token: TOKEN(1) });
    expect(stranger.status).toBe(200);
    expect(await DeviceToken.countDocuments()).toBe(1);
    expect((await call('delete', '/api/notifications/devices', asha, { token: TOKEN(1) })).status).toBe(200);
    expect(await DeviceToken.countDocuments()).toBe(0);
    expect((await call('delete', '/api/notifications/devices', null, { token: TOKEN(1) })).status).toBe(401);
  });

  it('is available to administrators too: they get notifications as well', async () => {
    expect((await call('post', '/api/notifications/devices', admin, { token: TOKEN(9) })).status).toBe(200);
  });
});
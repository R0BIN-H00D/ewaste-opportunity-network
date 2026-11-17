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
const chat = require('../src/services/chatService');
const { notify } = require('../src/services/notificationService');
const User = require('../src/models/User');
const { signAccessToken } = require('../src/utils/tokens');

let server; let io; let url; let owner; let tech; let stranger; let convoId;
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
  const cats = await seedCategories();
  owner = await makeUser('user');
  tech = await makeTechnician();
  stranger = await makeUser('user');
  const listing = await makeListing(owner, cats.laptop);
  const repair = await ServiceRequest.create({ listing: listing._id, customer: owner.id, technician: tech.id });
  convoId = String((await chat.open(owner, { contextType: 'service', contextId: String(repair._id) }))._id);
});
afterEach(() => {
  while (open.length) open.pop().close();
});

/** A connected, signed-in client. Resolves once the server has accepted it. */
function client(user, token = user.token) {
  const socket = connect(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
  open.push(socket);
  return new Promise((resolve, reject) => {
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}
const once = (socket, event) => new Promise((resolve) => socket.once(event, resolve));
const emit = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
/** True if the event does NOT arrive within a short wait. */
const stays = (socket, event, ms = 250) =>
  new Promise((resolve) => {
    const onEvent = () => resolve(false);
    socket.once(event, onEvent);
    setTimeout(() => {
      socket.off(event, onEvent);
      resolve(true);
    }, ms);
  });

describe('connecting', () => {
  it('needs a valid access token', async () => {
    await expect(client(owner, '')).rejects.toThrow('UNAUTHORIZED');
    await expect(client(owner, 'not.a.token')).rejects.toThrow('UNAUTHORIZED');
    await expect(client(owner)).resolves.toBeTruthy();
  });

  it('turns away a suspended account and a token that was revoked', async () => {
    await User.updateOne({ _id: stranger.id }, { status: 'suspended' });
    await expect(client(stranger)).rejects.toThrow('UNAUTHORIZED');
    const revokedToken = signAccessToken({ _id: owner.id, role: 'user', tokenVersion: 0 });
    await User.updateOne({ _id: owner.id }, { $inc: { tokenVersion: 1 } });
    await expect(client(owner, revokedToken)).rejects.toThrow('UNAUTHORIZED');
  });
});

describe('live chat', () => {
  it('delivers a sent message to the other person at once, and confirms it to the sender', async () => {
    const [a, b] = [await client(owner), await client(tech)];
    const arrived = once(b, 'message:new');
    const ack = await emit(a, 'message:send', { conversationId: convoId, text: 'Is it ready?' });

    expect(ack.ok).toBe(true);
    expect(ack.data).toMatchObject({ text: 'Is it ready?', sender: owner.id });
    const got = await arrived;
    expect(got.message).toMatchObject({ text: 'Is it ready?', sender: owner.id });
    expect(got.conversation).toMatchObject({ unread: 1, other: { _id: owner.id } }); // the technician's own view
  });

  it('also reaches the sender\'s other devices, but never anyone else', async () => {
    const [phone, laptop, bystander] = [await client(owner), await client(owner), await client(stranger)];
    const onLaptop = once(laptop, 'message:new');
    const quiet = stays(bystander, 'message:new');
    await emit(phone, 'message:send', { conversationId: convoId, text: 'hello' });
    expect((await onLaptop).message.text).toBe('hello');
    expect(await quiet).toBe(true);
  });

  it('refuses a stranger sending into someone else\'s thread, and sends nothing', async () => {
    const [intruder, b] = [await client(stranger), await client(tech)];
    const quiet = stays(b, 'message:new');
    const ack = await emit(intruder, 'message:send', { conversationId: convoId, text: 'let me in' });
    expect(ack).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    expect(await quiet).toBe(true);
  });

  it('rejects bad payloads without crashing the connection', async () => {
    const a = await client(owner);
    expect(await emit(a, 'message:send', { conversationId: 'nope', text: 'x' })).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(await emit(a, 'message:send', { conversationId: convoId })).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
    expect(await emit(a, 'message:send', { conversationId: convoId, text: '   ' })).toMatchObject({ ok: false });
    expect(await emit(a, 'message:send', { conversationId: convoId, text: 'still here' })).toMatchObject({ ok: true });
  });

  it('tells the sender when the other person has read, with the unread count cleared', async () => {
    const [a, b] = [await client(owner), await client(tech)];
    await emit(a, 'message:send', { conversationId: convoId, text: 'one' });
    const seen = once(a, 'message:read');
    const ack = await emit(b, 'message:read', { conversationId: convoId });
    expect(ack).toMatchObject({ ok: true, data: { unread: 0 } });
    expect(await seen).toMatchObject({ conversationId: convoId, by: tech.id });
  });

  it('relays typing to the other person only, and only inside a thread both are in', async () => {
    const [a, b, outsider] = [await client(owner), await client(tech), await client(stranger)];
    const heard = once(b, 'typing');
    await emit(a, 'typing', { conversationId: convoId, typing: true });
    expect(await heard).toEqual({ conversationId: convoId, userId: owner.id, typing: true });

    const quietOwner = stays(a, 'typing');
    const quietOutsider = stays(outsider, 'typing');
    await emit(a, 'typing', { conversationId: convoId, typing: false });
    expect(await quietOwner).toBe(true); // the typist is not told about their own typing
    expect(await quietOutsider).toBe(true);

    // A stranger typing into the thread is ignored: nobody hears it.
    const quietTech = stays(b, 'typing');
    await emit(outsider, 'typing', { conversationId: convoId, typing: true });
    expect(await quietTech).toBe(true);
  });

  it('works over REST too, with the same live delivery', async () => {
    const b = await client(tech);
    const arrived = once(b, 'message:new');
    await chat.send(owner, convoId, { text: 'sent over REST' });
    expect((await arrived).message.text).toBe('sent over REST');
  });
});

describe('notification push', () => {
  it('pushes a new notification to its owner with the unread total, and to nobody else', async () => {
    const [mine, theirs] = [await client(owner), await client(stranger)];
    const quiet = stays(theirs, 'notification:new');
    const arrived = once(mine, 'notification:new');
    await notify(owner.id, { type: 'quotation.new', title: 'New quote', body: 'Rs 1,500', data: { id: 'x1' } });
    await notify(owner.id, { type: 'quotation.new', title: 'Another' });

    const got = await arrived;
    expect(got.notification).toMatchObject({ type: 'quotation.new', title: 'New quote', body: 'Rs 1,500', data: { id: 'x1' }, readAt: null });
    expect(got.unread).toBe(1);
    expect(await quiet).toBe(true);
  });

  it('still saves the notification when nobody is connected', async () => {
    await notify(owner.id, { type: 'a', title: 'Saved quietly' });
    expect((await require('../src/services/notificationService').unreadCount(owner)).unread).toBe(1);
  });
});

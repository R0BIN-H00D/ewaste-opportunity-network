'use strict';
require('./helpers/env');
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, authHeader, seedCategories } = require('./helpers/factories');
const RecyclingCenter = require('../src/models/RecyclingCenter');
const PickupSchedule = require('../src/models/PickupSchedule');
const { assertCanReschedule, MAX_RESCHEDULES } = require('../src/services/pickupRules');

const app = createApp();
let cats; let center; let centerUser; let owner; let other; let admin;

const REQ = '/api/recycling-requests';
const day = 24 * 3600 * 1000;
const later = (days = 3) => new Date(Date.now() + days * day).toISOString();
const call = (method, url, user, body) => {
  const r = request(app)[method](url);
  if (user) r.set(authHeader(user));
  return body === undefined ? r : r.send(body);
};
const list = (user, qs = '') => call('get', `/api/pickups${qs}`, user);

async function sendRequest() {
  const r = request(app).post(REQ).set(authHeader(owner));
  const fields = {
    centerId: String(center._id), categories: JSON.stringify([String(cats.laptop._id)]), deviceCount: '2',
    pickupAddressArea: 'Indiranagar', pickupAddress: '12, 5th Cross, Indiranagar, Bengaluru',
  };
  for (const [k, v] of Object.entries(fields)) r.field(k, v);
  return (await r).body.data;
}
async function scheduled(date = later()) {
  const rec = await sendRequest();
  await call('put', `${REQ}/${rec._id}/status`, centerUser, { status: 'accepted' });
  await call('post', `${REQ}/${rec._id}/pickup`, centerUser, { date, timeSlot: '10:00-12:00', notes: 'Ring the bell' });
  return rec;
}
const direct = (over = {}) => PickupSchedule.create({
  contextType: 'service', contextId: new mongoose.Types.ObjectId(), requester: owner.id, provider: centerUser.id,
  date: new Date(Date.now() + day), addressArea: 'Koramangala', status: 'confirmed', ...over,
});

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  centerUser = await makeUser('recycler');
  center = await RecyclingCenter.create({
    user: centerUser.id, name: 'GreenCycle Recyclers', city: 'Bengaluru', authorizationNo: 'KSPCB-1', authorizingBody: 'State Pollution Control Board',
    acceptedCategories: [cats.laptop._id], location: { type: 'Point', coordinates: [77.62, 12.95] }, verification: { status: 'approved' },
  });
  owner = await makeUser('user', { name: 'Asha Rao' });
  other = await makeUser('user', { name: 'Someone Else' });
  admin = await makeUser('admin');
});

describe('shared reschedule rules', () => {
  const pickup = (over = {}) => ({ rescheduleCount: 0, date: new Date(Date.now() + 5 * 3600 * 1000), ...over });

  it('allows a change with room to spare', () => {
    expect(() => assertCanReschedule(pickup())).not.toThrow();
    expect(() => assertCanReschedule(pickup({ rescheduleCount: MAX_RESCHEDULES - 1 }))).not.toThrow();
  });
  it('stops after three reschedules and names the thing being moved', () => {
    expect(MAX_RESCHEDULES).toBe(3);
    expect(() => assertCanReschedule(pickup({ rescheduleCount: 3 }), 'handover')).toThrow('A handover can be rescheduled at most 3 times');
    try { assertCanReschedule(pickup({ rescheduleCount: 3 })); } catch (e) { expect(e.code).toBe('RESCHEDULE_LIMIT'); expect(e.statusCode).toBe(409); expect(e.message).toBe('A pickup can be rescheduled at most 3 times'); }
  });
  it('stops within two hours of the start', () => {
    const soon = pickup({ date: new Date(Date.now() + 60 * 60 * 1000) });
    expect(() => assertCanReschedule(soon, 'pickup')).toThrow('A pickup cannot be changed less than 2 hours before it starts');
    try { assertCanReschedule(soon, 'handover'); } catch (e) { expect(e.code).toBe('RESCHEDULE_TOO_LATE'); expect(e.message).toBe('A handover cannot be changed less than 2 hours before it starts'); }
  });
});

describe('GET /api/pickups', () => {
  it('needs a login and is not for admins', async () => {
    expect((await list()).status).toBe(401);
    expect((await list(admin)).status).toBe(403);
  });

  it('shows both sides their upcoming pickup with the area only', async () => {
    const rec = await scheduled();
    const asOwner = await list(owner);
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.data).toHaveLength(1);
    expect(asOwner.body.data[0]).toMatchObject({
      kind: 'recycling', contextId: rec._id, link: `/dashboard/recycling/${rec._id}`, addressArea: 'Indiranagar', timeSlot: '10:00-12:00', notes: 'Ring the bell',
      status: 'confirmed', rescheduleCount: 0, viewerRole: 'requester', counterpart: { name: centerUser.doc.name },
    });
    expect(asOwner.body.data[0].title).toContain('Recycling request');
    expect(JSON.stringify(asOwner.body)).not.toContain('5th Cross');

    const asCentre = await list(centerUser);
    expect(asCentre.body.data[0]).toMatchObject({ viewerRole: 'provider', counterpart: { name: 'Asha Rao' } });
    expect(JSON.stringify(asCentre.body)).not.toContain('5th Cross');
  });

  it('shows nothing to people who are not part of it', async () => {
    await scheduled();
    expect((await list(other)).body.data).toEqual([]);
    expect((await list(other, '?when=past')).body.data).toEqual([]);
  });

  it('lists the soonest first, and finished or cancelled ones only under past', async () => {
    await direct({ date: new Date(Date.now() + 3 * day), addressArea: 'Third' });
    await direct({ date: new Date(Date.now() + 1 * day), addressArea: 'First' });
    await direct({ date: new Date(Date.now() + 2 * day), addressArea: 'Second', status: 'rescheduled', rescheduleCount: 1 });
    await direct({ date: new Date(Date.now() + 2 * day), addressArea: 'Cancelled', status: 'cancelled' });
    await direct({ date: new Date(Date.now() + 2 * day), addressArea: 'Done', status: 'collected' });
    await direct({ date: new Date(Date.now() - 2 * day), addressArea: 'Gone by' });

    const upcoming = await list(owner);
    expect(upcoming.body.data.map((p) => p.addressArea)).toEqual(['First', 'Second', 'Third']);
    expect(upcoming.body.data[1]).toMatchObject({ status: 'rescheduled', rescheduleCount: 1 });

    const past = await list(owner, '?when=past');
    expect(past.body.data.map((p) => p.addressArea).sort()).toEqual(['Cancelled', 'Done', 'Gone by']);
    expect(past.body.data[0].date >= past.body.data[past.body.data.length - 1].date).toBe(true);
  });

  it('moves a pickup to past once both sides confirm the handover', async () => {
    const rec = await scheduled();
    await call('post', `${REQ}/${rec._id}/confirm-handover`, owner, { acknowledgeChecklist: true });
    await call('post', `${REQ}/${rec._id}/confirm-handover`, centerUser, {});
    expect((await list(owner)).body.data).toEqual([]);
    const past = await list(owner, '?when=past');
    expect(past.body.data).toHaveLength(1);
    expect(past.body.data[0]).toMatchObject({ contextId: rec._id, status: 'collected' });
  });

  it('still lists a pickup whose request cannot be found, with a plain title and the right link', async () => {
    const p = await direct();
    const res = await list(owner);
    expect(res.body.data[0]).toMatchObject({ kind: 'repair', title: 'Pickup', link: `/dashboard/requests/${p.contextId}` });
  });

  it('pages and checks its query', async () => {
    for (let i = 1; i <= 3; i += 1) await direct({ date: new Date(Date.now() + i * day) });
    const res = await list(owner, '?limit=2&page=2');
    expect(res.body.meta).toMatchObject({ total: 3, page: 2, limit: 2, pages: 2 });
    expect(res.body.data).toHaveLength(1);
    expect((await list(owner, '?when=tomorrow')).status).toBe(422);
    expect((await list(owner, '?foo=1')).status).toBe(422);
  });
});

describe('GET /api/pickups/slots', () => {
  it('offers five windows a day for the next two weeks and never one that starts within two hours', async () => {
    const res = await call('get', '/api/pickups/slots', owner);
    expect(res.status).toBe(200);
    const { days, cutoffHours, maxReschedules, timezone } = res.body.data;
    expect(cutoffHours).toBe(2);
    expect(maxReschedules).toBe(3);
    expect(timezone).toBe('Asia/Kolkata');
    expect(days.length).toBeGreaterThanOrEqual(14);
    days.forEach((d) => expect(d.slots.map((s) => s.key)).toEqual(['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00']));
    days.flatMap((d) => d.slots).forEach((s) => {
      if (new Date(s.start).getTime() - Date.now() < 2 * 3600 * 1000) expect(s.available).toBe(false);
      else expect(s.available).toBe(true);
    });
  });

  it('marks a window busy when the person already has a pickup in it', async () => {
    const free = (await call('get', '/api/pickups/slots', owner)).body.data.days.flatMap((d) => d.slots).find((s) => s.available);
    await direct({ date: new Date(free.start) });
    const after = (await call('get', '/api/pickups/slots', owner)).body.data.days.flatMap((d) => d.slots).find((s) => s.start === free.start);
    expect(after.available).toBe(false);
    expect(after.reason).toBe('busy');
    // the other side of that pickup is busy then too, a stranger is not
    const theirs = (await call('get', '/api/pickups/slots', centerUser)).body.data.days.flatMap((d) => d.slots).find((s) => s.start === free.start);
    expect(theirs.available).toBe(false);
    const strangers = (await call('get', '/api/pickups/slots', other)).body.data.days.flatMap((d) => d.slots).find((s) => s.start === free.start);
    expect(strangers.available).toBe(true);
  });

  it('ignores cancelled and collected pickups', async () => {
    const free = (await call('get', '/api/pickups/slots', owner)).body.data.days.flatMap((d) => d.slots).find((s) => s.available);
    await direct({ date: new Date(free.start), status: 'cancelled' });
    await direct({ date: new Date(free.start), status: 'collected' });
    const again = (await call('get', '/api/pickups/slots', owner)).body.data.days.flatMap((d) => d.slots).find((s) => s.start === free.start);
    expect(again.available).toBe(true);
  });

  it('is for signed-in people with pickups, not anonymous callers or administrators', async () => {
    expect((await call('get', '/api/pickups/slots')).status).toBe(401);
    expect((await call('get', '/api/pickups/slots', admin)).status).toBe(403);
  });
});

describe('what the list says about changing a pickup', () => {
  it('says how many changes are left and until when', async () => {
    await scheduled(later(3));
    const item = (await list(owner)).body.data[0];
    expect(item.reschedulesLeft).toBe(3);
    expect(item.canChange).toBe(true);
    expect(new Date(item.changeableUntil).getTime()).toBe(new Date(item.date).getTime() - 2 * 3600 * 1000);
  });

  it('says no once the changes are used up or the start is under two hours away', async () => {
    await direct({ rescheduleCount: 3 });
    await direct({ date: new Date(Date.now() + 3600 * 1000) });
    const items = (await list(owner)).body.data;
    expect(items).toHaveLength(2);
    const used = items.find((i) => i.rescheduleCount === 3);
    expect(used.reschedulesLeft).toBe(0);
    expect(used.canChange).toBe(false);
    expect(items.find((i) => i.rescheduleCount === 0).canChange).toBe(false);
  });
});

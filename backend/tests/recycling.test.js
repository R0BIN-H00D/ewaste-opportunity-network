'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { PNG, makeUser, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const RecyclingCenter = require('../src/models/RecyclingCenter');
const RecyclingRecord = require('../src/models/RecyclingRecord');
const PickupSchedule = require('../src/models/PickupSchedule');
const DeviceListing = require('../src/models/DeviceListing');
const EnvironmentalImpact = require('../src/models/EnvironmentalImpact');
const Notification = require('../src/models/Notification');
const workflow = require('../src/services/workflow/recycling');

const app = createApp();
let cats; let center; let centerUser; let owner; let other; let admin;

const REQ = '/api/recycling-requests';
const later = (days = 3) => new Date(Date.now() + days * 24 * 3600 * 1000).toISOString();
const call = (method, url, user, body) => {
  const r = request(app)[method](url);
  if (user) r.set(authHeader(user));
  return body === undefined ? r : r.send(body);
};

async function makeCenter(extra = {}, userExtra = {}) {
  const u = await makeUser('recycler', userExtra);
  const doc = await RecyclingCenter.create({
    user: u.id, name: 'GreenCycle Recyclers', city: 'Bengaluru', authorizationNo: 'KSPCB-1', authorizingBody: 'State Pollution Control Board',
    acceptedCategories: [cats.laptop._id, cats.smartphone._id], location: { type: 'Point', coordinates: [77.62, 12.95] },
    verification: { status: 'approved' }, ...extra,
  });
  return { user: u, doc };
}

/** Sends a request as multipart, the way the web form does. */
const send = (user, fields = {}, { photos = 0 } = {}) => {
  const r = request(app).post(REQ).set(authHeader(user));
  const all = {
    centerId: String(center.doc._id), categories: JSON.stringify([String(cats.laptop._id)]), deviceCount: '2',
    pickupAddressArea: 'Indiranagar', pickupAddress: '12, 5th Cross, Indiranagar, Bengaluru', notes: 'Two old laptops', ...fields,
  };
  for (const [k, v] of Object.entries(all)) if (v !== undefined) r.field(k, v);
  for (let i = 0; i < photos; i += 1) r.attach('photos', PNG, { filename: `p${i}.png`, contentType: 'image/png' });
  return r;
};
const make = async (user = owner, fields) => (await send(user, fields)).body.data;

const accept = (id) => call('put', `${REQ}/${id}/status`, centerUser, { status: 'accepted' });
const schedule = (id, body = {}) => call('post', `${REQ}/${id}/pickup`, centerUser, { date: later(), timeSlot: '10:00-12:00', ...body });
async function toCollected(id) {
  await accept(id);
  await schedule(id);
  await call('post', `${REQ}/${id}/confirm-handover`, owner, { acknowledgeChecklist: true });
  return call('post', `${REQ}/${id}/confirm-handover`, centerUser, {});
}
async function toReceived(id) {
  await toCollected(id);
  return call('put', `${REQ}/${id}/status`, centerUser, { status: 'received_at_center' });
}
const materials = (id, list, user = centerUser) => call('put', `${REQ}/${id}/materials`, user, { materials: list });
async function toCompleted(id, list = [{ type: 'copper', actualKg: 1.5, estimatedKg: 2 }, { type: 'plastics', estimatedKg: 3 }]) {
  await toReceived(id);
  await materials(id, list);
  await call('put', `${REQ}/${id}/status`, centerUser, { status: 'processed' });
  return call('put', `${REQ}/${id}/status`, centerUser, { status: 'completed' });
}

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  const c = await makeCenter();
  center = c;
  centerUser = c.user;
  owner = await makeUser('user', { name: 'Asha Rao' });
  other = await makeUser('user', { name: 'Someone Else' });
  admin = await makeUser('admin');
});

describe('recycling workflow rules (pure)', () => {
  it('only allows the documented moves for each actor', () => {
    expect(workflow.canTransition('requested', 'accepted', 'center')).toBe(true);
    expect(workflow.canTransition('requested', 'accepted', 'requester')).toBe(false);
    expect(workflow.canTransition('pickup_scheduled', 'collected', 'system')).toBe(true);
    expect(workflow.canTransition('pickup_scheduled', 'collected', 'center')).toBe(false);
    expect(workflow.canTransition('accepted', 'completed', 'center')).toBe(false);
    expect(() => workflow.assertTransition('completed', 'cancelled', 'requester')).toThrow(/cannot move/);
  });

  it('offers actions by role and stops cancelling once a handover is confirmed', () => {
    expect(workflow.availableActions({ status: 'requested' }, 'center')).toEqual(['accept', 'reject']);
    expect(workflow.availableActions({ status: 'requested' }, 'requester')).toEqual(['cancel']);
    expect(workflow.availableActions({ status: 'pickup_scheduled' }, 'requester', { handoverStarted: false, confirmedByMe: false })).toEqual(['confirm_handover', 'cancel']);
    expect(workflow.availableActions({ status: 'pickup_scheduled' }, 'requester', { handoverStarted: true, confirmedByMe: true })).toEqual([]);
    expect(workflow.availableActions({ status: 'received_at_center' }, 'center', { hasMaterials: false })).toEqual(['record_materials']);
    expect(workflow.availableActions({ status: 'received_at_center' }, 'center', { hasMaterials: true })).toEqual(['record_materials', 'process']);
  });
});

describe('GET /api/recycling-centers', () => {
  it('lists only verified, in-date centres of active accounts, with their authorisation (FR-REC-001, FR-REC-007)', async () => {
    await makeCenter({ name: 'Pending Recyclers', verification: { status: 'pending' } });
    await makeCenter({ name: 'Expired Recyclers', validUntil: new Date(Date.now() - 86400000) });
    await makeCenter({ name: 'Suspended Recyclers' }, { status: 'suspended' });
    await makeCenter({ name: 'Open Ended Recyclers', validUntil: undefined });
    const res = await call('get', '/api/recycling-centers');
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.name).sort()).toEqual(['GreenCycle Recyclers', 'Open Ended Recyclers']);
    expect(res.body.data[0]).toMatchObject({ authorized: true, city: 'Bengaluru' });
    expect(res.body.meta.total).toBe(2);
  });

  it('filters by category, city and search text', async () => {
    await makeCenter({ name: 'Phone Only Recyclers', city: 'Mysuru', acceptedCategories: [cats.smartphone._id] });
    expect((await call('get', '/api/recycling-centers?category=laptop')).body.data.map((c) => c.name)).toEqual(['GreenCycle Recyclers']);
    expect((await call('get', '/api/recycling-centers?category=smartphone')).body.meta.total).toBe(2);
    expect((await call('get', '/api/recycling-centers?city=mysuru')).body.data.map((c) => c.name)).toEqual(['Phone Only Recyclers']);
    expect((await call('get', '/api/recycling-centers?q=phone')).body.meta.total).toBe(1);
    expect((await call('get', '/api/recycling-centers?category=nonsense')).body.meta.total).toBe(0);
  });

  it('shows a public detail page with actual and estimated totals kept apart', async () => {
    await RecyclingCenter.updateOne({ _id: center.doc._id }, { $set: { totals: { actualKg: 12.5, estimatedKg: 30 }, facilityDetails: 'Authorised e-waste dismantling unit' } });
    const res = await call('get', `/api/recycling-centers/${center.doc._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ authorized: true, authorizationNo: 'KSPCB-1', facilityDetails: 'Authorised e-waste dismantling unit', totals: { actualKg: 12.5, estimatedKg: 30 } });
    expect(res.body.data.acceptedCategories.map((c) => c.slug).sort()).toEqual(['laptop', 'smartphone']);
  });

  it('compares centres publicly with weighed and estimated kilograms kept apart (P9-06)', async () => {
    const second = await makeCenter({ name: 'Second Recyclers', ratingAvg: 4.8, ratingCount: 5, totals: { actualKg: 90, estimatedKg: 10 } });
    await makeCenter({ name: 'Hidden Recyclers', verification: { status: 'pending' } });
    await RecyclingCenter.updateOne({ _id: center.doc._id }, { $set: { totals: { actualKg: 12.5, estimatedKg: 30 } } });
    await RecyclingRecord.create({ requester: owner.id, center: center.doc._id, status: 'completed', deviceCount: 3 });
    await RecyclingRecord.create({ requester: owner.id, center: center.doc._id, status: 'requested', deviceCount: 9 });
    const res = await call('get', '/api/recycling-centers/compare');
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c.name)).toEqual(['Second Recyclers', 'GreenCycle Recyclers']); // best rated first, hidden one absent
    const mine = res.body.data.find((c) => c.name === 'GreenCycle Recyclers');
    expect(mine).toMatchObject({ completedRequests: 1, devicesRecycled: 3, totals: { actualKg: 12.5, estimatedKg: 30 } });
    expect(res.body.data[0]).toMatchObject({ completedRequests: 0, totals: { actualKg: 90, estimatedKg: 10 } });
    expect(JSON.stringify(res.body.data)).not.toMatch(/"user"|email|"phone"/i);
    const byWeight = await call('get', '/api/recycling-centers/compare?sort=completed');
    expect(byWeight.body.data[0].name).toBe('GreenCycle Recyclers');
    expect((await call('get', '/api/recycling-centers/compare?sort=nonsense')).status).toBe(422);
    expect(second.doc.name).toBe('Second Recyclers');
  });

  it('hides a centre that is not approved and treats a bad id as not found', async () => {
    const hidden = await makeCenter({ verification: { status: 'pending' } });
    expect((await call('get', `/api/recycling-centers/${hidden.doc._id}`)).status).toBe(404);
    expect((await call('get', '/api/recycling-centers/not-an-id')).status).toBe(404);
  });
});

describe('POST /api/recycling-requests', () => {
  it('sends a request with photos, keeps the exact address private and notifies the centre (FR-REC-002)', async () => {
    const res = await send(owner, {}, { photos: 2 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      status: 'requested', viewerRole: 'requester', deviceCount: 2, pickupAddressArea: 'Indiranagar',
      pickupAddress: '12, 5th Cross, Indiranagar, Bengaluru', center: { name: 'GreenCycle Recyclers' },
    });
    expect(res.body.data.refNo).toMatch(/^REC-\d{4}-[0-9A-F]{6}$/);
    expect(res.body.data.photos).toHaveLength(2);
    expect(res.body.data.categories[0]).toMatchObject({ slug: 'laptop' });
    expect(res.body.data.actions).toEqual(['cancel']);
    const notes = await Notification.find({ user: centerUser.id, type: 'recycling.requested' });
    expect(notes).toHaveLength(1);
  });

  it('accepts categories as a comma list or a single id', async () => {
    const res = await send(owner, { categories: `${cats.laptop._id},${cats.smartphone._id}` });
    expect(res.status).toBe(201);
    expect(res.body.data.categories).toHaveLength(2);
  });

  it('needs sign-in and refuses admins', async () => {
    expect((await request(app).post(REQ).field('centerId', String(center.doc._id))).status).toBe(401);
    expect((await send(admin)).status).toBe(403);
  });

  it('checks every field', async () => {
    const bad = await send(owner, { categories: undefined, pickupAddressArea: 'x', pickupAddress: 'abc', deviceCount: '0' });
    expect(bad.status).toBe(422);
    const fields = bad.body.errors.map((e) => e.field).join(' ');
    expect(fields).toMatch(/categories/);
    expect(fields).toMatch(/pickupAddressArea/);
    expect(fields).toMatch(/pickupAddress/);
    expect(fields).toMatch(/deviceCount/);
    expect((await send(owner, { preferredDate: new Date(Date.now() - 86400000).toISOString() })).status).toBe(422);
    expect((await send(owner, { centerId: 'nope' })).status).toBe(422);
    expect((await send(owner, {}, { photos: 7 })).status).toBe(422);
  });

  it('refuses a category the centre does not accept (422) and a centre that cannot be chosen (409)', async () => {
    const res = await send(owner, { categories: JSON.stringify([String(cats.monitor._id)]) });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('categories');
    const pending = await makeCenter({ verification: { status: 'pending' } });
    const unavailable = await send(owner, { centerId: String(pending.doc._id) });
    expect(unavailable.status).toBe(409);
    expect(unavailable.body.code).toBe('CENTER_UNAVAILABLE');
    const suspended = await makeCenter({}, { status: 'suspended' });
    expect((await send(owner, { centerId: String(suspended.doc._id) })).body.code).toBe('CENTER_UNAVAILABLE');
  });

  it('will not let a centre send devices to itself', async () => {
    const res = await send(centerUser);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('OWN_CENTER');
  });

  it('holds a linked device while the request is open and frees it on cancel (BR-03)', async () => {
    const listing = await makeListing(owner, cats.laptop, { preferredService: 'recycling', status: 'listed' });
    const created = await send(owner, { listingId: String(listing._id) });
    expect(created.status).toBe(201);
    expect(created.body.data.listing).toMatchObject({ title: 'HP Pavilion laptop' });
    let held = await DeviceListing.findById(listing._id);
    expect(held.status).toBe('in_service');
    expect(held.lockedBy.kind).toBe('recycling');
    expect((await send(owner, { listingId: String(listing._id) })).body.code).toBe('LISTING_UNAVAILABLE');

    await call('post', `${REQ}/${created.body.data._id}/cancel`, owner, { reason: 'Changed my mind' });
    held = await DeviceListing.findById(listing._id);
    expect(held.status).toBe('listed');
    expect(held.lockedBy?.refId).toBeUndefined();
  });

  it('refuses someone else\'s device', async () => {
    const listing = await makeListing(other, cats.laptop, { preferredService: 'recycling', status: 'listed' });
    expect((await send(owner, { listingId: String(listing._id) })).body.code).toBe('LISTING_UNAVAILABLE');
  });
});

describe('reading requests', () => {
  it('shows a request only to its two sides and admins (strangers get 404)', async () => {
    const r = await make();
    expect((await call('get', `${REQ}/${r._id}`, owner)).status).toBe(200);
    expect((await call('get', `${REQ}/${r._id}`, centerUser)).body.data.viewerRole).toBe('center');
    expect((await call('get', `${REQ}/${r._id}`, admin)).body.data.viewerRole).toBe('admin');
    expect((await call('get', `${REQ}/${r._id}`, other)).status).toBe(404);
    expect((await call('get', `${REQ}/${r._id}`)).status).toBe(401);
    expect((await call('get', `${REQ}/bad`, owner)).status).toBe(404);
  });

  it('lists my requests, and the centre\'s incoming ones by default', async () => {
    const a = await make();
    await make(other);
    const mine = await call('get', REQ, owner);
    expect(mine.body.data.map((x) => x._id)).toEqual([a._id]);
    expect(mine.body.data[0].pickupAddress).toBe('12, 5th Cross, Indiranagar, Bengaluru');
    const incoming = await call('get', REQ, centerUser);
    expect(incoming.body.meta.total).toBe(2);
    expect(incoming.body.data[0].pickupAddress).toBeUndefined();
    expect((await call('get', `${REQ}?status=accepted`, centerUser)).body.meta.total).toBe(0);
    expect((await call('get', `${REQ}?as=center`, owner)).status).toBe(403);
    expect((await call('get', `${REQ}?status=bogus`, owner)).status).toBe(422);
  });

  it('filters the history by date', async () => {
    await make();
    const past = new Date(Date.now() + 86400000).toISOString();
    expect((await call('get', `${REQ}?from=${encodeURIComponent(past)}`, centerUser)).body.meta.total).toBe(0);
    expect((await call('get', `${REQ}?to=${encodeURIComponent(past)}`, centerUser)).body.meta.total).toBe(1);
  });
});

describe('the centre decides', () => {
  it('accepts, tells the requester and then reveals the exact address to the centre (BR-08)', async () => {
    const r = await make();
    expect((await call('get', `${REQ}/${r._id}`, centerUser)).body.data.pickupAddress).toBeUndefined();
    const res = await accept(r._id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'accepted', pickupAddress: '12, 5th Cross, Indiranagar, Bengaluru' });
    expect(res.body.data.actions).toEqual(['schedule_pickup', 'cancel']);
    expect(await Notification.countDocuments({ user: owner.id, type: 'recycling.accepted' })).toBe(1);
  });

  it('declines with a reason and frees the device', async () => {
    const listing = await makeListing(owner, cats.laptop, { preferredService: 'recycling', status: 'listed' });
    const r = await make(owner, { listingId: String(listing._id) });
    const res = await call('put', `${REQ}/${r._id}/status`, centerUser, { status: 'rejected', reason: 'We are full this month' });
    expect(res.body.data).toMatchObject({ status: 'rejected', cancelReason: 'We are full this month' });
    expect((await DeviceListing.findById(listing._id)).status).toBe('listed');
    expect((await call('post', `${REQ}/${r._id}/cancel`, owner, {})).status).toBe(409);
  });

  it('keeps the decision to the centre and to a verified centre (BR-01)', async () => {
    const r = await make();
    expect((await call('put', `${REQ}/${r._id}/status`, owner, { status: 'accepted' })).status).toBe(403);
    expect((await call('put', `${REQ}/${r._id}/status`, other, { status: 'accepted' })).status).toBe(404);
    await RecyclingCenter.updateOne({ _id: center.doc._id }, { $set: { 'verification.status': 'suspended' } });
    const res = await accept(r._id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_VERIFIED');
  });

  it('refuses moves the rules do not allow', async () => {
    const r = await make();
    const skip = await call('put', `${REQ}/${r._id}/status`, centerUser, { status: 'completed' });
    expect(skip.status).toBe(409);
    expect(skip.body.code).toBe('INVALID_TRANSITION');
    expect((await call('put', `${REQ}/${r._id}/status`, centerUser, { status: 'pickup_scheduled' })).status).toBe(422);
    expect((await call('put', `${REQ}/${r._id}/status`, centerUser, { status: 'collected' })).status).toBe(422);
    await accept(r._id);
    expect((await accept(r._id)).status).toBe(409);
  });
});

describe('pickup and handover (FR-REC-003, FR-REC-004)', () => {
  it('schedules a pickup and moves to pickup_scheduled', async () => {
    const r = await make();
    await accept(r._id);
    const res = await schedule(r._id, { notes: 'Call at the gate' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('pickup_scheduled');
    expect(res.body.data.pickup).toMatchObject({ timeSlot: '10:00-12:00', notes: 'Call at the gate', status: 'confirmed', rescheduleCount: 0 });
    expect(res.body.data.pickupAddress).toBe('12, 5th Cross, Indiranagar, Bengaluru');
    const pickup = await PickupSchedule.findOne({ contextType: 'recycling', contextId: r._id });
    expect(String(pickup.provider)).toBe(centerUser.id);
    expect(await Notification.countDocuments({ user: owner.id, type: 'recycling.pickup' })).toBe(1);
  });

  it('needs a future date, an accepted request and the centre', async () => {
    const r = await make();
    expect((await schedule(r._id)).status).toBe(409); // not accepted yet
    await accept(r._id);
    expect((await schedule(r._id, { date: new Date(Date.now() - 1000).toISOString() })).status).toBe(422);
    expect((await call('post', `${REQ}/${r._id}/pickup`, owner, { date: later() })).status).toBe(403);
  });

  it('reschedules up to three times, then stops', async () => {
    const r = await make();
    await accept(r._id);
    await schedule(r._id);
    for (let i = 1; i <= 3; i += 1) {
      const res = await schedule(r._id, { date: later(3 + i) });
      expect(res.body.data.pickup.rescheduleCount).toBe(i);
      expect(res.body.data.pickup.status).toBe('rescheduled');
    }
    const res = await schedule(r._id, { date: later(9) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RESCHEDULE_LIMIT');
  });

  it('will not reschedule within two hours of the pickup', async () => {
    const r = await make();
    await accept(r._id);
    await schedule(r._id, { date: new Date(Date.now() + 3600 * 1000).toISOString() });
    const res = await schedule(r._id, { date: later() });
    expect(res.body.code).toBe('RESCHEDULE_TOO_LATE');
  });

  it('needs the data-protection checklist from the requester (BR-12)', async () => {
    const r = await make();
    await accept(r._id);
    await schedule(r._id);
    const res = await call('post', `${REQ}/${r._id}/confirm-handover`, owner, {});
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('acknowledgeChecklist');
  });

  it('becomes collected only when both sides confirm, and hides the address afterwards (BR-08)', async () => {
    const r = await make();
    await accept(r._id);
    await schedule(r._id);
    const first = await call('post', `${REQ}/${r._id}/confirm-handover`, owner, { acknowledgeChecklist: true });
    expect(first.body.data.status).toBe('pickup_scheduled');
    expect(first.body.data.confirmations).toEqual({ requester: true, center: false, checklistAcknowledged: true });
    expect(first.body.data.actions).toEqual([]);
    expect(await Notification.countDocuments({ user: centerUser.id, type: 'recycling.handover' })).toBe(1);

    // confirming again changes nothing
    expect((await call('post', `${REQ}/${r._id}/confirm-handover`, owner, { acknowledgeChecklist: true })).status).toBe(200);

    const second = await call('post', `${REQ}/${r._id}/confirm-handover`, centerUser, {});
    expect(second.body.data.status).toBe('collected');
    expect(second.body.data.pickupAddress).toBeUndefined();
    expect((await call('get', `${REQ}/${r._id}`, owner)).body.data.pickupAddress).toBeDefined();
    expect((await PickupSchedule.findOne({ contextId: r._id })).status).toBe('collected');
    expect(await Notification.countDocuments({ user: owner.id, type: 'recycling.collected' })).toBe(1);
  });

  it('cannot be confirmed before a pickup exists, or by strangers', async () => {
    const r = await make();
    expect((await call('post', `${REQ}/${r._id}/confirm-handover`, owner, { acknowledgeChecklist: true })).status).toBe(409);
    await accept(r._id);
    await schedule(r._id);
    expect((await call('post', `${REQ}/${r._id}/confirm-handover`, other, { acknowledgeChecklist: true })).status).toBe(404);
    expect((await call('post', `${REQ}/${r._id}/confirm-handover`, admin, {})).status).toBe(403);
  });
});

describe('cancelling', () => {
  it('lets the requester cancel while requested, and the centre once accepted', async () => {
    const a = await make();
    expect((await call('post', `${REQ}/${a._id}/cancel`, owner, { reason: 'Found another centre' })).body.data).toMatchObject({ status: 'cancelled', cancelReason: 'Found another centre' });
    expect(await Notification.countDocuments({ user: centerUser.id, type: 'recycling.cancelled' })).toBe(1);

    const b = await make();
    await accept(b._id);
    await schedule(b._id);
    const res = await call('post', `${REQ}/${b._id}/cancel`, centerUser, { reason: 'Vehicle broke down' });
    expect(res.body.data.status).toBe('cancelled');
    expect((await PickupSchedule.findOne({ contextId: b._id })).status).toBe('cancelled');
    expect(await Notification.countDocuments({ user: owner.id, type: 'recycling.cancelled' })).toBe(1);
  });

  it('works through PUT /status too, and lets an admin step in', async () => {
    const a = await make();
    expect((await call('put', `${REQ}/${a._id}/status`, owner, { status: 'cancelled' })).body.data.status).toBe('cancelled');
    const b = await make();
    expect((await call('post', `${REQ}/${b._id}/cancel`, admin, { reason: 'Policy' })).body.data.status).toBe('cancelled');
  });

  it('is not possible after a handover confirmation, once received, or by strangers', async () => {
    const a = await make();
    await accept(a._id);
    await schedule(a._id);
    await call('post', `${REQ}/${a._id}/confirm-handover`, owner, { acknowledgeChecklist: true });
    const blocked = await call('post', `${REQ}/${a._id}/cancel`, owner, {});
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('HANDOVER_IN_PROGRESS');

    const b = await make();
    await toReceived(b._id);
    expect((await call('post', `${REQ}/${b._id}/cancel`, owner, {})).status).toBe(409);
    expect((await call('post', `${REQ}/${b._id}/cancel`, other, {})).status).toBe(404);
  });
});

describe('recovered materials (FR-REC-005, BR-06)', () => {
  it('can be recorded only once the devices are at the centre', async () => {
    const r = await make();
    await toCollected(r._id);
    expect((await materials(r._id, [{ type: 'copper', actualKg: 1 }])).status).toBe(409);
    await call('put', `${REQ}/${r._id}/status`, centerUser, { status: 'received_at_center' });
    expect((await materials(r._id, [{ type: 'copper', actualKg: 1 }])).status).toBe(200);
  });

  it('stores actual and estimated weights separately and never merges them', async () => {
    const r = await make();
    await toReceived(r._id);
    const res = await materials(r._id, [
      { type: 'copper', actualKg: 1.5, estimatedKg: 2 },
      { type: 'plastics', estimatedKg: 3 },
      { type: 'iron', actualKg: 4 },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.data.materials).toEqual([
      expect.objectContaining({ type: 'copper', actualKg: 1.5, estimatedKg: 2 }),
      expect.objectContaining({ type: 'plastics', actualKg: null, estimatedKg: 3 }),
      expect.objectContaining({ type: 'iron', actualKg: 4, estimatedKg: null }),
    ]);
    expect(res.body.data.totals).toEqual({ actualKg: 5.5, estimatedKg: 5 });
    const saved = await RecyclingRecord.findById(r._id);
    const plastics = saved.materials.find((m) => m.type === 'plastics');
    expect(plastics.actualKg).toBeUndefined();
    expect(String(saved.materials[0].measuredBy)).toBe(centerUser.id);
    expect(plastics.measuredBy).toBeUndefined();
  });

  it('replaces the list when saved again', async () => {
    const r = await make();
    await toReceived(r._id);
    await materials(r._id, [{ type: 'copper', actualKg: 1 }]);
    const res = await materials(r._id, [{ type: 'glass', estimatedKg: 0.5 }]);
    expect(res.body.data.materials).toHaveLength(1);
    expect(res.body.data.materials[0].type).toBe('glass');
  });

  it('checks the entries', async () => {
    const r = await make();
    await toReceived(r._id);
    expect((await materials(r._id, [])).status).toBe(422);
    expect((await materials(r._id, [{ type: 'gold', actualKg: 1 }])).status).toBe(422);
    expect((await materials(r._id, [{ type: 'copper', actualKg: -1 }])).status).toBe(422);
    expect((await materials(r._id, [{ type: 'copper' }])).status).toBe(422);
    expect((await materials(r._id, [{ type: 'copper', actualKg: 1 }, { type: 'copper', actualKg: 2 }])).status).toBe(422);
    expect((await materials(r._id, [{ type: 'copper', actualKg: 1 }], owner)).status).toBe(403);
    expect((await materials(r._id, [{ type: 'copper', actualKg: 1 }], other)).status).toBe(404);
  });
});

describe('processing and completing', () => {
  it('needs materials before a request can be marked processed', async () => {
    const r = await make();
    await toReceived(r._id);
    const res = await call('put', `${REQ}/${r._id}/status`, centerUser, { status: 'processed' });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('materials');
  });

  it('walks received → processed → completed, updating totals and writing one verified impact event (BR-05)', async () => {
    const listing = await makeListing(owner, cats.laptop, { preferredService: 'recycling', status: 'listed' });
    const r = await make(owner, { listingId: String(listing._id) });
    const done = await toCompleted(r._id);
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'completed', totals: { actualKg: 1.5, estimatedKg: 5 } });
    expect(done.body.data.receivedAt).toBeDefined();
    expect(done.body.data.history.map((h) => h.status)).toEqual(['requested', 'accepted', 'pickup_scheduled', 'collected', 'received_at_center', 'processed', 'completed']);

    const impact = await EnvironmentalImpact.find({ refId: r._id });
    expect(impact).toHaveLength(1);
    expect(impact[0]).toMatchObject({ type: 'recycling', refType: 'RecyclingRecord', devices: 2 });
    expect(String(impact[0].user)).toBe(owner.id);
    expect(String(impact[0].verifiedBy)).toBe(centerUser.id);
    expect(impact[0].materials.actual).toEqual({ copper: 1.5 });
    expect(impact[0].materials.estimated).toEqual({ copper: 2, plastics: 3 });

    const c = await RecyclingCenter.findById(center.doc._id);
    expect(c.totals.actualKg).toBe(1.5);
    expect(c.totals.estimatedKg).toBe(5);
    expect((await DeviceListing.findById(listing._id)).status).toBe('completed');
    expect(await Notification.countDocuments({ user: owner.id, type: 'recycling.completed' })).toBe(1);
  });

  it('records no impact when nothing was actually measured', async () => {
    const r = await make();
    await toCompleted(r._id, [{ type: 'plastics', estimatedKg: 3 }]);
    expect(await EnvironmentalImpact.countDocuments({ refId: r._id })).toBe(0);
    expect((await RecyclingCenter.findById(center.doc._id)).totals.estimatedKg).toBe(3);
  });

  it('allows the centre to adjust materials after processing, until completion', async () => {
    const r = await make();
    await toReceived(r._id);
    await materials(r._id, [{ type: 'copper', actualKg: 1 }]);
    await call('put', `${REQ}/${r._id}/status`, centerUser, { status: 'processed' });
    expect((await materials(r._id, [{ type: 'copper', actualKg: 1.2 }])).body.data.totals.actualKg).toBe(1.2);
    await call('put', `${REQ}/${r._id}/status`, centerUser, { status: 'completed' });
    expect((await materials(r._id, [{ type: 'copper', actualKg: 9 }])).status).toBe(409);
  });
});

describe('GET /api/recycling-requests/report (FR-REC-006)', () => {
  it('totals completed work with actual and estimated kilograms apart', async () => {
    const a = await make();
    await toCompleted(a._id, [{ type: 'copper', actualKg: 1.5, estimatedKg: 2 }, { type: 'plastics', estimatedKg: 3 }]);
    const b = await make(owner, { deviceCount: '3', categories: JSON.stringify([String(cats.smartphone._id)]) });
    await toCompleted(b._id, [{ type: 'copper', actualKg: 0.5 }, { type: 'glass', actualKg: 0.25, estimatedKg: 0.3 }]);
    await make(other); // still only requested

    const res = await call('get', `${REQ}/report`, centerUser);
    expect(res.status).toBe(200);
    const rep = res.body.data;
    expect(rep.center).toBe('GreenCycle Recyclers');
    expect(rep.requests).toEqual({ total: 3, byStatus: { completed: 2, requested: 1 } });
    expect(rep.completed).toEqual({ count: 2, devices: 5 });
    expect(rep.materials.find((m) => m.type === 'copper')).toEqual({ type: 'copper', actualKg: 2, estimatedKg: 2 });
    expect(rep.materials.find((m) => m.type === 'glass')).toEqual({ type: 'glass', actualKg: 0.25, estimatedKg: 0.3 });
    expect(rep.totals).toEqual({ actualKg: 2.25, estimatedKg: 5.3 });
    expect(rep.byCategory.map((c) => [c.category.slug, c.requests, c.devices]).sort()).toEqual([['laptop', 1, 2], ['smartphone', 1, 3]]);
    expect(rep.items).toHaveLength(2);
  });

  it('can be limited by category and date range', async () => {
    const a = await make();
    await toCompleted(a._id);
    const b = await make(owner, { categories: JSON.stringify([String(cats.smartphone._id)]) });
    await toCompleted(b._id, [{ type: 'iron', actualKg: 2 }]);
    const phones = await call('get', `${REQ}/report?category=smartphone`, centerUser);
    expect(phones.body.data.completed.count).toBe(1);
    expect(phones.body.data.totals.actualKg).toBe(2);
    const future = encodeURIComponent(new Date(Date.now() + 86400000).toISOString());
    expect((await call('get', `${REQ}/report?from=${future}`, centerUser)).body.data.completed.count).toBe(0);
    expect((await call('get', `${REQ}/report?to=${future}`, centerUser)).body.data.completed.count).toBe(2);
  });

  it('exports a CSV with separate actual and estimated columns', async () => {
    const a = await make();
    await toCompleted(a._id, [{ type: 'copper', actualKg: 1.5, estimatedKg: 2 }]);
    const res = await call('get', `${REQ}/report?format=csv`, centerUser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.headers['content-disposition']).toMatch(/recycling-report\.csv/);
    const lines = res.text.split('\r\n');
    expect(lines[0]).toContain('copper actual kg,copper estimated kg');
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^REC-\d{4}-[0-9A-F]{6},\d{4}-\d{2}-\d{2},2,Laptop,1\.5,2,/);
    expect(lines[2]).toMatch(/^Total,,2,,1\.5,2,/);
  });

  it('is for recycling centres only', async () => {
    expect((await call('get', `${REQ}/report`, owner)).status).toBe(403);
    expect((await call('get', `${REQ}/report`, admin)).status).toBe(403);
    expect((await call('get', `${REQ}/report`)).status).toBe(401);
    expect((await call('get', `${REQ}/report?format=pdf`, centerUser)).status).toBe(422);
  });
});

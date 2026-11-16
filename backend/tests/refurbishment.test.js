'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { PNG, makeUser, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const RefurbisherProfile = require('../src/models/RefurbisherProfile');
const RefurbishmentJob = require('../src/models/RefurbishmentJob');
const DeviceListing = require('../src/models/DeviceListing');
const Transaction = require('../src/models/Transaction');
const PickupSchedule = require('../src/models/PickupSchedule');
const workflow = require('../src/services/workflow/refurbishment');

const app = createApp();
let cats; let owner; let refurb; let refurb2;

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
const api = (method, url, user, body) => {
  const r = request(app)[method](`/api/refurbishment${url}`);
  if (user) r.set(authHeader(user));
  return body === undefined ? r : r.send(body);
};

async function makeRefurbisher(name, status = 'approved') {
  const u = await makeUser('refurbisher', { name });
  await RefurbisherProfile.create({ user: u.id, businessName: `${name} Works`, city: 'Bengaluru', verification: { status } });
  return u;
}
const makeReusable = (extra = {}) => makeListing(owner, cats.laptop, { preferredService: 'refurbishment', title: 'Lenovo ThinkPad T450', ...extra });
const offer = (listing, user = refurb, body = {}) => api('post', '/offers', user, { listingId: String(listing._id), amount: 1500, message: 'Can collect this week', ...body });
const decide = (id, user = owner, decision = 'accept') => api('put', `/jobs/${id}/offer-decision`, user, { decision });
const schedule = (id, user = owner, extra = {}) => api('post', `/jobs/${id}/handover`, user, { date: inDays(3), timeSlot: '10:00-12:00', ...extra });
const confirm = (id, user, body = {}) => api('post', `/jobs/${id}/confirm-handover`, user, body);
const step = (id, status, user = refurb, note) => api('put', `/jobs/${id}/status`, user, { status, ...(note ? { note } : {}) });
const photo = (id, stage, user = refurb) => request(app).post(`/api/refurbishment/jobs/${id}/photos`).set(authHeader(user)).field('stage', stage).attach('photos', PNG, { filename: 'p.png', contentType: 'image/png' });

/** Walks a job to "accepted" with `refurb` as the chosen refurbisher. */
async function accepted() {
  const listing = await makeReusable();
  const id = (await offer(listing)).body.data._id;
  await decide(id);
  return { listing, id };
}
/** Walks a job to "collected". */
async function collected() {
  const j = await accepted();
  await schedule(j.id);
  await confirm(j.id, owner, { acknowledgeChecklist: true });
  await confirm(j.id, refurb);
  return j;
}

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  owner = await makeUser('user', { name: 'Asha Rao' });
  refurb = await makeRefurbisher('Ravi Kumar');
  refurb2 = await makeRefurbisher('Meena Iyer');
});

describe('workflow rules', () => {
  it('allows the intended path and nothing else', () => {
    expect(workflow.canTransition('offered', 'accepted', 'owner')).toBe(true);
    expect(workflow.canTransition('offered', 'accepted', 'refurbisher')).toBe(false);
    expect(workflow.canTransition('accepted', 'collected', 'system')).toBe(true);
    expect(workflow.canTransition('accepted', 'collected', 'refurbisher')).toBe(false);
    expect(workflow.canTransition('collected', 'assessment', 'refurbisher')).toBe(true);
    expect(workflow.canTransition('collected', 'in_progress', 'refurbisher')).toBe(false); // no skipping steps
    expect(workflow.canTransition('ready_to_list', 'listed', 'system')).toBe(true);
    expect(workflow.canTransition('collected', 'cancelled', 'admin')).toBe(false); // the device has already changed hands
  });
  it('lists what each person can do', () => {
    expect(workflow.availableActions({ status: 'offered' }, 'owner')).toEqual(['decide', 'cancel']);
    expect(workflow.availableActions({ status: 'offered' }, 'refurbisher')).toEqual(['withdraw']);
    expect(workflow.availableActions({ status: 'accepted' }, 'owner', {})).toEqual(['schedule_handover', 'cancel']);
    expect(workflow.availableActions({ status: 'accepted' }, 'owner', { hasPickup: true, handoverStarted: true, confirmedByMe: true })).toEqual([]);
    expect(workflow.availableActions({ status: 'testing' }, 'refurbisher')).toEqual(['advance', 'add_photos']);
    expect(workflow.availableActions({ status: 'testing' }, 'owner')).toEqual([]);
  });
});

describe('opportunities', () => {
  it('shows verified refurbishers reusable devices with only the public location', async () => {
    await makeReusable();
    await makeListing(owner, cats.laptop, { preferredService: 'repair', title: 'Repair only' });
    const res = await api('get', '/opportunities', refurb);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ title: 'Lenovo ThinkPad T450', hasOffered: false });
    expect(res.body.data[0].location).toBeUndefined(); // BR-08
  });
  it('is closed to visitors, other roles and unverified refurbishers (BR-01)', async () => {
    expect((await api('get', '/opportunities')).status).toBe(401);
    expect((await api('get', '/opportunities', owner)).status).toBe(403);
    const pending = await makeRefurbisher('Pending Co', 'pending');
    const res = await api('get', '/opportunities', pending);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_VERIFIED');
  });
  it('flags devices I already made an offer on and hides locked ones', async () => {
    const a = await makeReusable({ title: 'First' });
    await makeReusable({ title: 'Second' });
    await offer(a);
    const items = (await api('get', '/opportunities', refurb)).body.data;
    expect(items.find((i) => i.title === 'First').hasOffered).toBe(true);
    const id = (await RefurbishmentJob.findOne())._id;
    await decide(id);
    expect((await api('get', '/opportunities', refurb2)).body.data.map((i) => i.title)).toEqual(['Second']);
  });
  it('filters by search text and category', async () => {
    await makeReusable({ title: 'Lenovo ThinkPad' });
    await makeListing(owner, cats.smartphone, { preferredService: 'refurbishment', title: 'Old phone' });
    expect((await api('get', '/opportunities?q=lenovo', refurb)).body.data).toHaveLength(1);
    expect((await api('get', '/opportunities?category=smartphone', refurb)).body.data.map((i) => i.title)).toEqual(['Old phone']);
  });
});

describe('POST /offers', () => {
  it('creates an offer the owner is told about', async () => {
    const listing = await makeReusable();
    const res = await offer(listing);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'offered', viewerRole: 'refurbisher', offer: { amount: 1500, status: 'pending' } });
    expect(res.body.data.actions).toEqual(['withdraw']);
    expect(res.body.data.listing.location).toBeUndefined(); // BR-08: no exact address before acceptance
  });
  it('validates the body and the device', async () => {
    const listing = await makeReusable();
    expect((await api('post', '/offers', refurb, { listingId: String(listing._id), amount: -5 })).status).toBe(422);
    expect((await api('post', '/offers', refurb, { listingId: String(listing._id), extra: 1 })).status).toBe(422);
    const repairOnly = await makeListing(owner, cats.laptop, { preferredService: 'repair' });
    expect((await offer(repairOnly)).body.code).toBe('LISTING_NOT_FOR_REFURBISHMENT');
    expect((await api('post', '/offers', refurb, { listingId: '0'.repeat(24) })).status).toBe(404);
  });
  it('allows one active offer per refurbisher but not on your own device', async () => {
    const listing = await makeReusable();
    await offer(listing);
    expect((await offer(listing)).body.code).toBe('ALREADY_OFFERED');
    expect((await offer(listing, refurb2)).status).toBe(201);
    const mine = await makeListing(refurb, cats.laptop, { preferredService: 'refurbishment' });
    expect((await offer(mine)).body.code).toBe('OWN_LISTING');
  });
  it('lets a refurbisher offer again after withdrawing', async () => {
    const listing = await makeReusable();
    const id = (await offer(listing)).body.data._id;
    const out = await api('delete', `/jobs/${id}/offer`, refurb);
    expect(out.status).toBe(200);
    expect(out.body.data).toMatchObject({ status: 'cancelled', offer: { status: 'withdrawn' } });
    expect((await offer(listing)).status).toBe(201);
  });
});

describe('the owner decides', () => {
  it('accepting locks the device and turns the other offers down', async () => {
    const listing = await makeReusable();
    const a = (await offer(listing)).body.data._id;
    const b = (await offer(listing, refurb2)).body.data._id;
    const res = await decide(a);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('accepted');
    const l = await DeviceListing.findById(listing._id);
    expect(l.status).toBe('in_service');
    expect(String(l.lockedBy.refId)).toBe(a);
    const other = await RefurbishmentJob.findById(b);
    expect(other).toMatchObject({ status: 'cancelled', offer: { status: 'rejected' } });
  });
  it('declining ends only that offer', async () => {
    const listing = await makeReusable();
    const id = (await offer(listing)).body.data._id;
    const res = await decide(id, owner, 'reject');
    expect(res.body.data).toMatchObject({ status: 'cancelled', offer: { status: 'rejected' } });
    expect((await DeviceListing.findById(listing._id)).status).toBe('listed');
  });
  it('is the owner only, and a decided offer cannot be decided again', async () => {
    const listing = await makeReusable();
    const id = (await offer(listing)).body.data._id;
    expect((await decide(id, refurb)).status).toBe(403);
    expect((await decide(id, refurb2)).status).toBe(404); // strangers cannot probe ids
    await decide(id);
    expect((await decide(id)).body.code).toBe('INVALID_TRANSITION');
  });
  it('refuses when the device was taken meanwhile', async () => {
    const listing = await makeReusable();
    const id = (await offer(listing)).body.data._id;
    await DeviceListing.updateOne({ _id: listing._id }, { $set: { status: 'withdrawn' } });
    expect((await decide(id)).body.code).toBe('LISTING_UNAVAILABLE');
  });
});

describe('jobs: reading', () => {
  it('shows each person their own jobs and hides others (404)', async () => {
    const listing = await makeReusable();
    const id = (await offer(listing)).body.data._id;
    expect((await api('get', '/jobs?as=owner', owner)).body.data).toHaveLength(1);
    expect((await api('get', '/jobs', refurb)).body.data).toHaveLength(1); // default for a refurbisher
    expect((await api('get', '/jobs', refurb2)).body.data).toHaveLength(0);
    expect((await api('get', `/jobs/${id}`, refurb2)).status).toBe(404);
    expect((await api('get', `/jobs/${id}`, owner)).body.data.viewerRole).toBe('owner');
    expect((await api('get', `/jobs/${id}`)).status).toBe(401);
  });
  it('shows the exact address to the refurbisher only while the offer is accepted (BR-08)', async () => {
    const j = await accepted();
    expect((await api('get', `/jobs/${j.id}`, refurb)).body.data.listing.location).toBeDefined();
    expect((await api('get', `/jobs/${j.id}`, owner)).body.data.listing.location).toBeDefined();
    await schedule(j.id);
    await confirm(j.id, owner, { acknowledgeChecklist: true });
    await confirm(j.id, refurb);
    expect((await api('get', `/jobs/${j.id}`, refurb)).body.data.listing.location).toBeUndefined();
  });
});

describe('handover', () => {
  it('needs a future time, and the collection must be arranged before confirming', async () => {
    const j = await accepted();
    expect((await confirm(j.id, owner, { acknowledgeChecklist: true })).body.code).toBe('NO_HANDOVER');
    expect((await schedule(j.id, owner, { date: inDays(-1) })).status).toBe(422);
    const res = await schedule(j.id, refurb);
    expect(res.status).toBe(200);
    expect(res.body.data.pickup).toMatchObject({ timeSlot: '10:00-12:00', status: 'confirmed' });
    expect(await PickupSchedule.countDocuments({ contextType: 'offer' })).toBe(1);
  });
  it('can be rescheduled until someone confirms, then no longer', async () => {
    const j = await accepted();
    await schedule(j.id);
    expect((await schedule(j.id, refurb, { date: inDays(5) })).status).toBe(200);
    expect((await PickupSchedule.findOne()).rescheduleCount).toBe(1);
    const first = await confirm(j.id, owner, { acknowledgeChecklist: true });
    expect(first.body.data.actions).not.toContain('schedule_handover');
    expect((await schedule(j.id)).body.code).toBe('HANDOVER_IN_PROGRESS');
  });
  it('requires the owner to acknowledge the data-protection checklist (BR-12)', async () => {
    const j = await accepted();
    await schedule(j.id);
    expect((await confirm(j.id, owner, {})).status).toBe(422);
    expect((await confirm(j.id, refurb)).status).toBe(200); // the refurbisher has no checklist
  });
  it('collects when both sides confirm, and records the agreed price as an offline payment', async () => {
    const j = await collected();
    const job = await RefurbishmentJob.findById(j.id);
    expect(job.status).toBe('collected');
    const txn = await Transaction.findOne({ refType: 'RefurbishmentJob', refId: j.id });
    expect(txn).toMatchObject({ type: 'refurb_purchase', amount: 1500, status: 'recorded', method: 'offline' });
    expect(String(txn.payer)).toBe(refurb.id);
    expect(String(txn.payee)).toBe(owner.id);
    const history = (await request(app).get('/api/transactions').set(authHeader(owner))).body.data[0];
    expect(history.subject).toMatchObject({ kind: 'refurbishment', title: 'Lenovo ThinkPad T450', link: `/dashboard/refurbishment/${j.id}` });
    expect((await PickupSchedule.findOne()).status).toBe('collected');
    expect((await DeviceListing.findById(j.listing._id)).status).toBe('in_service'); // still locked until the product is listed
  });
  it('records no payment for a free collection', async () => {
    const listing = await makeReusable();
    const id = (await offer(listing, refurb, { amount: 0 })).body.data._id;
    await decide(id);
    await schedule(id);
    await confirm(id, owner, { acknowledgeChecklist: true });
    await confirm(id, refurb);
    expect(await Transaction.countDocuments()).toBe(0);
  });
});

describe('refurbishment work', () => {
  it('moves one step at a time and keeps a work log', async () => {
    const j = await collected();
    expect((await step(j.id, 'in_progress')).body.code).toBe('INVALID_TRANSITION');
    const res = await step(j.id, 'assessment', refurb, 'Battery weak, screen fine');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('assessment');
    expect(res.body.data.workLog[0].text).toBe('Battery weak, screen fine');
    expect(res.body.data.nextStatus).toBe('in_progress');
    expect((await step(j.id, 'in_progress', owner)).status).toBe(403); // the owner cannot move it
  });
  it('takes before and after photos only at the right stage', async () => {
    const j = await collected();
    expect((await photo(j.id, 'after')).body.code).toBe('INVALID_TRANSITION');
    const before = await photo(j.id, 'before');
    expect(before.status).toBe(200);
    expect(before.body.data.beforePhotos).toHaveLength(1);
    await step(j.id, 'assessment');
    await step(j.id, 'in_progress');
    const after = await photo(j.id, 'after');
    expect(after.body.data.afterPhotos).toHaveLength(1);
    expect(after.body.data.photoStages).toEqual(['before', 'after']); // the UI offers only what the server allows
    expect((await photo(j.id, 'before', owner)).status).toBe(403);
  });
  it('rejects a non-image upload', async () => {
    const j = await collected();
    const res = await request(app).post(`/api/refurbishment/jobs/${j.id}/photos`).set(authHeader(refurb)).field('stage', 'before')
      .attach('photos', Buffer.from('not an image'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });
  it('will not be ready to list without both a before and an after photo', async () => {
    const j = await collected();
    await step(j.id, 'assessment');
    await step(j.id, 'in_progress');
    await step(j.id, 'testing');
    const none = await step(j.id, 'ready_to_list');
    expect(none.status).toBe(422);
    // "before" photos are only taken up to the repair stage, so a missing one must be added while the work is still open
    expect((await photo(j.id, 'before')).status).toBe(409);
    await RefurbishmentJob.updateOne({ _id: j.id }, { $set: { status: 'in_progress' } });
    expect((await photo(j.id, 'before')).status).toBe(200);
    expect((await photo(j.id, 'after')).status).toBe(200);
    await step(j.id, 'testing');
    const res = await step(j.id, 'ready_to_list');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('ready_to_list');
    expect(res.body.data.actions).toContain('list_product');
    expect(res.body.data.history.map((h) => h.status)).toEqual(['offered', 'accepted', 'collected', 'assessment', 'in_progress', 'testing', 'testing', 'ready_to_list']); // testing twice: the test stepped back to add a photo
  });
});

describe('cancelling', () => {
  it('lets either side cancel an accepted job before the handover and frees the device', async () => {
    const j = await accepted();
    await schedule(j.id);
    const res = await api('post', `/jobs/${j.id}/cancel`, refurb, { reason: 'Cannot collect' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'cancelled', cancelReason: 'Cannot collect' });
    const l = await DeviceListing.findById(j.listing._id);
    expect(l.status).toBe('listed');
    expect(l.lockedBy?.refId).toBeUndefined();
    expect((await PickupSchedule.findOne()).status).toBe('cancelled');
  });
  it('is not possible once the handover has started, or once the device is collected', async () => {
    const j = await accepted();
    await schedule(j.id);
    await confirm(j.id, owner, { acknowledgeChecklist: true });
    expect((await api('post', `/jobs/${j.id}/cancel`, owner, {})).body.code).toBe('HANDOVER_IN_PROGRESS');
    await confirm(j.id, refurb);
    expect((await api('post', `/jobs/${j.id}/cancel`, owner, {})).body.code).toBe('INVALID_TRANSITION');
  });
  it('is not possible for strangers', async () => {
    const j = await accepted();
    expect((await api('post', `/jobs/${j.id}/cancel`, refurb2, {})).status).toBe(404);
  });
});

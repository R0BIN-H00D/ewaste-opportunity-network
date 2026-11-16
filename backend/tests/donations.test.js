'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const Donation = require('../src/models/Donation');
const DonationRequest = require('../src/models/DonationRequest');
const DeviceListing = require('../src/models/DeviceListing');
const UserProfile = require('../src/models/UserProfile');
const Transaction = require('../src/models/Transaction');
const EnvironmentalImpact = require('../src/models/EnvironmentalImpact');
const PickupSchedule = require('../src/models/PickupSchedule');
const workflow = require('../src/services/workflow/donation');

const app = createApp();
let cats; let donor; let school; let college;

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString();
const api = (method, url, user, body) => {
  const r = request(app)[method](`/api/donations${url}`);
  if (user) r.set(authHeader(user));
  return body === undefined ? r : r.send(body);
};

async function makeOrg(name, status = 'approved') {
  const u = await makeUser('user', { name: `${name} Admin` });
  await UserProfile.create({ user: u.id, orgProfile: { isOrg: true, orgType: 'school', orgName: name, registrationNo: 'REG-1234', recipientVerification: { status } } });
  return u;
}
async function makeDonation(owner = donor, extra = {}, body = {}) {
  const listing = await makeListing(owner, cats.laptop, { preferredService: 'donation', condition: 'fully_working', title: 'Dell Latitude', ...extra });
  const res = await api('post', '', owner, { listingId: String(listing._id), description: 'Works well', ...body });
  return { listing, id: res.body.data?._id, res };
}
const ask = (id, user, body = {}) => api('post', `/${id}/request`, user, { justification: 'Our computer lab needs devices for students.', ...body });
const decide = (id, rid, user, decision = 'accept') => api('put', `/${id}/requests/${rid}/decision`, user, { decision });
const reqIdOf = async (id, user) => String((await DonationRequest.findOne({ donation: id, requester: user.id }))._id);

/** Walks a donation to "accepted" with `school` as the recipient. */
async function accepted() {
  const d = await makeDonation();
  await ask(d.id, school);
  await decide(d.id, await reqIdOf(d.id, school), donor);
  return d;
}
const schedule = (id, user, extra = {}) => api('post', `/${id}/handover`, user, { date: inDays(3), timeSlot: '10:00-12:00', ...extra });

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  donor = await makeUser('user', { name: 'Asha Rao' });
  school = await makeOrg('Sunrise School');
  college = await makeOrg('Hillview College');
});

describe('workflow rules', () => {
  it('allows the intended path and nothing else', () => {
    expect(workflow.canTransition('open', 'requested', 'system')).toBe(true);
    expect(workflow.canTransition('requested', 'accepted', 'donor')).toBe(true);
    expect(workflow.canTransition('requested', 'accepted', 'recipient')).toBe(false);
    expect(workflow.canTransition('open', 'accepted', 'donor')).toBe(false);
    expect(workflow.canTransition('accepted', 'handover_scheduled', 'recipient')).toBe(true);
    expect(workflow.canTransition('handover_scheduled', 'completed', 'donor')).toBe(false);
    expect(workflow.canTransition('completed', 'cancelled', 'donor')).toBe(false);
    expect(workflow.canTransition('handover_scheduled', 'cancelled', 'donor')).toBe(true);
  });
  it('offers actions by role and stage', () => {
    expect(workflow.availableActions({ status: 'requested' }, 'donor')).toEqual(['decide', 'cancel']);
    expect(workflow.availableActions({ status: 'open' }, 'visitor', { canRequest: true })).toEqual(['request']);
    expect(workflow.availableActions({ status: 'open' }, 'visitor', { canRequest: false })).toEqual([]);
    expect(workflow.availableActions({ status: 'handover_scheduled' }, 'recipient', { confirmedByMe: true })).toEqual(['schedule_handover']);
  });
});

describe('recipient organisations', () => {
  it('lets a general user apply, then waits for an administrator', async () => {
    const u = await makeUser('user');
    const res = await request(app).put('/api/donations/recipient').set(authHeader(u)).send({ orgType: 'ngo', orgName: 'Green Hands', registrationNo: 'NGO-778' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ isOrg: true, orgName: 'Green Hands', status: 'pending' });
    const status = await request(app).get('/api/donations/recipient').set(authHeader(u));
    expect(status.body.data.status).toBe('pending');
  });
  it('rejects bad input and other roles, and tells verified organisations they are done', async () => {
    const u = await makeUser('user');
    expect((await request(app).put('/api/donations/recipient').set(authHeader(u)).send({ orgType: 'ngo' })).status).toBe(422);
    const tech = await makeUser('technician');
    expect((await request(app).put('/api/donations/recipient').set(authHeader(tech)).send({ orgType: 'ngo', orgName: 'X Y', registrationNo: 'ABC' })).status).toBe(403);
    const again = await request(app).put('/api/donations/recipient').set(authHeader(school)).send({ orgType: 'school', orgName: 'Sunrise School', registrationNo: 'REG-1234' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_VERIFIED');
  });
  it('requires sign-in', async () => {
    expect((await request(app).get('/api/donations/recipient')).status).toBe(401);
  });
});

describe('POST /api/donations', () => {
  it('requires authentication', async () => {
    expect((await request(app).post('/api/donations').send({})).status).toBe(401);
  });
  it('offers a device and locks the listing (BR-03)', async () => {
    const { listing, res } = await makeDonation();
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'open', viewerRole: 'donor', description: 'Works well' });
    expect(res.body.data.actions).toEqual(['cancel']);
    const l = await DeviceListing.findById(listing._id);
    expect(l.status).toBe('in_service');
    expect(l.lockedBy.kind).toBe('donation');
  });
  it('only accepts listings marked for donation, and not spare parts', async () => {
    const repair = await makeListing(donor, cats.laptop);
    const res = await api('post', '', donor, { listingId: String(repair._id) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LISTING_NOT_FOR_DONATION');
    const parts = await makeListing(donor, cats.laptop, { preferredService: 'donation', condition: 'for_spare_parts' });
    const res2 = await api('post', '', donor, { listingId: String(parts._id) });
    expect(res2.status).toBe(409);
    expect(res2.body.code).toBe('NOT_DONATABLE');
  });
  it('hides other people\'s listings and refuses a second offer', async () => {
    const { listing } = await makeDonation();
    const stranger = await makeUser('user');
    expect((await api('post', '', stranger, { listingId: String(listing._id) })).status).toBe(404);
    const again = await api('post', '', donor, { listingId: String(listing._id) });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('LISTING_UNAVAILABLE');
  });
});

describe('browsing and detail', () => {
  it('lists open donations publicly without exact location or the donor\'s full name', async () => {
    await makeDonation();
    const res = await api('get', '');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    const item = res.body.data[0];
    expect(item.listing.location).toBeUndefined();
    expect(item.donor.name).toBe('Asha R.');
    expect(item.pendingRequests).toBeUndefined();
    expect(item.listing.addressArea).toBe('Indiranagar');
  });
  it('filters by text, condition and category', async () => {
    await makeDonation(donor, { title: 'Dell Latitude', condition: 'fully_working' });
    await makeDonation(donor, { title: 'Nokia phone', condition: 'minor_damage', category: cats.smartphone._id });
    expect((await api('get', '?condition=minor_damage')).body.data).toHaveLength(1);
    expect((await api('get', '?category=smartphone')).body.data).toHaveLength(1);
    expect((await api('get', '?q=Latitude')).body.data).toHaveLength(1);
    expect((await api('get', '?category=nothing')).body.data).toHaveLength(0);
  });
  it('shows later stages only to the people involved', async () => {
    const d = await accepted();
    expect((await api('get', '')).body.data).toHaveLength(0);
    expect((await api('get', `/${d.id}`)).status).toBe(404);
    expect((await api('get', `/${d.id}`, college)).status).toBe(404);
    expect((await api('get', `/${d.id}`, donor)).status).toBe(200);
    expect((await api('get', `/${d.id}`, school)).status).toBe(200);
  });
  it('gives the donor the request list and strangers none', async () => {
    const d = await makeDonation();
    await ask(d.id, school);
    const asDonor = await api('get', `/${d.id}`, donor);
    expect(asDonor.body.data.requests).toHaveLength(1);
    expect(asDonor.body.data.requests[0].requester).toMatchObject({ orgName: 'Sunrise School' });
    expect(asDonor.body.data.listing.location).toBeDefined();
    const asVisitor = await api('get', `/${d.id}`);
    expect(asVisitor.body.data.requests).toBeUndefined();
    expect(asVisitor.body.data.listing.location).toBeUndefined();
  });
  it('lists my donations and the donations I asked for', async () => {
    const mine = await makeDonation();
    await makeDonation(await makeUser('user'));
    await ask(mine.id, school);
    expect((await api('get', '?as=donor', null)).status).toBe(401);
    const asDonor = await api('get', '?as=donor', donor);
    expect(asDonor.body.data).toHaveLength(1);
    expect(asDonor.body.data[0].pendingRequests).toBe(1);
    const asRecipient = await api('get', '?as=recipient', school);
    expect(asRecipient.body.data).toHaveLength(1);
    expect(asRecipient.body.data[0].myRequest.status).toBe('pending');
    expect((await api('get', '?as=recipient', college)).body.data).toHaveLength(0);
  });
});

describe('requests from recipients', () => {
  it('needs a verified organisation', async () => {
    const d = await makeDonation();
    const plain = await makeUser('user');
    const pending = await makeOrg('Pending Trust', 'pending');
    const tech = await makeUser('technician');
    for (const u of [plain, pending, tech]) {
      const res = await ask(d.id, u);
      expect(res.status).toBe(403);
    }
    expect((await ask(d.id, plain)).body.code).toBe('NOT_VERIFIED');
    expect((await ask(d.id, null)).status).toBe(401);
  });
  it('records the request and moves the donation to "requested"', async () => {
    const d = await makeDonation();
    const res = await ask(d.id, school, { intendedUse: 'Lab computers' });
    expect(res.status).toBe(201);
    expect(res.body.data.myRequest).toMatchObject({ status: 'pending', intendedUse: 'Lab computers' });
    expect((await Donation.findById(d.id)).status).toBe('requested');
  });
  it('refuses duplicates, short justifications and the donor\'s own donation', async () => {
    const d = await makeDonation();
    await ask(d.id, school);
    const dup = await ask(d.id, school);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('ALREADY_REQUESTED');
    expect((await ask(d.id, college, { justification: 'short' })).status).toBe(422);
    const own = await makeOrg('Own Org');
    const ownDonation = await makeDonation(own);
    expect((await ask(ownDonation.id, own)).status).toBe(403);
  });
  it('reopens the donation when the only request is withdrawn, and allows asking again', async () => {
    const d = await makeDonation();
    await ask(d.id, school);
    const res = await api('delete', `/${d.id}/request`, school);
    expect(res.status).toBe(200);
    expect((await Donation.findById(d.id)).status).toBe('open');
    expect((await api('delete', `/${d.id}/request`, school)).status).toBe(404);
    const again = await ask(d.id, school);
    expect(again.status).toBe(201);
    expect((await Donation.findById(d.id)).status).toBe('requested');
  });
});

describe('donor decision (FR-DON-004)', () => {
  it('accepts one recipient and rejects every other pending request', async () => {
    const d = await makeDonation();
    await ask(d.id, school);
    await ask(d.id, college);
    const res = await decide(d.id, await reqIdOf(d.id, school), donor);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('accepted');
    expect(res.body.data.recipient).toMatchObject({ orgName: 'Sunrise School' });
    expect((await DonationRequest.findOne({ donation: d.id, requester: school.id })).status).toBe('accepted');
    expect((await DonationRequest.findOne({ donation: d.id, requester: college.id })).status).toBe('rejected');
    expect(String((await Donation.findById(d.id)).acceptedRequest)).toBe(await reqIdOf(d.id, school));
  });
  it('lets only the donor decide, and only once', async () => {
    const d = await makeDonation();
    await ask(d.id, school);
    const rid = await reqIdOf(d.id, school);
    expect((await decide(d.id, rid, school)).status).toBe(404);
    expect((await decide(d.id, rid, college)).status).toBe(404);
    expect((await decide(d.id, rid, donor)).status).toBe(200);
    const twice = await decide(d.id, rid, donor);
    expect(twice.status).toBe(409);
  });
  it('reopens the donation when the last pending request is rejected', async () => {
    const d = await makeDonation();
    await ask(d.id, school);
    const res = await decide(d.id, await reqIdOf(d.id, school), donor, 'reject');
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('open');
    expect((await DonationRequest.findOne({ donation: d.id })).status).toBe('rejected');
  });
  it('shows the exact location only to the accepted recipient', async () => {
    const d = await accepted();
    const asRecipient = await api('get', `/${d.id}`, school);
    expect(asRecipient.body.data.viewerRole).toBe('recipient');
    expect(asRecipient.body.data.listing.location).toBeDefined();
    expect((await api('get', `/${d.id}`, college)).status).toBe(404);
  });
});

describe('handover', () => {
  it('can be scheduled by either side once a recipient is chosen', async () => {
    const d = await accepted();
    const res = await schedule(d.id, school, { notes: 'Bring ID' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('handover_scheduled');
    expect(res.body.data.pickup).toMatchObject({ timeSlot: '10:00-12:00', notes: 'Bring ID', status: 'confirmed' });
    expect(await PickupSchedule.countDocuments({ contextType: 'donation', contextId: d.id })).toBe(1);
  });
  it('needs a future date, an accepted recipient and a participant', async () => {
    const early = await makeDonation();
    expect((await schedule(early.id, donor)).status).toBe(409);
    const d = await accepted();
    expect((await schedule(d.id, donor, { date: new Date(Date.now() - 3600000).toISOString() })).status).toBe(422);
    expect((await schedule(d.id, college)).status).toBe(404);
  });
  it('can be rescheduled up to three times', async () => {
    const d = await accepted();
    await schedule(d.id, donor);
    for (let i = 0; i < 3; i += 1) expect((await schedule(d.id, donor, { date: inDays(4 + i) })).status).toBe(200);
    const res = await schedule(d.id, donor, { date: inDays(9) });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RESCHEDULE_LIMIT');
  });
});

describe('confirming the handover (FR-DON-006)', () => {
  it('needs a scheduled handover and the data-protection checklist from the donor (BR-12)', async () => {
    const d = await accepted();
    expect((await api('post', `/${d.id}/confirm-handover`, school, {})).status).toBe(409);
    await schedule(d.id, donor);
    const noTick = await api('post', `/${d.id}/confirm-handover`, donor, {});
    expect(noTick.status).toBe(422);
    expect((await api('post', `/${d.id}/confirm-handover`, college, {})).status).toBe(404);
  });
  it('completes when both sides confirm: reference, listing, zero-value record and verified impact', async () => {
    const d = await accepted();
    await schedule(d.id, donor);
    const first = await api('post', `/${d.id}/confirm-handover`, donor, { acknowledgeChecklist: true });
    expect(first.body.data.status).toBe('handover_scheduled');
    expect(first.body.data.confirmations).toMatchObject({ donor: true, recipient: false, checklistAcknowledged: true });
    expect(first.body.data.actions).not.toContain('schedule_handover'); // no reschedule once the handover has started
    expect(first.body.data.actions).not.toContain('confirm_handover');
    expect((await schedule(d.id, donor)).body.code).toBe('HANDOVER_IN_PROGRESS');
    expect(await EnvironmentalImpact.countDocuments()).toBe(0); // not verified yet (BR-05)

    const again = await api('post', `/${d.id}/confirm-handover`, donor, { acknowledgeChecklist: true });
    expect(again.status).toBe(200); // idempotent
    const done = await api('post', `/${d.id}/confirm-handover`, school, {});
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('completed');
    expect(done.body.data.confirmation.refNo).toMatch(/^DON-\d{4}-[0-9A-F]{6}$/);
    expect(done.body.data.actions).toEqual(['view_confirmation']);
    expect(done.body.data.listing.location).toBeUndefined(); // BR-08: address closes at completion for the recipient

    expect((await DeviceListing.findById(d.listing._id)).status).toBe('completed');
    const txn = await Transaction.findOne({ refType: 'Donation', refId: d.id });
    expect(txn).toMatchObject({ type: 'donation', amount: 0, status: 'confirmed' });
    expect(String(txn.payee)).toBe(donor.id);
    expect(String(txn.payer)).toBe(school.id);
    const impact = await EnvironmentalImpact.find();
    expect(impact).toHaveLength(1);
    expect(impact[0]).toMatchObject({ type: 'donation', refType: 'Donation' });
    expect(String(impact[0].user)).toBe(donor.id);
  });
  it('appears in both people\'s transaction history with a link', async () => {
    const d = await accepted();
    await schedule(d.id, donor);
    await api('post', `/${d.id}/confirm-handover`, donor, { acknowledgeChecklist: true });
    await api('post', `/${d.id}/confirm-handover`, school, {});
    const res = await request(app).get('/api/transactions').set(authHeader(school));
    expect(res.body.data[0].subject).toMatchObject({ kind: 'donation', title: 'Dell Latitude', link: `/dashboard/donations/${d.id}` });
    expect(res.body.data[0]).toMatchObject({ amount: 0, direction: 'paid' });
    expect((await request(app).get('/api/transactions').set(authHeader(donor))).body.data[0].direction).toBe('received');
    // a free donation is not a payment, so it stays out of the money totals
    const sum = (await request(app).get('/api/transactions/summary').set(authHeader(school))).body.data;
    expect(sum.paid).toEqual({ count: 0, total: 0 });
    expect((await request(app).get('/api/transactions/summary').set(authHeader(donor))).body.data.received).toEqual({ count: 0, total: 0 });
  });
  it('issues the confirmation document only after completion, only to participants', async () => {
    const d = await accepted();
    await schedule(d.id, donor);
    const early = await api('get', `/${d.id}/confirmation`, donor);
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('NOT_COMPLETED');
    await api('post', `/${d.id}/confirm-handover`, donor, { acknowledgeChecklist: true });
    await api('post', `/${d.id}/confirm-handover`, school, {});
    const doc = await api('get', `/${d.id}/confirmation`, school);
    expect(doc.status).toBe(200);
    expect(doc.body.data).toMatchObject({
      device: { title: 'Dell Latitude', condition: 'fully_working', category: 'Laptop' },
      recipient: { orgName: 'Sunrise School', orgType: 'school' },
    });
    expect(doc.body.data.refNo).toMatch(/^DON-/);
    expect((await api('get', `/${d.id}/confirmation`, donor)).status).toBe(200);
    expect((await api('get', `/${d.id}/confirmation`, college)).status).toBe(404);
    expect((await api('get', `/${d.id}/confirmation`, null)).status).toBe(401);
  });
});

describe('cancelling', () => {
  it('frees the listing and rejects open requests', async () => {
    const d = await accepted();
    await schedule(d.id, donor);
    const res = await api('post', `/${d.id}/cancel`, donor, { reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    const l = await DeviceListing.findById(d.listing._id);
    expect(l.status).toBe('listed');
    expect(l.lockedBy?.refId).toBeUndefined();
    expect((await DonationRequest.findOne({ donation: d.id })).status).toBe('rejected');
    expect((await PickupSchedule.findOne({ contextId: d.id })).status).toBe('cancelled');
  });
  it('is for the donor only, and not after completion', async () => {
    const d = await accepted();
    expect((await api('post', `/${d.id}/cancel`, school, {})).status).toBe(403);
    expect((await api('post', `/${d.id}/cancel`, college, {})).status).toBe(404);
    await schedule(d.id, donor);
    await api('post', `/${d.id}/confirm-handover`, donor, { acknowledgeChecklist: true });
    await api('post', `/${d.id}/confirm-handover`, school, {});
    const res = await api('post', `/${d.id}/cancel`, donor, {});
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_TRANSITION');
  });
  it('also works through PUT /:id/status', async () => {
    const d = await makeDonation();
    expect((await api('put', `/${d.id}/status`, donor, { status: 'completed' })).status).toBe(422);
    const res = await api('put', `/${d.id}/status`, donor, { status: 'cancelled', reason: 'Gone' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.cancelReason).toBe('Gone');
  });
});

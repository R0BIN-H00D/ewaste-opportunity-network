'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { PNG, makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const DeviceListing = require('../src/models/DeviceListing');
const Transaction = require('../src/models/Transaction');
const EnvironmentalImpact = require('../src/models/EnvironmentalImpact');
const TechnicianProfile = require('../src/models/TechnicianProfile');
const PickupSchedule = require('../src/models/PickupSchedule');
const Notification = require('../src/models/Notification');

const app = createApp();
let owner; let tech; let cats; let listing;
const tomorrow = () => new Date(Date.now() + 24 * 3600 * 1000).toISOString();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  owner = await makeUser('user');
  tech = await makeTechnician();
  listing = await makeListing(owner, cats.laptop);
});

const api = {
  create: (user, body) => request(app).post('/api/service-requests').set(authHeader(user)).send(body),
  get: (user, id) => request(app).get(`/api/service-requests/${id}`).set(authHeader(user)),
  list: (user, query) => request(app).get('/api/service-requests').query(query || {}).set(authHeader(user)),
  status: (user, id, status, note) => request(app).put(`/api/service-requests/${id}/status`).set(authHeader(user)).send({ status, ...(note ? { note } : {}) }),
  post: (user, id, path, body = {}) => request(app).post(`/api/service-requests/${id}/${path}`).set(authHeader(user)).send(body),
  decide: (user, id, qid, body) => request(app).put(`/api/service-requests/${id}/quotation/${qid}/decision`).set(authHeader(user)).send(body),
  complete: (user, id, withPhoto = true) => {
    let r = request(app).put(`/api/service-requests/${id}/status`).set(authHeader(user)).field('status', 'repair_completed').field('note', 'Replaced the screen');
    if (withPhoto) r = r.attach('photos', PNG, { filename: 'done.png', contentType: 'image/png' });
    return r;
  },
};

const createTargeted = async (over = {}) => {
  const res = await api.create(owner, { listingId: String(listing._id), technicianId: tech.id, issueDescription: 'Screen is cracked', ...over });
  expect(res.status).toBe(201);
  return res.body.data._id;
};

/** Moves a targeted request up to "diagnosis in progress". */
async function toDiagnosis() {
  const id = await createTargeted();
  expect((await api.status(tech, id, 'technician_assigned')).status).toBe(200);
  expect((await api.post(owner, id, 'pickup', { date: tomorrow(), timeSlot: '10:00-12:00' })).status).toBe(200);
  expect((await api.post(tech, id, 'handover')).status).toBe(200);
  expect((await api.post(owner, id, 'handover', { acknowledgeChecklist: true })).status).toBe(200);
  expect((await api.status(tech, id, 'diagnosis_in_progress')).status).toBe(200);
  return id;
}

async function toRepair() {
  const id = await toDiagnosis();
  const q = await api.post(tech, id, 'quotation', { amount: 800, breakdown: [{ label: 'Screen', amount: 600 }, { label: 'Labour', amount: 200 }], etaDays: 3, validUntil: new Date(Date.now() + 7 * 86400000).toISOString() });
  expect(q.status).toBe(201);
  const qid = q.body.data.activeQuotation._id;
  expect((await api.decide(owner, id, qid, { decision: 'accept' })).status).toBe(200);
  return { id, qid };
}

describe('creating a request', () => {
  it('sends a targeted request and locks the listing', async () => {
    const res = await api.create(owner, { listingId: String(listing._id), technicianId: tech.id, issueDescription: 'Screen is cracked' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('request_submitted');
    expect(res.body.data.mode).toBe('targeted');
    expect(res.body.data.viewerRole).toBe('customer');
    expect(res.body.data.actions).toContain('cancel');
    const l = await DeviceListing.findById(listing._id);
    expect(l.status).toBe('in_service');
    expect(String(l.lockedBy.refId)).toBe(res.body.data._id);
  });

  it('refuses a second active request on the same listing (BR-03)', async () => {
    await createTargeted();
    const res = await api.create(owner, { listingId: String(listing._id), issueDescription: 'Again please' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LISTING_UNAVAILABLE');
  });

  it('refuses a listing that is not meant for repair', async () => {
    const donation = await makeListing(owner, cats.laptop, { preferredService: 'donation' });
    const res = await api.create(owner, { listingId: String(donation._id), issueDescription: 'Fix it' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LISTING_NOT_FOR_REPAIR');
  });

  it("does not let someone request a repair on another person's listing", async () => {
    const stranger = await makeUser('user');
    const res = await api.create(stranger, { listingId: String(listing._id), issueDescription: 'Mine now' });
    expect(res.status).toBe(404);
  });

  it('rejects a technician who cannot take the device', async () => {
    const unverified = await makeTechnician({ profile: { verification: { status: 'pending' } } });
    const res = await api.create(owner, { listingId: String(listing._id), technicianId: unverified.id, issueDescription: 'Screen is cracked' });
    expect(res.status).toBe(422);
    expect((await DeviceListing.findById(listing._id)).status).toBe('listed');
  });

  it('validates the body', async () => {
    expect((await api.create(owner, { listingId: String(listing._id) })).status).toBe(422);
    expect((await api.create(owner, { listingId: 'bad', issueDescription: 'abc' })).status).toBe(422);
    expect((await request(app).post('/api/service-requests').send({})).status).toBe(401);
  });
});

describe('repair workflow (happy path, FR-SVC)', () => {
  it('runs from request to confirmed completion and records impact once', async () => {
    const { id, qid } = await toRepair();
    let r = (await api.get(owner, id)).body.data;
    expect(r.status).toBe('repair_in_progress');
    expect(r.handover.collect).toEqual({ owner: true, provider: true, checklistAcknowledged: true });

    expect((await request(app).post(`/api/service-requests/${id}/progress`).set(authHeader(tech)).field('note', 'Screen ordered').attach('photos', PNG, { filename: 'p.png', contentType: 'image/png' })).status).toBe(200);
    expect((await api.complete(tech, id)).status).toBe(200);
    expect((await api.status(tech, id, 'device_delivery_pending')).status).toBe(200);
    expect((await api.post(tech, id, 'handover')).status).toBe(200);
    expect((await api.post(owner, id, 'handover')).status).toBe(200);
    r = (await api.get(owner, id)).body.data;
    expect(r.status).toBe('device_delivered');
    expect(r.actions).toContain('confirm_completion');
    expect(r.progressPhotos).toHaveLength(1);
    expect(r.completionPhotos).toHaveLength(1);

    const done = await api.post(owner, id, 'confirm-completion');
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('service_completed');
    expect(done.body.data.actions).toContain('review');

    const txs = await Transaction.find({ refId: id });
    expect(txs).toHaveLength(1);
    expect(txs[0]).toMatchObject({ type: 'repair', amount: 800, method: 'offline', status: 'recorded' });
    expect(await EnvironmentalImpact.countDocuments({ refId: id, type: 'repair' })).toBe(1);
    // Verified by the customer: the customer earns 50 Green Score points and the technician 30, once.
    const GreenScoreLedger = require('../src/models/GreenScoreLedger');
    expect((await GreenScoreLedger.find({ eventRef: new RegExp(`^repair:${id}`) }).lean()).map((l) => [String(l.user), l.points]).sort()).toEqual([[owner.id, 50], [tech.id, 30]].sort());
    const profile = await TechnicianProfile.findOne({ user: tech.id });
    expect(profile.completedJobs).toBe(1);
    expect(profile.earningsTotal).toBe(800);
    expect((await DeviceListing.findById(listing._id)).status).toBe('completed');

    // confirming twice must not double count
    expect((await api.post(owner, id, 'confirm-completion')).status).toBe(409);
    expect(await EnvironmentalImpact.countDocuments({ refId: id })).toBe(1);
    expect(await GreenScoreLedger.countDocuments({ eventRef: new RegExp(`^repair:${id}`) })).toBe(2);
    expect((await TechnicianProfile.findOne({ user: tech.id })).completedJobs).toBe(1);
    const q = (await api.get(owner, id)).body.data;
    expect(String(q.activeQuotation._id)).toBe(qid);
    expect(q.statusHistory.map((h) => h.status)).toEqual(expect.arrayContaining(['request_submitted', 'technician_assigned', 'device_collected', 'quotation_submitted', 'customer_approval_pending', 'repair_in_progress', 'repair_completed', 'service_completed']));
  });

  it('keeps each progress update together with its own photos', async () => {
    const { id } = await toRepair();
    const progress = () => request(app).post(`/api/service-requests/${id}/progress`).set(authHeader(tech));
    expect((await progress().field('note', 'Screen ordered').attach('photos', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(200);
    expect((await progress().field('note', 'Screen fitted, testing')).status).toBe(200);

    const r = (await api.get(owner, id)).body.data;
    expect(r.progressUpdates.map((u) => [u.text, u.photos.length])).toEqual([['Screen ordered', 1], ['Screen fitted, testing', 0]]);
    expect(r.progressPhotos).toHaveLength(1); // the flat lists stay for older clients
    expect(r.repairNotes.map((n) => n.text)).toEqual(['Screen ordered', 'Screen fitted, testing']);
  });

  it('starting delivery can say when the device comes back, and the owner sees it', async () => {
    const { id } = await toRepair();
    expect((await api.complete(tech, id)).status).toBe(200);
    const send = (body) => request(app).put(`/api/service-requests/${id}/status`).set(authHeader(tech)).send({ status: 'device_delivery_pending', ...body });

    const past = await send({ returnDate: new Date(Date.now() - 3600 * 1000).toISOString() });
    expect(past.status).toBe(422);
    expect((await send({ returnSlot: 'Evening' })).status).toBe(422); // a slot needs a date

    const when = tomorrow();
    const ok = await send({ returnDate: when, returnSlot: '17:00-19:00' });
    expect(ok.status).toBe(200);
    const seen = (await api.get(owner, id)).body.data;
    expect(seen.status).toBe('device_delivery_pending');
    expect(seen.returnSchedule).toEqual({ date: when, timeSlot: '17:00-19:00' });
  });

  it('starting delivery without a return time still works, and other moves cannot set one', async () => {
    const { id } = await toRepair();
    const early = await request(app).put(`/api/service-requests/${id}/status`).set(authHeader(tech)).send({ status: 'repair_completed', returnDate: tomorrow() });
    expect(early.status).toBe(422);
    expect((await api.complete(tech, id)).status).toBe(200);
    expect((await api.status(tech, id, 'device_delivery_pending')).status).toBe(200);
    expect((await api.get(owner, id)).body.data.returnSchedule).toBeNull();
  });

  it('skips pickup and delivery for an on-site repair', async () => {
    const id = await createTargeted({ onSite: true });
    expect((await api.status(tech, id, 'technician_assigned')).status).toBe(200);
    expect((await api.post(owner, id, 'pickup', { date: tomorrow() })).status).toBe(409);
    expect((await api.status(tech, id, 'diagnosis_in_progress')).status).toBe(200);
    const q = await api.post(tech, id, 'quotation', { amount: 300 });
    expect((await api.decide(owner, id, q.body.data.activeQuotation._id, { decision: 'accept' })).status).toBe(200);
    expect((await api.complete(tech, id)).status).toBe(200);
    const done = await api.post(owner, id, 'confirm-completion');
    expect(done.status).toBe(200);
    expect(done.body.data.status).toBe('service_completed');
  });
});

describe('rules that must hold', () => {
  it('BR-02: no repair work or completion without an approved quotation', async () => {
    const id = await toDiagnosis();
    expect((await api.complete(tech, id)).status).toBe(409);
    expect((await api.status(tech, id, 'repair_completed')).status).toBe(409);
    const q = await api.post(tech, id, 'quotation', { amount: 500 });
    expect((await api.get(owner, id)).body.data.status).toBe('customer_approval_pending');
    expect((await api.complete(tech, id)).status).toBe(409);
    expect(q.status).toBe(201);
  });

  it('rejects illegal transitions and wrong actors', async () => {
    const id = await createTargeted();
    expect((await api.status(tech, id, 'service_completed')).status).toBe(409);
    expect((await api.status(tech, id, 'repair_in_progress')).status).toBe(409);
    expect((await api.post(owner, id, 'confirm-completion')).status).toBe(409);
    expect((await api.post(tech, id, 'quotation', { amount: 5 })).status).toBe(409);
    expect((await api.status(owner, id, 'technician_assigned')).status).toBe(403); // customers cannot accept their own job
  });

  it('only the customer may approve a quotation, and a quotation must add up', async () => {
    const id = await toDiagnosis();
    const bad = await api.post(tech, id, 'quotation', { amount: 900, breakdown: [{ label: 'Screen', amount: 600 }] });
    expect(bad.status).toBe(422);
    const past = await api.post(tech, id, 'quotation', { amount: 100, validUntil: new Date(Date.now() - 1000).toISOString() });
    expect(past.status).toBe(422);
    const q = await api.post(tech, id, 'quotation', { amount: 600 });
    const qid = q.body.data.activeQuotation._id;
    expect((await api.decide(tech, id, qid, { decision: 'accept' })).status).toBe(403);
    expect((await api.decide(owner, id, qid, { decision: 'reject' })).status).toBe(422); // reason required
    const rej = await api.decide(owner, id, qid, { decision: 'reject', reason: 'Too expensive' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.status).toBe('diagnosis_in_progress');
    // a new, versioned quotation supersedes the rejected one
    const q2 = await api.post(tech, id, 'quotation', { amount: 450 });
    expect(q2.status).toBe(201);
    const all = (await request(app).get(`/api/service-requests/${id}/quotations`).set(authHeader(owner))).body.data;
    expect(all.map((x) => x.version)).toEqual([2, 1]);
    expect(all[1].status).toBe('rejected');
    expect((await api.decide(owner, id, qid, { decision: 'accept' })).status).toBe(409);
  });

  it('writes the quote into the history and the notification as people read amounts', async () => {
    const id = await toDiagnosis();
    await api.post(tech, id, 'quotation', { amount: 125000 });
    let notes = (await api.get(owner, id)).body.data.statusHistory.map((h) => h.note);
    expect(notes).toContain('₹1,25,000 quote');
    const sent = await Notification.findOne({ user: owner.id, type: 'quotation.new' }).sort({ createdAt: -1 }).lean();
    expect(sent.body).toBe('₹1,25,000. Nothing starts until you approve it.');

    const qid = (await api.get(owner, id)).body.data.activeQuotation._id;
    await api.decide(owner, id, qid, { decision: 'reject', reason: 'Too expensive' });
    await api.post(tech, id, 'quotation', { amount: 2499.5 });
    notes = (await api.get(owner, id)).body.data.statusHistory.map((h) => h.note);
    expect(notes).toContain('Revised quote: ₹2,499.5');
  });

  it('requires the data-protection checklist before the owner hands the device over', async () => {
    const id = await createTargeted();
    await api.status(tech, id, 'technician_assigned');
    await api.post(owner, id, 'pickup', { date: tomorrow() });
    const res = await api.post(owner, id, 'handover', {});
    expect(res.status).toBe(422);
    await api.post(tech, id, 'handover');
    expect((await api.get(owner, id)).body.data.status).toBe('device_collection_pending');
    await api.post(owner, id, 'handover', { acknowledgeChecklist: true });
    expect((await api.get(owner, id)).body.data.status).toBe('device_collected');
  });

  it('limits reschedules to 3 and blocks changes close to the slot', async () => {
    const id = await createTargeted();
    await api.status(tech, id, 'technician_assigned');
    expect((await api.post(owner, id, 'pickup', { date: tomorrow() })).status).toBe(200);
    expect((await api.post(owner, id, 'pickup', { date: new Date(Date.now() - 1000).toISOString() })).status).toBe(422);
    for (let i = 0; i < 3; i += 1) expect((await api.post(owner, id, 'pickup', { date: tomorrow() })).status).toBe(200);
    const res = await api.post(owner, id, 'pickup', { date: tomorrow() });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('RESCHEDULE_LIMIT');
    const p = await PickupSchedule.findOne({ contextId: id });
    p.rescheduleCount = 0;
    p.date = new Date(Date.now() + 3600 * 1000);
    await p.save();
    expect((await api.post(owner, id, 'pickup', { date: tomorrow() })).body.code).toBe('RESCHEDULE_TOO_LATE');
  });

  it('cancelling after the technician has the device asks them to return it', async () => {
    const id = await toDiagnosis(); // both handovers confirmed, device with the technician
    expect((await api.post(owner, id, 'cancel', { reason: 'Changed my mind' })).status).toBe(200);
    const sent = await Notification.findOne({ user: tech.id, type: 'request.cancelled' }).lean();
    expect(sent.body).toBe('Changed my mind You still have the device. Please arrange to return it to the owner.');

    // the cancel released the listing, so it can be requested again; cancelling before pickup sends no return note
    const early = await createTargeted();
    await Notification.deleteMany({});
    expect((await api.post(owner, early, 'cancel')).status).toBe(200);
    const plain = await Notification.findOne({ user: tech.id, type: 'request.cancelled' }).lean();
    expect(plain.body).toBeUndefined();
  });

  it('cancelling releases the listing so it can be requested again', async () => {
    const id = await createTargeted();
    const res = await api.post(owner, id, 'cancel', { reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('cancelled');
    expect((await DeviceListing.findById(listing._id)).status).toBe('listed');
    expect((await api.create(owner, { listingId: String(listing._id), issueDescription: 'Retry' })).status).toBe(201);
  });

  it('a technician can decline a targeted request, which releases the listing', async () => {
    const id = await createTargeted();
    expect((await api.status(tech, id, 'rejected')).status).toBe(422); // reason required
    expect((await api.status(tech, id, 'rejected', 'Too busy')).status).toBe(200);
    expect((await DeviceListing.findById(listing._id)).status).toBe('listed');
  });
});

describe('access control', () => {
  it('hides requests from strangers and other technicians (404)', async () => {
    const id = await createTargeted();
    const stranger = await makeUser('user');
    const otherTech = await makeTechnician();
    expect((await api.get(stranger, id)).status).toBe(404);
    expect((await api.get(otherTech, id)).status).toBe(404);
    expect((await api.post(stranger, id, 'cancel')).status).toBe(404);
    expect((await api.get(owner, id)).status).toBe(200);
    expect((await api.get(tech, id)).status).toBe(200);
  });

  it('keeps the exact address private until the technician accepts (BR-08)', async () => {
    const id = await createTargeted();
    const before = (await api.get(tech, id)).body.data;
    expect(before.listing.location).toBeUndefined();
    await api.status(tech, id, 'technician_assigned');
    const after = (await api.get(tech, id)).body.data;
    expect(after.listing.location).toBeDefined();
    expect((await api.get(owner, id)).body.data.listing.location).toBeDefined();
  });

  it('blocks a technician who is not verified (BR-01)', async () => {
    const pending = await makeTechnician({ profile: { verification: { status: 'pending' } } });
    const id = (await api.create(owner, { listingId: String(listing._id), issueDescription: 'Open job' })).body.data._id;
    const res = await api.status(pending, id, 'technician_assigned');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_VERIFIED');
  });

  it('lists my requests and the open board for eligible technicians only', async () => {
    const id = (await api.create(owner, { listingId: String(listing._id), issueDescription: 'Open job' })).body.data._id;
    const mine = await api.list(owner, { as: 'customer' });
    expect(mine.body.data.map((r) => r._id)).toEqual([id]);
    const board = await api.list(tech, { as: 'board' });
    expect(board.status).toBe(200);
    expect(board.body.data.map((r) => r._id)).toEqual([id]);
    expect(board.body.data[0].listing.location).toBeUndefined();
    const farAway = await makeTechnician({ profile: { serviceLocation: { type: 'Point', coordinates: [80.27, 13.08] }, serviceRadiusKm: 10 } });
    expect((await api.list(farAway, { as: 'board' })).body.data).toHaveLength(0);
    expect((await api.list(owner, { as: 'board' })).status).toBe(403);
  });

  it('lets only one technician claim an open request', async () => {
    const second = await makeTechnician();
    const id = (await api.create(owner, { listingId: String(listing._id), issueDescription: 'Open job' })).body.data._id;
    const [a, b] = await Promise.all([api.status(tech, id, 'technician_assigned'), api.status(second, id, 'technician_assigned')]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const final = (await api.get(owner, id)).body.data;
    expect([tech.id, second.id]).toContain(String(final.technician._id));
  });
});

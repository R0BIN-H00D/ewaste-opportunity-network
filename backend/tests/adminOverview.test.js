'use strict';
require('./helpers/env');
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const UserProfile = require('../src/models/UserProfile');
const RecyclingCenter = require('../src/models/RecyclingCenter');
const ServiceRequest = require('../src/models/ServiceRequest');
const Donation = require('../src/models/Donation');
const DonationRequest = require('../src/models/DonationRequest');
const RefurbishmentJob = require('../src/models/RefurbishmentJob');
const RecyclingRecord = require('../src/models/RecyclingRecord');
const Transaction = require('../src/models/Transaction');
const Report = require('../src/models/Report');
const Complaint = require('../src/models/Complaint');
const audit = require('../src/services/auditService');

const app = createApp();
let admin;
let cats;

const get = (url, who) => request(app).get(url).set(authHeader(who));
const oid = () => new mongoose.Types.ObjectId();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  admin = await makeUser('admin', { name: 'Chief Admin' });
  cats = await seedCategories();
});

describe('overview and monitor guards', () => {
  const ROUTES = ['/api/admin/dashboard', '/api/admin/monitors/repairs', '/api/admin/monitors/transactions'];

  it.each(ROUTES)('%s needs a login', async (url) => {
    expect((await request(app).get(url)).status).toBe(401);
  });

  it.each(['user', 'technician', 'student', 'refurbisher', 'recycler'])('is closed to a %s', async (role) => {
    const u = await makeUser(role);
    for (const url of ROUTES) {
      const res = await get(url, u);
      expect([url, res.status]).toEqual([url, 403]);
    }
  });
});

describe('GET /api/admin/dashboard', () => {
  it('is all zeros on an empty platform and does not count the administrator', async () => {
    const res = await get('/api/admin/dashboard', admin);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.people).toMatchObject({ total: 0, active: 0, suspended: 0, newThisMonth: 0 });
    expect(d.people.byRole).toEqual({ user: 0, technician: 0, student: 0, refurbisher: 0, recycler: 0 });
    expect(d.listings.total).toBe(0);
    expect(d.services).toMatchObject({ completed: 0, repairs: { total: 0, open: 0, completed: 0 } });
    expect(d.attention).toMatchObject({ openReports: 0, openComplaints: 0, pendingVerifications: { total: 0 } });
    expect(d.recentActivity).toEqual([]);
  });

  it('counts people by role and state, leaving out deleted accounts', async () => {
    await makeUser('user');
    await makeUser('user', { status: 'suspended' });
    await makeUser('user', { status: 'deleted' });
    await makeUser('student');
    await makeUser('refurbisher', { status: 'pending_verification' });
    await makeTechnician();
    const d = (await get('/api/admin/dashboard', admin)).body.data;
    expect(d.people.total).toBe(5);
    expect(d.people.active).toBe(3);
    expect(d.people.suspended).toBe(1);
    expect(d.people.waitingForVerification).toBe(1);
    expect(d.people.newThisMonth).toBe(5);
    expect(d.people.byRole).toEqual({ user: 2, technician: 1, student: 1, refurbisher: 1, recycler: 0 });
  });

  it('counts listings and separates recycling centres from their authorisation', async () => {
    const owner = await makeUser('user');
    await makeListing(owner, Object.values(cats)[0]);
    await makeListing(owner, Object.values(cats)[0], { status: 'in_service' });
    await makeListing(owner, Object.values(cats)[0], { status: 'withdrawn' });
    const r1 = await makeUser('recycler');
    const r2 = await makeUser('recycler');
    await RecyclingCenter.create({ user: r1.id, name: 'GreenCycle', verification: { status: 'approved' } });
    await RecyclingCenter.create({ user: r2.id, name: 'Waiting Centre', verification: { status: 'pending' } });
    const d = (await get('/api/admin/dashboard', admin)).body.data;
    expect(d.listings).toMatchObject({ total: 3, listed: 1, inService: 1 });
    expect(d.listings.byStatus.withdrawn).toBe(1);
    expect(d.centres).toEqual({ total: 2, authorised: 1 });
  });

  it('counts each flow as total, open, completed and stopped, and adds up completed services', async () => {
    const owner = await makeUser('user');
    const l = await makeListing(owner, Object.values(cats)[0]);
    const tech = await makeTechnician();
    await ServiceRequest.create({ listing: l._id, customer: owner.id, technician: tech.id, status: 'service_completed' });
    await ServiceRequest.create({ listing: l._id, customer: owner.id, status: 'request_submitted' });
    await ServiceRequest.create({ listing: l._id, customer: owner.id, status: 'cancelled' });
    await Donation.create({ listing: l._id, donor: owner.id, status: 'completed' });
    await Donation.create({ listing: l._id, donor: owner.id, status: 'open' });
    const refurbisher = await makeUser('refurbisher');
    await RefurbishmentJob.create({ listing: l._id, owner: owner.id, refurbisher: refurbisher.id, status: 'listed' });
    await RefurbishmentJob.create({ listing: l._id, owner: owner.id, refurbisher: refurbisher.id, status: 'in_progress' });
    const rec = await makeUser('recycler');
    const centre = await RecyclingCenter.create({ user: rec.id, name: 'GreenCycle' });
    await RecyclingRecord.create({ requester: owner.id, center: centre._id, status: 'completed' });
    await RecyclingRecord.create({ requester: owner.id, center: centre._id, status: 'rejected' });

    const s = (await get('/api/admin/dashboard', admin)).body.data.services;
    expect(s.repairs).toEqual({ total: 3, open: 1, completed: 1, stopped: 1 });
    expect(s.donations).toEqual({ total: 2, open: 1, completed: 1, stopped: 0 });
    expect(s.refurbishment).toEqual({ total: 2, open: 1, completed: 1, stopped: 0 });
    expect(s.recycling).toEqual({ total: 2, open: 0, completed: 1, stopped: 1 });
    expect(s.completed).toBe(4);
  });

  it('shows what needs attention: waiting verifications of both kinds, open reports and unresolved complaints', async () => {
    await makeTechnician({ profile: { verification: { status: 'pending' } } });
    await makeTechnician({ profile: { verification: { status: 'approved' } } });
    const school = await makeUser('user');
    await UserProfile.create({ user: school.id, orgProfile: { isOrg: true, orgName: 'Sunrise School', recipientVerification: { status: 'pending' } } });
    const reporter = await makeUser('user');
    await Report.create({ reporter: reporter.id, targetType: 'listing', targetId: oid(), reason: 'spam' });
    await Report.create({ reporter: reporter.id, targetType: 'listing', targetId: oid(), reason: 'spam', status: 'dismissed' });
    await Complaint.create({ filedBy: reporter.id, subject: 'No show', description: 'The technician did not come', status: 'open' });
    await Complaint.create({ filedBy: reporter.id, subject: 'Late', description: 'Two hours late', status: 'in_review' });
    await Complaint.create({ filedBy: reporter.id, subject: 'Fixed', description: 'Sorted out', status: 'resolved' });

    const a = (await get('/api/admin/dashboard', admin)).body.data.attention;
    expect(a.pendingVerifications).toEqual({ providers: 1, recipients: 1, total: 2 });
    expect(a.openReports).toBe(1);
    expect(a.openComplaints).toBe(2);
  });

  it('lists the latest administrator actions, newest first, with who did them', async () => {
    const target = await makeUser('user');
    for (let i = 0; i < 10; i += 1) {
      await audit.record(admin, i === 9 ? 'user.reactivated' : 'user.suspended', { targetType: 'User', targetId: target.id, reason: `reason ${i}` });
    }
    const d = (await get('/api/admin/dashboard', admin)).body.data;
    expect(d.recentActivity).toHaveLength(8);
    expect(d.recentActivity[0]).toMatchObject({ action: 'user.reactivated', admin: { name: 'Chief Admin' }, targetType: 'User' });
  });
});

describe('GET /api/admin/monitors/:kind', () => {
  let owner;
  let listing;
  beforeEach(async () => {
    owner = await makeUser('user', { name: 'Asha Rao' });
    listing = await makeListing(owner, Object.values(cats)[0], { title: 'Dell monitor' });
  });

  it('answers 404 for an unknown list', async () => {
    expect((await get('/api/admin/monitors/payroll', admin)).status).toBe(404);
  });

  it('repairs: shows the device, the customer and the technician, newest first, and no address', async () => {
    const tech = await makeTechnician({ user: { name: 'Meera Nair' } });
    await ServiceRequest.create({ listing: listing._id, customer: owner.id, status: 'request_submitted' });
    await new Promise((r) => setTimeout(r, 5));
    await ServiceRequest.create({ listing: listing._id, customer: owner.id, technician: tech.id, status: 'repair_in_progress' });
    const res = await get('/api/admin/monitors/repairs', admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ kind: 'repairs', status: 'repair_in_progress', title: 'Dell monitor' });
    expect(res.body.data[0].parties.map((p) => `${p.role}:${p.name}`)).toEqual(['Customer:Asha Rao', 'Technician:Meera Nair']);
    expect(res.body.data[0].reference).toMatch(/^REQ-[0-9A-F]{6}$/);
    expect(res.body.data[1].parties).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 2, page: 1 });
    expect(JSON.stringify(res.body)).not.toMatch(/Indiranagar|coordinates|pickupAddress/);
  });

  it('donations: names the donor and the accepted recipient and uses the confirmation number', async () => {
    const school = await makeUser('user', { name: 'Sunrise School' });
    const don = await Donation.create({ listing: listing._id, donor: owner.id, status: 'completed', confirmation: { refNo: 'DON-2026-ABC123' } });
    const dr = await DonationRequest.create({ donation: don._id, requester: school.id, justification: 'For the computer lab' });
    await Donation.updateOne({ _id: don._id }, { acceptedRequest: dr._id });
    const res = await get('/api/admin/monitors/donations', admin);
    expect(res.body.data[0]).toMatchObject({ reference: 'DON-2026-ABC123', status: 'completed', title: 'Dell monitor' });
    expect(res.body.data[0].parties.map((p) => `${p.role}:${p.name}`)).toEqual(['Donor:Asha Rao', 'Recipient:Sunrise School']);
  });

  it('refurbishment: shows both sides and the offer', async () => {
    const refurbisher = await makeUser('refurbisher', { name: 'FixIt Works' });
    await RefurbishmentJob.create({ listing: listing._id, owner: owner.id, refurbisher: refurbisher.id, status: 'accepted', offer: { amount: 1500, status: 'accepted' } });
    const row = (await get('/api/admin/monitors/refurbishment', admin)).body.data[0];
    expect(row).toMatchObject({ status: 'accepted', amount: 1500 });
    expect(row.parties.map((p) => p.name)).toEqual(['Asha Rao', 'FixIt Works']);
  });

  it('recycling: shows the request number, device count and centre, never the pickup address', async () => {
    const rec = await makeUser('recycler');
    const centre = await RecyclingCenter.create({ user: rec.id, name: 'GreenCycle Recyclers' });
    await RecyclingRecord.create({ requester: owner.id, center: centre._id, deviceCount: 3, refNo: 'REC-2026-7788AF', pickupAddress: '12 Secret Street', status: 'pickup_scheduled' });
    const res = await get('/api/admin/monitors/recycling', admin);
    expect(res.body.data[0]).toMatchObject({ reference: 'REC-2026-7788AF', title: '3 devices', status: 'pickup_scheduled' });
    expect(res.body.data[0].parties.map((p) => p.name)).toEqual(['Asha Rao', 'GreenCycle Recyclers']);
    expect(JSON.stringify(res.body)).not.toContain('Secret Street');
  });

  it('transactions: shows payer, payee, amount and method', async () => {
    const tech = await makeTechnician({ user: { name: 'Meera Nair' } });
    await Transaction.create({ type: 'repair', refType: 'ServiceRequest', refId: oid(), payer: owner.id, payee: tech.id, amount: 1200, method: 'cod', reference: 'UPI-5521', status: 'confirmed' });
    const row = (await get('/api/admin/monitors/transactions', admin)).body.data[0];
    expect(row).toMatchObject({ title: 'Repair', amount: 1200, method: 'cod', reference: 'UPI-5521', status: 'confirmed' });
    expect(row.parties.map((p) => `${p.role}:${p.name}`)).toEqual(['Payer:Asha Rao', 'Payee:Meera Nair']);
  });

  it('shows a removed person as "Removed account" instead of failing', async () => {
    await ServiceRequest.create({ listing: listing._id, customer: oid(), status: 'request_submitted' });
    const res = await get('/api/admin/monitors/repairs', admin);
    expect(res.status).toBe(200);
    expect(res.body.data[0].parties[0].name).toBe('Removed account');
  });

  it('filters by status, and the status counts still show the whole picture', async () => {
    await ServiceRequest.create({ listing: listing._id, customer: owner.id, status: 'request_submitted' });
    await ServiceRequest.create({ listing: listing._id, customer: owner.id, status: 'cancelled' });
    await ServiceRequest.create({ listing: listing._id, customer: owner.id, status: 'cancelled' });
    const res = await get('/api/admin/monitors/repairs?status=cancelled', admin);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.meta.byStatus).toMatchObject({ request_submitted: 1, cancelled: 2, service_completed: 0 });
    expect(res.body.meta.statuses).toContain('repair_in_progress');
  });

  it('refuses a status that belongs to another list (422) and an unknown query field', async () => {
    const res = await get('/api/admin/monitors/repairs?status=handover_scheduled', admin);
    expect(res.status).toBe(422);
    expect(res.body.errors[0].field).toBe('status');
    expect((await get('/api/admin/monitors/repairs?sort=name', admin)).status).toBe(422);
  });

  it('filters by whole days, the end day included, and refuses a bad or inverted range', async () => {
    const old = await ServiceRequest.create({ listing: listing._id, customer: owner.id });
    await ServiceRequest.collection.updateOne({ _id: old._id }, { $set: { createdAt: new Date('2026-01-10T20:00:00.000Z') } });
    await ServiceRequest.create({ listing: listing._id, customer: owner.id });
    const only = await get('/api/admin/monitors/repairs?from=2026-01-10&to=2026-01-10', admin);
    expect(only.body.data).toHaveLength(1);
    expect(only.body.meta.byStatus.request_submitted).toBe(1);
    expect((await get('/api/admin/monitors/repairs?from=2026-02-01&to=2026-01-01', admin)).status).toBe(422);
    expect((await get('/api/admin/monitors/repairs?from=yesterday', admin)).status).toBe(422);
    expect((await get('/api/admin/monitors/repairs?from=2026-13-45', admin)).status).toBe(422);
  });

  it('pages the results', async () => {
    for (let i = 0; i < 5; i += 1) {
      await ServiceRequest.create({ listing: listing._id, customer: owner.id });
    }
    const res = await get('/api/admin/monitors/repairs?limit=2&page=3', admin);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 5, pages: 3, page: 3, limit: 2 });
  });
});

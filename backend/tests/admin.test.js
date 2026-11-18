'use strict';
require('./helpers/env');
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { PNG, makeUser, authHeader } = require('./helpers/factories');
const { signup, login, PASSWORD } = require('./helpers/auth');
const User = require('../src/models/User');
const UserProfile = require('../src/models/UserProfile');
const TechnicianProfile = require('../src/models/TechnicianProfile');
const VerificationDocument = require('../src/models/VerificationDocument');
const Notification = require('../src/models/Notification');
const AdminLog = require('../src/models/AdminLog');

const app = createApp();
let admin;

const as = (method, url, who, body) => {
  const r = request(app)[method](url);
  if (who) r.set(who.auth || authHeader(who));
  return body === undefined ? r : r.send(body);
};
const oid = () => String(new mongoose.Types.ObjectId());
const upload = (u, docType = 'id_proof') => request(app).post('/api/verification/documents').set(u.auth).field('docType', docType).attach('documents', PNG, { filename: 'id.png', contentType: 'image/png' });
const logs = (action) => AdminLog.find(action ? { action } : {}).sort({ createdAt: 1 }).lean();
const setOrg = (user, status = 'pending', extra = {}) => UserProfile.findOneAndUpdate(
  { user: user.id },
  { $set: { 'orgProfile.isOrg': true, 'orgProfile.orgName': 'Sunrise School', 'orgProfile.orgType': 'school', 'orgProfile.registrationNo': 'REG-77', 'orgProfile.recipientVerification': { status }, ...extra } },
  { upsert: true, new: true },
);

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  admin = await makeUser('admin', { name: 'Chief Admin' });
});

describe('the admin guard', () => {
  const ROUTES = [
    ['get', '/api/admin/users'],
    ['get', `/api/admin/users/${oid()}`],
    ['put', `/api/admin/users/${oid()}/status`],
    ['get', '/api/admin/verifications'],
    ['get', `/api/admin/verifications/${oid()}`],
    ['put', `/api/admin/verifications/${oid()}`],
    ['get', `/api/admin/verifications/documents/${oid()}/file`],
  ];

  it.each(ROUTES)('%s %s needs a login', async (method, url) => {
    expect((await as(method, url, null, method === 'put' ? {} : undefined)).status).toBe(401);
  });

  it.each(['user', 'technician', 'refurbisher', 'recycler'])('is closed to a %s on every admin route', async (role) => {
    const u = await makeUser(role);
    for (const [method, url] of ROUTES) {
      const res = await as(method, url, u, method === 'put' ? {} : undefined);
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }
  });
});

describe('users', () => {
  it('lists people with their verification state, newest first, without deleted accounts', async () => {
    const tech = await signup(app, { role: 'technician', name: 'Meera Nair' });
    await signup(app, { role: 'user', name: 'Asha Rao' });
    await makeUser('user', { name: 'Gone Person', status: 'deleted' });
    const res = await as('get', '/api/admin/users', admin);
    expect(res.status).toBe(200);
    const names = res.body.data.map((u) => u.name);
    expect(names).toContain('Meera Nair');
    expect(names).not.toContain('Gone Person');
    const meera = res.body.data.find((u) => u._id === tech.id);
    expect(meera).toMatchObject({ role: 'technician', status: 'pending_verification', verificationStatus: 'not_submitted' });
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenHash/);
    expect(res.body.meta.total).toBe(res.body.data.length);
  });

  it('filters by role and status, searches name or email and treats the search as text', async () => {
    await signup(app, { role: 'technician', name: 'Meera Nair', email: 'meera.n@test.local' });
    await signup(app, { role: 'user', name: 'Asha Rao', email: 'asha.r@test.local' });
    await makeUser('user', { name: 'Parked', status: 'suspended' });

    expect((await as('get', '/api/admin/users?role=technician', admin)).body.data.map((u) => u.name)).toEqual(['Meera Nair']);
    expect((await as('get', '/api/admin/users?status=suspended', admin)).body.data.map((u) => u.name)).toEqual(['Parked']);
    expect((await as('get', '/api/admin/users?q=meera.n', admin)).body.data).toHaveLength(1);
    expect((await as('get', '/api/admin/users?q=ASHA', admin)).body.data[0].email).toBe('asha.r@test.local');
    expect((await as('get', '/api/admin/users?q=.*', admin)).body.data).toHaveLength(0);
    expect((await as('get', '/api/admin/users?status=deleted', admin)).body.data).toEqual([]);
  });

  it('pages and checks its query', async () => {
    for (let i = 0; i < 3; i += 1) await makeUser('user');
    const res = await as('get', '/api/admin/users?limit=2&page=2', admin);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 2, total: 4, pages: 2 });
    expect(res.body.data).toHaveLength(2);
    expect((await as('get', '/api/admin/users?role=wizard', admin)).status).toBe(422);
    expect((await as('get', '/api/admin/users?foo=1', admin)).status).toBe(422);
  });

  it('shows one person with their organisation and the admin history', async () => {
    const u = await makeUser('user', { name: 'Org Owner' });
    await setOrg(u, 'approved');
    await as('put', `/api/admin/users/${u.id}/status`, admin, { status: 'suspended', reason: 'Spam listings' });
    const res = await as('get', `/api/admin/users/${u.id}`, admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Org Owner', status: 'suspended', suspension: { reason: 'Spam listings' } });
    expect(res.body.data.organisation).toMatchObject({ name: 'Sunrise School', recipientStatus: 'approved' });
    expect(res.body.data.actions).toEqual(['reactivate']);
    expect((await as('get', `/api/admin/users/${admin.id}`, admin)).body.data.actions).toEqual([]);
    expect((await as('get', `/api/admin/users/${(await makeUser('user')).id}`, admin)).body.data.actions).toEqual(['suspend']);
    expect(res.body.data.history[0]).toMatchObject({ action: 'user.suspended', reason: 'Spam listings', admin: { name: 'Chief Admin' } });
    expect((await as('get', `/api/admin/users/${oid()}`, admin)).status).toBe(404);
    expect((await as('get', '/api/admin/users/not-an-id', admin)).status).toBe(404);
  });

  describe('suspending and reactivating (BR-09)', () => {
    it('needs a reason, then ends the person\'s access at once and tells them', async () => {
      const u = await signup(app, { role: 'user' });
      const url = `/api/admin/users/${u.id}/status`;
      expect((await as('put', url, admin, { status: 'suspended' })).status).toBe(422);
      expect((await as('put', url, admin, { status: 'suspended', reason: 'no' })).status).toBe(422);
      expect((await as('put', url, admin, { status: 'deleted', reason: 'Not offered' })).status).toBe(422);

      const res = await as('put', url, admin, { status: 'suspended', reason: 'Repeated fake listings' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'suspended', suspension: { reason: 'Repeated fake listings' } });

      // The old token stops working at once (session version bumped), before the suspended check is even reached.
      expect((await request(app).get('/api/auth/me').set(u.auth)).status).toBe(401);
      const again = await login(app, u.email, PASSWORD);
      expect(again.status).toBe(403);
      expect(again.body.code).toBe('ACCOUNT_SUSPENDED');

      const note = await Notification.findOne({ user: u.id, type: 'account.suspended' });
      expect(note.body).toBe('Repeated fake listings');
      const [entry] = await logs('user.suspended');
      expect(entry).toMatchObject({ reason: 'Repeated fake listings', targetType: 'user', before: { status: 'active' }, after: { status: 'suspended' } });
      expect(String(entry.targetId)).toBe(u.id);
      expect(String(entry.admin)).toBe(admin.id);
    });

    it('brings a suspended person back and records it', async () => {
      const u = await signup(app, { role: 'user' });
      const url = `/api/admin/users/${u.id}/status`;
      await as('put', url, admin, { status: 'suspended', reason: 'Under review' });
      const res = await as('put', url, admin, { status: 'active' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'active', suspension: null });
      expect((await login(app, u.email, PASSWORD)).status).toBe(200);
      expect(await Notification.countDocuments({ user: u.id, type: 'account.reactivated' })).toBe(1);
      expect(await logs('user.reactivated')).toHaveLength(1);
    });

    it('never turns an unverified provider into an active one (BR-01)', async () => {
      const tech = await signup(app, { role: 'technician' });
      const url = `/api/admin/users/${tech.id}/status`;
      await as('put', url, admin, { status: 'suspended', reason: 'Complaint under review' });
      const res = await as('put', url, admin, { status: 'active' });
      expect(res.body.data.status).toBe('pending_verification');

      const approved = await signup(app, { role: 'technician' });
      await TechnicianProfile.updateOne({ user: approved.id }, { $set: { 'verification.status': 'approved' } });
      await as('put', `/api/admin/users/${approved.id}/status`, admin, { status: 'suspended', reason: 'Complaint under review' });
      expect((await as('put', `/api/admin/users/${approved.id}/status`, admin, { status: 'active' })).body.data.status).toBe('active');
    });

    it('refuses a change that changes nothing, a deleted account, yourself and other administrators', async () => {
      const u = await makeUser('user');
      expect((await as('put', `/api/admin/users/${u.id}/status`, admin, { status: 'active' })).body.code).toBe('NO_CHANGE');
      await as('put', `/api/admin/users/${u.id}/status`, admin, { status: 'suspended', reason: 'Under review' });
      expect((await as('put', `/api/admin/users/${u.id}/status`, admin, { status: 'suspended', reason: 'Again please' })).status).toBe(409);

      const gone = await makeUser('user', { status: 'deleted' });
      expect((await as('put', `/api/admin/users/${gone.id}/status`, admin, { status: 'active' })).status).toBe(409);

      const self = await as('put', `/api/admin/users/${admin.id}/status`, admin, { status: 'suspended', reason: 'Testing myself' });
      expect([self.status, self.body.code]).toEqual([403, 'SELF_ACTION']);
      const other = await makeUser('admin');
      const res = await as('put', `/api/admin/users/${other.id}/status`, admin, { status: 'suspended', reason: 'Another admin' });
      expect([res.status, res.body.code]).toEqual([403, 'ADMIN_PROTECTED']);
      expect((await User.findById(other.id)).status).toBe('active');
      expect((await as('put', `/api/admin/users/${oid()}/status`, admin, { status: 'suspended', reason: 'Not here' })).status).toBe(404);
    });
  });
});

describe('verification queue', () => {
  it('lists waiting providers oldest first with their document counts', async () => {
    const first = await signup(app, { role: 'technician', name: 'First In' });
    await upload(first);
    await upload(first, 'qualification');
    const second = await signup(app, { role: 'recycler', name: 'Second In', organizationName: 'GreenLoop Recyclers' });
    await upload(second, 'authorization');
    await signup(app, { role: 'refurbisher', name: 'Never Submitted', organizationName: 'Never Ltd' });

    const res = await as('get', '/api/admin/verifications', admin);
    expect(res.status).toBe(200);
    expect(res.body.data.map((i) => i.name)).toEqual(['First In', 'Second In']);
    expect(res.body.data[0]).toMatchObject({ userId: first.id, type: 'provider', role: 'technician', status: 'pending', documentCount: 2, email: first.email });
    expect(res.body.meta.total).toBe(2);

    expect((await as('get', '/api/admin/verifications?role=recycler', admin)).body.data.map((i) => i.name)).toEqual(['Second In']);
    expect((await as('get', '/api/admin/verifications?limit=1&page=2', admin)).body.data.map((i) => i.name)).toEqual(['Second In']);
    expect((await as('get', '/api/admin/verifications?status=approved', admin)).body.data).toEqual([]);
    expect((await as('get', '/api/admin/verifications?status=weird', admin)).status).toBe(422);
  });

  it('lists organisations that asked to receive donations', async () => {
    const org = await makeUser('user', { name: 'Sunrise Trust' });
    await setOrg(org);
    const plain = await makeUser('user');
    await setOrg(plain, 'not_submitted', { 'orgProfile.isOrg': false });
    const res = await as('get', '/api/admin/verifications?type=recipient', admin);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ userId: org.id, type: 'recipient', name: 'Sunrise Trust', status: 'pending', organisation: { name: 'Sunrise School', type: 'school', registrationNo: 'REG-77' } });
    expect((await as('get', '/api/admin/verifications', admin)).body.data).toEqual([]);
  });

  it('shows a submission with its documents, the facts to judge by and a link that is not a file path', async () => {
    const tech = await signup(app, { role: 'technician' });
    await TechnicianProfile.updateOne({ user: tech.id }, { $set: { headline: 'Laptop repair', experienceYears: 6, city: 'Pune' } });
    await upload(tech);
    const res = await as('get', `/api/admin/verifications/${tech.id}`, admin);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ type: 'provider', role: 'technician', status: 'pending', actions: ['approve', 'reject', 'request_resubmission'] });
    expect(d.user).toMatchObject({ email: tech.email, status: 'pending_verification' });
    expect(d.facts).toMatchObject({ headline: 'Laptop repair', experienceYears: 6, city: 'Pune' });
    expect(d.documents).toHaveLength(1);
    expect(d.documents[0]).toMatchObject({ docType: 'id_proof', status: 'pending', viewUrl: `/api/admin/verifications/documents/${d.documents[0]._id}/file` });
    expect(JSON.stringify(res.body)).not.toMatch(/publicId|_private/);

    expect((await as('get', `/api/admin/verifications/${oid()}`, admin)).status).toBe(404);
    expect((await as('get', '/api/admin/verifications/not-an-id', admin)).status).toBe(404);
    expect((await as('put', '/api/admin/verifications/not-an-id', admin, { decision: 'approved' })).status).toBe(404);
    expect((await as('get', '/api/admin/verifications/documents/not-an-id/file', admin)).status).toBe(404);
    expect((await as('put', '/api/admin/users/not-an-id/status', admin, { status: 'active' })).status).toBe(404);
    const plain = await makeUser('user');
    expect((await as('get', `/api/admin/verifications/${plain.id}`, admin)).status).toBe(404);
    expect((await as('get', `/api/admin/verifications/${plain.id}?type=recipient`, admin)).status).toBe(404);
  });

  it('opens a private document only for an administrator, never cached, and records that it was looked at', async () => {
    const tech = await signup(app, { role: 'technician' });
    await upload(tech);
    const doc = await VerificationDocument.findOne({ owner: tech.id });
    const url = `/api/admin/verifications/documents/${doc._id}/file`;

    const res = await as('get', url, admin).buffer(true).parse((r, cb) => { const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks))); });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-disposition']).toMatch(/^inline; filename="id\.png"/);
    expect(Buffer.compare(res.body, PNG)).toBe(0);

    const [seen] = await logs('verification.document_viewed');
    expect(String(seen.targetId)).toBe(tech.id);
    expect(seen.after.docType).toBe('id_proof');
    expect((await request(app).get(url).set(tech.auth)).status).toBe(403);
    expect((await as('get', `/api/admin/verifications/documents/${oid()}/file`, admin)).status).toBe(404);
  });

  it('will not serve a path that leaves the private folder, or a file that has gone missing', async () => {
    const tech = await signup(app, { role: 'technician' });
    await upload(tech);
    const doc = await VerificationDocument.findOne({ owner: tech.id });
    const url = `/api/admin/verifications/documents/${doc._id}/file`;

    await VerificationDocument.updateOne({ _id: doc._id }, { $set: { 'file.publicId': 'public/avatars/other.png' } });
    expect((await as('get', url, admin)).status).toBe(404);
    await VerificationDocument.updateOne({ _id: doc._id }, { $set: { 'file.publicId': '_private/../../etc/passwd' } });
    expect((await as('get', url, admin)).status).toBe(404);
    await VerificationDocument.updateOne({ _id: doc._id }, { $set: { 'file.publicId': '_private/verification/nobody/missing.png' } });
    expect((await as('get', url, admin)).status).toBe(404);
  });

  describe('deciding', () => {
    it('approving activates the provider, settles the documents, tells them and is audited — and puts them in discovery', async () => {
      const tech = await signup(app, { role: 'technician', name: 'Meera Nair' });
      await upload(tech);
      expect((await request(app).get('/api/technicians')).body.data.map((t) => t.name || t.user?.name)).not.toContain('Meera Nair');
      expect((await request(app).get(`/api/technicians/${tech.id}`)).status).toBe(404);

      const res = await as('put', `/api/admin/verifications/${tech.id}`, admin, { decision: 'approved' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'approved', actions: [], reviewedBy: { name: 'Chief Admin' } });
      expect(res.body.data.documents[0].status).toBe('approved');
      expect((await User.findById(tech.id)).status).toBe('active');
      expect((await TechnicianProfile.findOne({ user: tech.id })).verification).toMatchObject({ status: 'approved' });
      expect((await request(app).get(`/api/technicians/${tech.id}`)).status).toBe(200);

      const note = await Notification.findOne({ user: tech.id, type: 'verification.approved' });
      expect(note.title).toBe('Your account is verified');
      const [entry] = await logs('verification.approved');
      expect(entry).toMatchObject({ targetType: 'verification', before: { status: 'pending' }, after: { status: 'approved', type: 'provider', role: 'technician' } });
      expect(res.body.data.history[0].action).toBe('verification.approved');
    });

    it('rejecting needs a reason, keeps the account waiting and lets the provider try again', async () => {
      const tech = await signup(app, { role: 'technician' });
      await upload(tech);
      const url = `/api/admin/verifications/${tech.id}`;
      expect((await as('put', url, admin, { decision: 'rejected' })).status).toBe(422);
      expect((await as('put', url, admin, { decision: 'rejected', reason: '   ' })).status).toBe(422);

      const res = await as('put', url, admin, { decision: 'rejected', reason: 'The ID photo is blurred' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ status: 'rejected', reason: 'The ID photo is blurred' });
      expect(res.body.data.documents[0]).toMatchObject({ status: 'rejected', reason: 'The ID photo is blurred' });
      expect((await User.findById(tech.id)).status).toBe('pending_verification');
      expect((await Notification.findOne({ user: tech.id, type: 'verification.rejected' })).body).toBe('The ID photo is blurred');

      const status = await request(app).get('/api/verification/status').set(tech.auth);
      expect(status.body.data).toMatchObject({ status: 'rejected', reason: 'The ID photo is blurred' });
      expect((await upload(tech)).status).toBe(201);
      expect((await as('get', `/api/admin/verifications/${tech.id}`, admin)).body.data.status).toBe('pending');
    });

    it('can ask for new documents instead of refusing', async () => {
      const provider = await signup(app, { role: 'refurbisher', organizationName: 'ReNew Electronics' });
      await upload(provider, 'business');
      const res = await as('put', `/api/admin/verifications/${provider.id}`, admin, { decision: 'resubmission_required', reason: 'Please send the front and back' });
      expect(res.body.data.status).toBe('resubmission_required');
      expect((await Notification.findOne({ user: provider.id, type: 'verification.resubmission_required' })).title).toBe('We need new documents from you');
      expect(await logs('verification.resubmission_required')).toHaveLength(1);
    });

    it('only decides what is waiting', async () => {
      const tech = await signup(app, { role: 'technician' });
      const url = `/api/admin/verifications/${tech.id}`;
      const early = await as('put', url, admin, { decision: 'approved' });
      expect([early.status, early.body.code]).toEqual([409, 'NOT_PENDING']);
      await upload(tech);
      await as('put', url, admin, { decision: 'approved' });
      const twice = await as('put', url, admin, { decision: 'rejected', reason: 'Changed my mind' });
      expect([twice.status, twice.body.code]).toEqual([409, 'NOT_PENDING']);
      expect((await as('put', url, admin, { decision: 'maybe' })).status).toBe(422);
      expect((await as('put', `/api/admin/verifications/${oid()}`, admin, { decision: 'approved' })).status).toBe(404);
    });

    it('approves and refuses a donation recipient organisation without touching the account status', async () => {
      const org = await makeUser('user', { name: 'Sunrise Trust' });
      await setOrg(org);
      const res = await as('put', `/api/admin/verifications/${org.id}`, admin, { type: 'recipient', decision: 'approved' });
      expect(res.status).toBe(200);
      expect(res.body.data).toMatchObject({ type: 'recipient', status: 'approved', documents: [] });
      expect(res.body.data.facts).toMatchObject({ organisationName: 'Sunrise School', registrationNo: 'REG-77' });
      expect((await UserProfile.findOne({ user: org.id })).orgProfile.recipientVerification.status).toBe('approved');
      expect((await Notification.findOne({ user: org.id, type: 'verification.approved' })).title).toBe('Your organisation is verified');

      const other = await makeUser('user');
      await setOrg(other);
      const refused = await as('put', `/api/admin/verifications/${other.id}`, admin, { type: 'recipient', decision: 'rejected', reason: 'Registration number not found' });
      expect(refused.body.data).toMatchObject({ status: 'rejected', reason: 'Registration number not found' });
      expect((await User.findById(other.id)).status).toBe('active');
    });
  });
});

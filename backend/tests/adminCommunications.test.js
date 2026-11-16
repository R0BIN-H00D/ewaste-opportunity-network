'use strict';
require('./helpers/env');
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, authHeader } = require('./helpers/factories');
const Complaint = require('../src/models/Complaint');
const Announcement = require('../src/models/Announcement');
const Notification = require('../src/models/Notification');
const AdminLog = require('../src/models/AdminLog');

const app = createApp();
let admin;
let alice; // files complaints
let bob; // is complained about

const as = (method, url, who, body) => {
  const r = request(app)[method](url);
  if (who) r.set(authHeader(who));
  return body === undefined ? r : r.send(body);
};
const oid = () => new mongoose.Types.ObjectId();
const notes = (user, type) => Notification.find({ user: user.id, type }).lean();
const logs = (action) => AdminLog.find({ action }).lean();
const DAY = 24 * 3600 * 1000;
const iso = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();

const file = (who, over = {}) => as('post', '/api/complaints', who, { subject: 'Device never collected', description: 'The technician said he would come on Monday and did not.', ...over });

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  admin = await makeUser('admin', { name: 'Chief Admin' });
  alice = await makeUser('user', { name: 'Alice Rao' });
  bob = await makeUser('technician', { name: 'Bob Tech' });
});

describe('the admin guard on complaint, announcement and audit routes', () => {
  const ROUTES = [
    ['get', '/api/admin/complaints'],
    ['get', `/api/admin/complaints/${oid()}`],
    ['put', `/api/admin/complaints/${oid()}`],
    ['get', '/api/admin/announcements'],
    ['post', '/api/admin/announcements'],
    ['put', `/api/admin/announcements/${oid()}`],
    ['delete', `/api/admin/announcements/${oid()}`],
    ['get', '/api/admin/audit'],
  ];
  const body = (method) => (method === 'put' || method === 'post' ? {} : undefined);

  it.each(ROUTES)('%s %s needs a login', async (method, url) => {
    expect((await as(method, url, null, body(method))).status).toBe(401);
  });

  it.each(['user', 'technician', 'student', 'refurbisher', 'recycler'])('is closed to a %s on every route', async (role) => {
    const who = await makeUser(role);
    for (const [method, url] of ROUTES) {
      expect((await as(method, url, who, body(method))).status).toBe(403);
    }
  });
});

describe('filing a complaint', () => {
  it('saves it, tells the administrators, and shows the person what they filed', async () => {
    const res = await file(alice, { against: String(bob.id), refType: 'service', refId: String(oid()) });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ subject: 'Device never collected', status: 'open', refType: 'service', against: { name: 'Bob Tech' }, resolution: '' });
    expect(res.body.data.timeline).toHaveLength(1);
    const saved = await Complaint.findById(res.body.data._id).lean();
    expect(String(saved.filedBy)).toBe(alice.id);
    expect(saved.history[0]).toMatchObject({ status: 'open', note: 'Filed' });
    expect(await notes(admin, 'complaint.new')).toHaveLength(1);
  });

  it('works without naming anyone', async () => {
    const res = await file(alice);
    expect(res.status).toBe(201);
    expect(res.body.data.against).toBeNull();
    expect(res.body.data.refType).toBe('other');
  });

  it('is open to every role except administrators, and needs a login', async () => {
    expect((await file(null)).status).toBe(401);
    expect((await file(admin)).status).toBe(403);
    for (const role of ['technician', 'student', 'refurbisher', 'recycler']) {
      expect((await file(await makeUser(role))).status).toBe(201);
    }
  });

  it('checks what was written (422) and refuses fields it does not know', async () => {
    expect((await file(alice, { subject: 'Hi' })).status).toBe(422);
    expect((await file(alice, { description: 'Too short' })).status).toBe(422);
    expect((await file(alice, { refType: 'spaceship' })).status).toBe(422);
    expect((await file(alice, { refId: String(oid()) })).body.errors[0].field).toMatch(/refType$/);
    expect((await file(alice, { against: 'not-an-id' })).status).toBe(422);
    expect((await file(alice, { status: 'resolved' })).status).toBe(422);
  });

  it('will not accept a complaint about yourself, a stranger who does not exist, or an administrator', async () => {
    const self = await file(alice, { against: String(alice.id) });
    expect(self.status).toBe(422);
    expect(self.body.errors[0].field).toBe('against');
    expect((await file(alice, { against: String(oid()) })).status).toBe(422);
    expect((await file(alice, { against: String(admin.id) })).status).toBe(422);
  });

  it('allows five complaints at a time and then asks the person to wait (409)', async () => {
    for (let i = 0; i < 5; i += 1) {
      expect((await file(alice, { subject: `Problem number ${i}` })).status).toBe(201);
    }
    const res = await file(alice, { subject: 'One more problem' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('TOO_MANY_OPEN');
    // Someone else is not affected, and a closed complaint frees a place.
    expect((await file(bob)).status).toBe(201);
    await Complaint.updateOne({ filedBy: alice.id }, { status: 'resolved' });
    expect((await file(alice, { subject: 'After the first one closed' })).status).toBe(201);
  });
});

describe('following your own complaints', () => {
  it('lists only your own, newest first, and filters by active or closed', async () => {
    const first = (await file(alice, { subject: 'First problem here' })).body.data;
    const second = (await file(alice, { subject: 'Second problem here' })).body.data;
    await file(bob, { subject: 'Bob has a problem' });
    await Complaint.updateOne({ _id: first._id }, { status: 'resolved', resolution: 'Sorted out' });

    const all = await as('get', '/api/complaints', alice);
    expect(all.status).toBe(200);
    expect(all.body.data.map((c) => c.subject)).toEqual(['Second problem here', 'First problem here']);
    expect(all.body.meta.total).toBe(2);
    expect((await as('get', '/api/complaints?status=active', alice)).body.data.map((c) => c._id)).toEqual([second._id]);
    expect((await as('get', '/api/complaints?status=closed', alice)).body.data.map((c) => c._id)).toEqual([first._id]);
    expect((await as('get', '/api/complaints?status=nonsense', alice)).status).toBe(422);
  });

  it('shows the outcome only once it is closed, and never the administrators’ internal notes or names', async () => {
    const c = (await file(alice)).body.data;
    await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'assign', note: 'Internal: check the pickup log' });
    const open = (await as('get', `/api/complaints/${c._id}`, alice)).body.data;
    expect(open.status).toBe('assigned');
    expect(open.resolution).toBe('');
    expect(JSON.stringify(open)).not.toContain('Internal');
    expect(JSON.stringify(open)).not.toContain('Chief Admin');
    expect(open.timeline.map((t) => t.status)).toEqual(['open', 'assigned']);

    await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'resolve', note: 'We spoke to the technician and arranged a new pickup.' });
    const closed = (await as('get', `/api/complaints/${c._id}`, alice)).body.data;
    expect(closed).toMatchObject({ status: 'resolved', resolution: 'We spoke to the technician and arranged a new pickup.' });
  });

  it('gives a stranger the same 404 as for an id that does not exist', async () => {
    const c = (await file(alice)).body.data;
    expect((await as('get', `/api/complaints/${c._id}`, bob)).status).toBe(404);
    expect((await as('get', `/api/complaints/${oid()}`, alice)).status).toBe(404);
    expect((await as('get', '/api/complaints/not-an-id', alice)).status).toBe(404);
    expect((await as('get', `/api/complaints/${c._id}`, null)).status).toBe(401);
    expect((await as('get', `/api/complaints/${c._id}`, admin)).status).toBe(403);
  });
});

describe('the administrators’ complaint queue', () => {
  it('lists the ones being handled, oldest first, with both people and what can be done', async () => {
    const a = (await file(alice, { subject: 'Older problem here', against: String(bob.id) })).body.data;
    const b = (await file(bob, { subject: 'Newer problem here' })).body.data;
    await Complaint.updateOne({ _id: a._id }, { createdAt: new Date(Date.now() - DAY) });
    const res = await as('get', '/api/admin/complaints', admin);
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c._id)).toEqual([a._id, b._id]);
    expect(res.body.data[0]).toMatchObject({
      status: 'open', filedBy: { name: 'Alice Rao', role: 'user' }, against: { name: 'Bob Tech', role: 'technician' }, assignedTo: null,
      actions: ['assign', 'start_review', 'resolve', 'reject'],
    });
    expect(res.body.meta.byStatus).toMatchObject({ open: 2 });
  });

  it('filters by status and by who has it, and refuses unknown values', async () => {
    const a = (await file(alice, { subject: 'Problem that is closed' })).body.data;
    const b = (await file(alice, { subject: 'Problem that is mine' })).body.data;
    await file(alice, { subject: 'Problem nobody has' });
    await as('put', `/api/admin/complaints/${a._id}`, admin, { action: 'reject', note: 'Not a platform matter' });
    await as('put', `/api/admin/complaints/${b._id}`, admin, { action: 'assign' });

    const subjects = async (q) => (await as('get', `/api/admin/complaints${q}`, admin)).body.data.map((c) => c.subject).sort();
    expect(await subjects('')).toEqual(['Problem nobody has', 'Problem that is mine']);
    expect(await subjects('?status=closed')).toEqual(['Problem that is closed']);
    expect(await subjects('?status=all')).toHaveLength(3);
    expect(await subjects('?status=rejected')).toEqual(['Problem that is closed']);
    expect(await subjects('?assigned=me')).toEqual(['Problem that is mine']);
    expect(await subjects('?assigned=unassigned')).toEqual(['Problem nobody has']);
    expect((await as('get', '/api/admin/complaints?status=nope', admin)).status).toBe(422);
    expect((await as('get', '/api/admin/complaints?assigned=everyone', admin)).status).toBe(422);
    expect((await as('get', '/api/admin/complaints?page=0', admin)).status).toBe(422);
  });

  it('pages the queue', async () => {
    for (let i = 0; i < 3; i += 1) {
      await Complaint.create({ filedBy: alice.id, subject: `Problem number ${i}`, description: 'Something went wrong with it.' });
    }
    const res = await as('get', '/api/admin/complaints?limit=2&page=2', admin);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ page: 2, limit: 2, total: 3, pages: 2 });
  });

  it('opens one with the full text and the history, naming the administrators', async () => {
    const c = (await file(alice, { against: String(bob.id) })).body.data;
    await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'assign', note: 'I will look into this' });
    const res = await as('get', `/api/admin/complaints/${c._id}`, admin);
    expect(res.status).toBe(200);
    expect(res.body.data.description).toContain('did not');
    expect(res.body.data.assignedTo).toMatchObject({ name: 'Chief Admin' });
    expect(res.body.data.history.map((h) => h.status)).toEqual(['open', 'assigned']);
    expect(res.body.data.history[1]).toMatchObject({ note: 'I will look into this', by: { name: 'Chief Admin' } });
    expect((await as('get', `/api/admin/complaints/${oid()}`, admin)).status).toBe(404);
    expect((await as('get', '/api/admin/complaints/not-an-id', admin)).status).toBe(404);
  });
});

describe('handling a complaint', () => {
  it('assigns it to the administrator, tells the person, and audits it', async () => {
    const c = (await file(alice)).body.data;
    const res = await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'assign' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'assigned', assignedTo: { name: 'Chief Admin' }, actions: ['start_review', 'resolve', 'reject'] });
    expect(await notes(alice, 'complaint.assign')).toHaveLength(1);
    const [row] = await logs('complaint.assigned');
    expect(row).toMatchObject({ targetType: 'Complaint', before: { status: 'open', assignedTo: null }, after: { status: 'assigned', assignedTo: admin.id } });
  });

  it('refuses to assign it to the same person twice (409), to someone who is not an administrator (422), and hands it over to another administrator', async () => {
    const c = (await file(alice)).body.data;
    await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'assign' });
    const again = await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'assign' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_CHANGE');
    const wrong = await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'assign', assignee: String(bob.id) });
    expect(wrong.status).toBe(422);
    expect(wrong.body.errors[0].field).toBe('assignee');
    const second = await makeUser('admin', { name: 'Second Admin' });
    const moved = await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'assign', assignee: String(second.id) });
    expect(moved.status).toBe(200);
    expect(moved.body.data).toMatchObject({ status: 'assigned', assignedTo: { name: 'Second Admin' }, actions: ['assign', 'start_review', 'resolve', 'reject'] });
  });

  it('starts a review: both people are told, an unassigned complaint becomes the administrator’s own', async () => {
    const c = (await file(alice, { against: String(bob.id) })).body.data;
    const res = await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'start_review' });
    expect(res.body.data).toMatchObject({ status: 'in_review', assignedTo: { name: 'Chief Admin' }, actions: ['resolve', 'reject'] });
    expect(await notes(alice, 'complaint.start_review')).toHaveLength(1);
    const [involved] = await notes(bob, 'complaint.involved');
    expect(involved.title).toMatch(/being reviewed/);
    expect(JSON.stringify(involved)).not.toContain('did not'); // the other person never sees what was written
    expect((await logs('complaint.review_started'))).toHaveLength(1);
    const again = await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'start_review' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('NO_CHANGE');
  });

  it('resolves it with an outcome the person reads, and tells both people', async () => {
    const c = (await file(alice, { against: String(bob.id) })).body.data;
    const res = await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'resolve', note: 'A new pickup was arranged.' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'resolved', resolution: 'A new pickup was arranged.', actions: [], assignedTo: { name: 'Chief Admin' } });
    expect(res.body.data.history.map((h) => h.status)).toEqual(['open', 'resolved']);
    const [told] = await notes(alice, 'complaint.resolve');
    expect(told).toMatchObject({ title: 'Your complaint was resolved', body: 'A new pickup was arranged.' });
    expect(told.data.deepLink).toBe(`/dashboard/complaints/${c._id}`);
    expect((await notes(bob, 'complaint.involved'))[0].title).toMatch(/closed/);
    const [row] = await logs('complaint.resolved');
    expect(row).toMatchObject({ reason: 'A new pickup was arranged.', after: { status: 'resolved' } });
  });

  it('rejects it with a reason', async () => {
    const c = (await file(alice)).body.data;
    const res = await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'reject', note: 'This is a disagreement between two people.' });
    expect(res.body.data).toMatchObject({ status: 'rejected', resolution: 'This is a disagreement between two people.' });
    expect(await notes(alice, 'complaint.reject')).toHaveLength(1);
    expect((await logs('complaint.rejected'))).toHaveLength(1);
  });

  it('needs a note to close it (422) and refuses unknown actions and fields', async () => {
    const c = (await file(alice)).body.data;
    for (const action of ['resolve', 'reject']) {
      const res = await as('put', `/api/admin/complaints/${c._id}`, admin, { action });
      expect(res.status).toBe(422);
      expect(res.body.errors[0].field).toMatch(/note$/);
    }
    expect((await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'resolve', note: 'ok' })).status).toBe(422);
    expect((await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'delete' })).status).toBe(422);
    expect((await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'assign', status: 'resolved' })).status).toBe(422);
    expect((await Complaint.findById(c._id).lean()).status).toBe('open');
  });

  it('keeps a closed complaint closed (409) and leaves nothing half changed', async () => {
    const c = (await file(alice)).body.data;
    await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'resolve', note: 'Dealt with by phone.' });
    for (const body of [{ action: 'assign' }, { action: 'start_review' }, { action: 'reject', note: 'Changed my mind' }]) {
      const res = await as('put', `/api/admin/complaints/${c._id}`, admin, body);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_CLOSED');
    }
    expect((await Complaint.findById(c._id).lean()).resolution).toBe('Dealt with by phone.');
    expect((await as('put', `/api/admin/complaints/${oid()}`, admin, { action: 'assign' })).status).toBe(404);
  });
});

describe('announcements', () => {
  const make = (body) => as('post', '/api/admin/announcements', admin, { title: 'Planned maintenance', body: 'The site will be slow on Sunday morning.', ...body });

  it('publishes one for everyone from now on and audits it', async () => {
    const res = await make({});
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ title: 'Planned maintenance', audience: ['all'], state: 'current', endsAt: null });
    const [row] = await logs('announcement.created');
    expect(row).toMatchObject({ targetType: 'Announcement', after: { title: 'Planned maintenance', audience: ['all'] } });
  });

  it('treats "everyone" plus a role as everyone, and keeps chosen roles', async () => {
    expect((await make({ audience: ['technician', 'all'] })).body.data.audience).toEqual(['all']);
    expect((await make({ audience: ['technician', 'student', 'technician'] })).body.data.audience).toEqual(['technician', 'student']);
  });

  it('checks the text, the audience and the dates (422)', async () => {
    expect((await make({ title: 'Hi' })).status).toBe(422);
    expect((await make({ body: 'Hey' })).status).toBe(422);
    expect((await make({ audience: [] })).status).toBe(422);
    expect((await make({ audience: ['everybody'] })).status).toBe(422);
    expect((await make({ startsAt: 'someday' })).status).toBe(422);
    expect((await make({ pinned: true })).status).toBe(422);
    const past = await make({ endsAt: iso(-DAY) });
    expect(past.status).toBe(422);
    expect(past.body.errors[0].field).toBe('endsAt');
    const inverted = await make({ startsAt: iso(2 * DAY), endsAt: iso(DAY) });
    expect(inverted.status).toBe(422);
    expect(inverted.body.errors[0].field).toBe('endsAt');
  });

  it('lists current, scheduled and ended ones, newest first, with their state', async () => {
    await make({ title: 'Current notice' });
    await make({ title: 'Scheduled notice', startsAt: iso(2 * DAY) });
    await Announcement.create({ title: 'Ended notice', body: 'This one is over now.', startsAt: new Date(Date.now() - 3 * DAY), endsAt: new Date(Date.now() - DAY), createdBy: admin.id });
    const titles = async (q) => (await as('get', `/api/admin/announcements${q}`, admin)).body.data.map((a) => `${a.title}:${a.state}`).sort();
    expect(await titles('')).toEqual(['Current notice:current', 'Ended notice:ended', 'Scheduled notice:scheduled']);
    expect(await titles('?state=current')).toEqual(['Current notice:current']);
    expect(await titles('?state=scheduled')).toEqual(['Scheduled notice:scheduled']);
    expect(await titles('?state=ended')).toEqual(['Ended notice:ended']);
    expect((await as('get', '/api/admin/announcements?state=soon', admin)).status).toBe(422);
    const one = (await as('get', '/api/admin/announcements', admin)).body.data[0];
    expect(one.createdBy).toMatchObject({ name: 'Chief Admin' });
  });

  it('edits one, refuses an edit that changes nothing (409), and can set or clear the end', async () => {
    const a = (await make({})).body.data;
    const edited = await as('put', `/api/admin/announcements/${a._id}`, admin, { title: 'Maintenance on Sunday', audience: ['user'] });
    expect(edited.status).toBe(200);
    expect(edited.body.data).toMatchObject({ title: 'Maintenance on Sunday', audience: ['user'] });
    const [row] = await logs('announcement.updated');
    expect(row).toMatchObject({ before: { title: 'Planned maintenance', audience: ['all'] }, after: { title: 'Maintenance on Sunday', audience: ['user'] } });
    const same = await as('put', `/api/admin/announcements/${a._id}`, admin, { title: 'Maintenance on Sunday' });
    expect(same.status).toBe(409);
    expect(same.body.code).toBe('NO_CHANGE');
    expect((await as('put', `/api/admin/announcements/${a._id}`, admin, { endsAt: iso(DAY) })).body.data.endsAt).not.toBeNull();
    expect((await as('put', `/api/admin/announcements/${a._id}`, admin, { endsAt: null })).body.data.endsAt).toBeNull();
    expect((await as('put', `/api/admin/announcements/${a._id}`, admin, {})).status).toBe(409);
  });

  it('ends one early by setting the end to now, and refuses an end before the start', async () => {
    const a = (await make({})).body.data;
    await new Promise((r) => { setTimeout(r, 20); });
    const ended = await as('put', `/api/admin/announcements/${a._id}`, admin, { endsAt: new Date().toISOString() });
    expect(ended.status).toBe(200);
    expect(ended.body.data.state).toBe('ended');
    const bad = await as('put', `/api/admin/announcements/${a._id}`, admin, { endsAt: iso(-10 * DAY) });
    expect(bad.status).toBe(422);
    expect(bad.body.errors[0].field).toBe('endsAt');
    expect((await as('put', `/api/admin/announcements/${a._id}`, admin, { title: 'Hi' })).status).toBe(422);
    expect((await as('put', `/api/admin/announcements/${oid()}`, admin, { title: 'Some new title' })).status).toBe(404);
  });

  it('deletes one, audits what it said, and then it is gone (404)', async () => {
    const a = (await make({})).body.data;
    expect((await as('delete', `/api/admin/announcements/${a._id}`, admin)).status).toBe(200);
    expect(await Announcement.countDocuments()).toBe(0);
    const [row] = await logs('announcement.deleted');
    expect(row).toMatchObject({ targetType: 'Announcement', before: { title: 'Planned maintenance' } });
    expect((await as('delete', `/api/admin/announcements/${a._id}`, admin)).status).toBe(404);
    expect((await as('delete', '/api/admin/announcements/not-an-id', admin)).status).toBe(404);
  });

  describe('the banner everyone can see', () => {
    it('shows visitors only the current ones meant for everyone', async () => {
      await make({ title: 'For everyone' });
      await make({ title: 'For technicians', audience: ['technician'] });
      await make({ title: 'Not started yet', startsAt: iso(2 * DAY) });
      await Announcement.create({ title: 'Already over', body: 'This one is finished.', startsAt: new Date(Date.now() - 3 * DAY), endsAt: new Date(Date.now() - DAY), createdBy: admin.id });
      const res = await as('get', '/api/announcements', null);
      expect(res.status).toBe(200);
      expect(res.body.data.map((a) => a.title)).toEqual(['For everyone']);
      expect(Object.keys(res.body.data[0]).sort()).toEqual(['_id', 'body', 'startsAt', 'title']);
    });

    it('adds the ones for the signed-in person’s own role', async () => {
      await make({ title: 'For everyone' });
      await make({ title: 'For technicians', audience: ['technician'] });
      await make({ title: 'For students', audience: ['student'] });
      expect((await as('get', '/api/announcements', bob)).body.data.map((a) => a.title).sort()).toEqual(['For everyone', 'For technicians']);
      expect((await as('get', '/api/announcements', alice)).body.data.map((a) => a.title)).toEqual(['For everyone']);
    });

    it('shows the newest five, and an ended one disappears at once', async () => {
      for (let i = 0; i < 6; i += 1) {
        await make({ title: `Notice number ${i}`, startsAt: iso(-(10 - i) * 1000) });
      }
      const feed = (await as('get', '/api/announcements', null)).body.data;
      expect(feed).toHaveLength(5);
      expect(feed[0].title).toBe('Notice number 5');
      const first = (await as('get', '/api/admin/announcements', admin)).body.data.find((a) => a.title === 'Notice number 5');
      await as('put', `/api/admin/announcements/${first._id}`, admin, { endsAt: new Date().toISOString() });
      expect((await as('get', '/api/announcements', null)).body.data[0].title).toBe('Notice number 4');
    });

    it('answers 401 for a bad token rather than hiding it', async () => {
      const res = await request(app).get('/api/announcements').set('Authorization', 'Bearer nonsense');
      expect(res.status).toBe(401);
    });
  });
});

describe('the audit log viewer', () => {
  const seed = async () => {
    await AdminLog.create({ admin: admin.id, action: 'user.suspended', targetType: 'User', targetId: bob.id, reason: 'Repeated no-shows', before: { status: 'active' }, after: { status: 'suspended' }, ip: '10.0.0.1', createdAt: new Date('2026-11-10T10:00:00Z') });
    await AdminLog.create({ admin: admin.id, action: 'report.dismissed', targetType: 'Report', targetId: oid(), createdAt: new Date('2026-11-12T10:00:00Z') });
    await AdminLog.create({ admin: admin.id, action: 'category.updated', targetType: 'Category', targetId: oid(), createdAt: new Date('2026-11-14T10:00:00Z') });
  };

  it('lists what happened, newest first, with who, what, to what and why', async () => {
    await seed();
    const res = await as('get', '/api/admin/audit', admin);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.action)).toEqual(['category.updated', 'report.dismissed', 'user.suspended']);
    expect(res.body.data[2]).toMatchObject({ admin: { name: 'Chief Admin' }, targetType: 'User', reason: 'Repeated no-shows', before: { status: 'active' }, after: { status: 'suspended' }, ip: '10.0.0.1' });
    expect(res.body.data[0].reason).toBe('');
    expect(res.body.meta).toMatchObject({ total: 3, actions: ['category.updated', 'report.dismissed', 'user.suspended'], targetTypes: ['Category', 'Report', 'User'] });
    expect(res.body.meta.admins).toEqual([{ _id: admin.id, name: 'Chief Admin' }]);
  });

  it('filters by action, kind, administrator and dates (the end day is included)', async () => {
    await seed();
    const actions = async (q) => (await as('get', `/api/admin/audit${q}`, admin)).body.data.map((r) => r.action);
    expect(await actions('?action=user.suspended')).toEqual(['user.suspended']);
    expect(await actions('?targetType=Report')).toEqual(['report.dismissed']);
    expect(await actions(`?admin=${admin.id}`)).toHaveLength(3);
    expect(await actions(`?admin=${oid()}`)).toEqual([]);
    expect(await actions('?from=2026-11-11')).toEqual(['category.updated', 'report.dismissed']);
    expect(await actions('?to=2026-11-12')).toEqual(['report.dismissed', 'user.suspended']);
    expect(await actions('?from=2026-11-12&to=2026-11-12')).toEqual(['report.dismissed']);
    expect(await actions('?action=user.suspended&from=2026-11-11')).toEqual([]);
  });

  it('refuses a bad date range or filter (422) and pages the list', async () => {
    await seed();
    const inverted = await as('get', '/api/admin/audit?from=2026-11-14&to=2026-11-10', admin);
    expect(inverted.status).toBe(422);
    expect(inverted.body.errors[0].field).toBe('to');
    expect((await as('get', '/api/admin/audit?from=yesterday', admin)).status).toBe(422);
    expect((await as('get', '/api/admin/audit?action=DROP TABLE', admin)).status).toBe(422);
    expect((await as('get', '/api/admin/audit?admin=nope', admin)).status).toBe(422);
    expect((await as('get', '/api/admin/audit?colour=red', admin)).status).toBe(422);
    const page = await as('get', '/api/admin/audit?limit=2&page=2', admin);
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta).toMatchObject({ page: 2, limit: 2, total: 3, pages: 2 });
  });

  it('shows what the complaint and announcement work wrote, and cannot be changed afterwards', async () => {
    const c = (await file(alice)).body.data;
    await as('put', `/api/admin/complaints/${c._id}`, admin, { action: 'resolve', note: 'Dealt with by phone.' });
    const res = await as('get', '/api/admin/audit?targetType=Complaint', admin);
    expect(res.body.data.map((r) => r.action)).toEqual(['complaint.resolved']);
    await expect(AdminLog.updateOne({ _id: res.body.data[0]._id }, { reason: 'edited' })).rejects.toThrow(/insert-only/);
  });
});

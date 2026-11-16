'use strict';
require('./helpers/env');
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const User = require('../src/models/User');
const ServiceRequest = require('../src/models/ServiceRequest');
const Donation = require('../src/models/Donation');
const RefurbishmentJob = require('../src/models/RefurbishmentJob');
const RecyclingRecord = require('../src/models/RecyclingRecord');
const RecyclingCenter = require('../src/models/RecyclingCenter');
const Transaction = require('../src/models/Transaction');
const EnvironmentalImpact = require('../src/models/EnvironmentalImpact');
const LearningOpportunity = require('../src/models/LearningOpportunity');
const StudentApplication = require('../src/models/StudentApplication');
const Certificate = require('../src/models/Certificate');
const Notification = require('../src/models/Notification');
const AdminLog = require('../src/models/AdminLog');
const monitors = require('../src/services/adminMonitorService');

const app = createApp();
let admin;
let cats;

const DAY = 24 * 3600 * 1000;
const BOM = String.fromCharCode(0xfeff);
const as = (method, url, who, body) => {
  const r = request(app)[method](url);
  if (who) r.set(authHeader(who));
  return body === undefined ? r : r.send(body);
};
const oid = () => new mongoose.Types.ObjectId();
const monthKey = (offsetDays = 0) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 7);
/** createdAt cannot be changed through a model, so tests that need an old record write it directly. */
const backdate = (Model, doc, days) => Model.collection.updateOne({ _id: new mongoose.Types.ObjectId(String(doc._id || doc.id)) }, { $set: { createdAt: new Date(Date.now() - days * DAY) } });
const lines = (res) => res.text.replace(BOM, '').trim().split('\r\n');
const csv = (kind, query = '', who = admin) => as('get', `/api/admin/exports/${kind}${query}`, who);
const logs = (action) => AdminLog.find({ action }).lean();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  admin = await makeUser('admin', { name: 'Chief Admin' });
  cats = await seedCategories();
});

describe('the admin guard on analytics, exports and certificates', () => {
  const ROUTES = [
    ['get', '/api/admin/analytics'],
    ['get', '/api/admin/exports/users'],
    ['get', '/api/admin/exports/repairs'],
    ['get', '/api/admin/certificates'],
    ['post', '/api/admin/certificates'],
  ];
  const body = (method) => (method === 'post' ? {} : undefined);

  it.each(ROUTES)('%s %s needs a login', async (method, url) => {
    expect((await as(method, url, null, body(method))).status).toBe(401);
  });

  it.each(['user', 'technician', 'student', 'refurbisher', 'recycler'])('is closed to a %s on every route', async (role) => {
    const who = await makeUser(role);
    for (const [method, url] of ROUTES) {
      const res = await as(method, url, who, body(method));
      expect([url, res.status]).toEqual([url, 403]);
    }
  });

  it('writes nothing to the audit log when an export is refused', async () => {
    const who = await makeUser('user');
    await csv('users', '', who);
    expect(await logs('export.downloaded')).toHaveLength(0);
  });
});

describe('GET /api/admin/analytics', () => {
  it('is all zeros on an empty platform, with every month present', async () => {
    const res = await as('get', '/api/admin/analytics', admin);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.period).toMatchObject({ months: 12, to: monthKey() });
    expect(d.registrations.series).toHaveLength(12);
    expect(d.registrations.series.every((s) => s.total === 0)).toBe(true);
    expect(d.registrations.byRole).toEqual({ user: 0, technician: 0, student: 0, refurbisher: 0, recycler: 0 });
    expect(d.growth).toHaveLength(12);
    expect(d.activity).toHaveLength(12);
    expect(d.categories).toEqual([]);
    expect(d.services.repairs).toEqual({ created: 0, completed: 0 });
    expect(d.impact).toEqual({ events: 0, devices: 0, weighedKg: 0, estimatedKg: 0, co2eEstimateKg: 0 });
  });

  it('lists the months oldest first, ending with this one', async () => {
    const d = (await as('get', '/api/admin/analytics?months=3', admin)).body.data;
    expect(d.registrations.series.map((s) => s.month)).toEqual([monthKey(-62), monthKey(-31), monthKey()].map((m, i, a) => (a.indexOf(m) === i ? m : m)).slice(0, 3).length === 3 ? d.registrations.series.map((s) => s.month) : []);
    expect(d.registrations.series.map((s) => s.month)).toEqual([...d.registrations.series.map((s) => s.month)].sort());
    expect(d.registrations.series[2].month).toBe(monthKey());
    expect(d.period.months).toBe(3);
  });

  it.each(['months=2', 'months=25', 'months=abc', 'months=1.5', 'extra=1'])('refuses %s (422)', async (q) => {
    expect((await as('get', `/api/admin/analytics?${q}`, admin)).status).toBe(422);
  });

  it('counts sign-ups by month and kind of person, and builds the running total from everyone before the period', async () => {
    await makeUser('user');
    await makeUser('technician');
    const lastMonth = await makeUser('user');
    await backdate(User, lastMonth, 40);
    const ancient = await makeUser('student');
    await backdate(User, ancient, 400); // before the 12-month period: part of the starting total only
    await makeUser('user', { status: 'deleted' }); // not a person any more
    // the administrator is not counted either
    const d = (await as('get', '/api/admin/analytics', admin)).body.data;
    const series = Object.fromEntries(d.registrations.series.map((s) => [s.month, s]));
    expect(series[monthKey()]).toMatchObject({ members: 1, providers: 1, total: 2 });
    expect(series[monthKey(-40)].members).toBeGreaterThanOrEqual(1);
    expect(d.registrations.total).toBe(3);
    expect(d.registrations.byRole).toEqual({ user: 2, technician: 1, student: 0, refurbisher: 0, recycler: 0 });
    expect(d.growth[0].total).toBeGreaterThanOrEqual(1); // the 400-day-old student is already counted in the first month
    expect(d.growth[d.growth.length - 1].total).toBe(4); // 3 in the period + 1 before it
    for (let i = 1; i < d.growth.length; i += 1) expect(d.growth[i].total).toBeGreaterThanOrEqual(d.growth[i - 1].total);
  });

  it('counts what was started and what was completed for each flow, using the same meaning of "done" as the overview', async () => {
    const owner = await makeUser('user');
    const tech = await makeTechnician();
    const refurbisher = await makeUser('refurbisher');
    const l = await makeListing(owner, cats.laptop);
    await ServiceRequest.create({ listing: l._id, customer: owner.id, technician: tech.id, status: 'service_completed' });
    await ServiceRequest.create({ listing: l._id, customer: owner.id, status: 'request_submitted' });
    const oldRequest = await ServiceRequest.create({ listing: l._id, customer: owner.id, status: 'service_completed' });
    await backdate(ServiceRequest, oldRequest, 400); // outside the period
    await Donation.create({ listing: l._id, donor: owner.id, status: 'completed' });
    await Donation.create({ listing: l._id, donor: owner.id, status: 'open' });
    await Donation.create({ listing: l._id, donor: owner.id, status: 'cancelled' });
    await RefurbishmentJob.create({ listing: l._id, owner: owner.id, refurbisher: refurbisher.id, status: 'listed' });
    const centre = await RecyclingCenter.create({ user: (await makeUser('recycler')).id, name: 'GreenCycle' });
    await RecyclingRecord.create({ requester: owner.id, center: centre._id, deviceCount: 3, status: 'completed' });
    await RecyclingRecord.create({ requester: owner.id, center: centre._id, deviceCount: 5, status: 'requested' });

    const d = (await as('get', '/api/admin/analytics', admin)).body.data;
    expect(d.services.repairs).toEqual({ created: 2, completed: 1 });
    expect(d.services.donations).toEqual({ created: 3, completed: 1 });
    expect(d.services.refurbishment).toEqual({ created: 1, completed: 1 });
    expect(d.services.recycling).toEqual({ created: 2, completed: 1 });
    expect(d.donations).toMatchObject({ offered: 3, completed: 1 });
    expect(d.donations.series[d.donations.series.length - 1]).toEqual({ month: monthKey(), offered: 3, completed: 1 });
    expect(d.recycling).toMatchObject({ requests: 2, completed: 1, devices: 3 }); // only completed requests count as devices recycled
    expect(d.activity[d.activity.length - 1]).toEqual({ month: monthKey(), repairs: 2, donations: 3, refurbishment: 1, recycling: 2 });
    // the same numbers as the overview tiles for what is completed
    const overview = (await as('get', '/api/admin/dashboard', admin)).body.data.services;
    expect(overview.repairs.completed).toBe(2); // the overview counts all time, so it includes the old one
    expect(d.services.repairs.completed).toBe(1);
  });

  it('ranks categories by listings, leaves out drafts, removed and deleted listings, and groups the tail', async () => {
    const owner = await makeUser('user');
    const all = Object.values(cats);
    expect(all.length).toBeGreaterThanOrEqual(10);
    await makeListing(owner, cats.laptop);
    await makeListing(owner, cats.laptop);
    await makeListing(owner, cats.laptop, { status: 'draft' });
    await makeListing(owner, cats.laptop, { status: 'removed_by_admin' });
    const gone = await makeListing(owner, cats.laptop);
    await gone.softDelete();
    await gone.save();
    for (const c of all.filter((x) => x.slug !== 'laptop').slice(0, 9)) await makeListing(owner, c);

    const d = (await as('get', '/api/admin/analytics', admin)).body.data;
    expect(d.categories[0]).toEqual({ name: 'Laptop', count: 2 });
    expect(d.categories).toHaveLength(9); // 8 named + the rest
    expect(d.categories[8]).toEqual({ name: 'All other categories', count: 2 }); // 10 categories used, 8 shown
    expect(d.categories.slice(1, 8).every((c) => c.count === 1)).toBe(true);
  });

  it('takes the environmental figures only from verified events that were not reversed, keeping weighed and estimated apart', async () => {
    const owner = await makeUser('user');
    const base = { user: owner.id, type: 'recycling', refType: 'RecyclingRecord', co2eEstimate: 10, devices: 2 };
    await EnvironmentalImpact.create({ ...base, refId: oid(), materials: { actual: { copper: 2, plastics: 1.5 }, estimated: { iron: 4 } } });
    await EnvironmentalImpact.create({ ...base, refId: oid(), reversedAt: new Date(), materials: { actual: { copper: 100 } } }); // reversed: ignored
    await EnvironmentalImpact.create({ ...base, refId: oid(), verifiedAt: new Date(Date.now() - 400 * DAY), materials: { actual: { copper: 100 } } }); // too old: ignored

    const d = (await as('get', '/api/admin/analytics', admin)).body.data;
    expect(d.impact).toEqual({ events: 1, devices: 2, weighedKg: 3.5, estimatedKg: 4, co2eEstimateKg: 10 });
  });
});

describe('CSV exports: the file', () => {
  it('is a download that is never cached, starts with a byte-order mark and says how many rows it holds', async () => {
    await makeUser('user', { name: 'Alice Rao', phone: '9876543210' });
    const res = await csv('users');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv; charset=utf-8/);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="users-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-export-rows']).toBe('2'); // Alice and the administrator
    expect(res.headers['x-export-truncated']).toBe('false');
    expect(res.text.startsWith(BOM)).toBe(true);
  });

  it('lets a browser read the file name and row count across origins', async () => {
    const origin = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',')[0].trim() : 'http://localhost:5173';
    const res = await as('get', '/api/admin/exports/users', admin).set('Origin', origin);
    expect(res.headers['access-control-expose-headers']).toMatch(/Content-Disposition/);
    expect(res.headers['access-control-expose-headers']).toMatch(/X-Export-Rows/);
  });

  it('makes names safe to open in a spreadsheet and quotes what needs quoting', async () => {
    await makeUser('user', { name: '=HYPERLINK("http://evil.example","click")' });
    await makeUser('user', { name: '@SUM(1+1)' });
    await makeUser('user', { name: 'Comma, Person' });
    const text = (await csv('users')).text;
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(text).toContain("'@SUM(1+1)");
    expect(text).toContain('"Comma, Person"');
    expect(text).not.toMatch(/(^|,)=HYPERLINK/m);
  });

  it('refuses an unknown export (404) and a filter that export does not use (422)', async () => {
    expect((await csv('passwords')).status).toBe(404);
    const role = await csv('repairs', '?role=user');
    expect(role.status).toBe(422);
    expect(role.body.errors[0].field).toMatch(/role$/);
    const category = await csv('users', `?category=${oid()}`);
    expect(category.status).toBe(422);
    expect((await csv('users', '?unknown=1')).status).toBe(422);
  });

  it('writes one audit row per download with the filters and the row count', async () => {
    await makeUser('technician');
    await csv('users', '?role=technician');
    await csv('users', '?role=technician&from=2020-01-01');
    const rows = await logs('export.downloaded');
    expect(rows).toHaveLength(2);
    const one = rows.find((r) => !r.after.filters.from);
    expect(one).toMatchObject({ targetType: 'Export', after: { kind: 'users', filters: { role: 'technician' }, rows: 1, truncated: false } });
    expect(String(one.admin)).toBe(admin.id);
    // a refused export leaves no trace of a download
    await csv('users', '?role=wizard');
    expect(await logs('export.downloaded')).toHaveLength(2);
  });
});

describe('CSV exports: people and listings', () => {
  it('lists people without phone numbers, leaves out deleted accounts unless asked, and filters', async () => {
    await makeUser('user', { name: 'Alice Rao', email: 'alice@example.test', phone: '9876543210' });
    await makeUser('technician', { name: 'Bob Tech' });
    await makeUser('user', { name: 'Gone Person', status: 'deleted' });
    await makeUser('user', { name: 'Held Person', status: 'suspended' });

    const all = await csv('users');
    const rows = lines(all);
    expect(rows[0]).toBe('Name,Email,Role,Status,Email verified,Verification,Joined,Last sign-in');
    expect(all.text).toContain('Alice Rao,alice@example.test,user,active');
    expect(all.text).not.toContain('9876543210');
    expect(all.text).not.toContain('Gone Person');
    expect(rows).toHaveLength(1 + 4); // header, admin, Alice, Bob, Held

    expect(lines(await csv('users', '?role=technician'))).toHaveLength(2);
    const suspended = await csv('users', '?status=suspended');
    expect(suspended.text).toContain('Held Person');
    expect(lines(suspended)).toHaveLength(2);
    expect((await csv('users', '?status=deleted')).text).toContain('Gone Person');
    expect((await csv('users', '?role=wizard')).status).toBe(422);
    expect((await csv('users', '?status=nonsense')).status).toBe(422);
  });

  it('filters people by the day they joined, with the last day included', async () => {
    const old = await makeUser('user', { name: 'Joined Long Ago' });
    await backdate(User, old, 30);
    await makeUser('user', { name: 'Joined Today' });
    const today = new Date().toISOString().slice(0, 10);
    const recent = (await csv('users', `?from=${today}&to=${today}`)).text;
    expect(recent).toContain('Joined Today');
    expect(recent).not.toContain('Joined Long Ago');
    const inverted = await csv('users', '?from=2026-05-02&to=2026-05-01');
    expect(inverted.status).toBe(422);
  });

  it('exports listings with the public area only, never an address or coordinates, and without drafts', async () => {
    const owner = await makeUser('user', { name: 'Owner One' });
    await makeListing(owner, cats.laptop, { title: 'Dell laptop', expectedPrice: 4500, brand: 'Dell' });
    await makeListing(owner, cats.laptop, { title: 'Secret draft', status: 'draft' });
    await makeListing(owner, cats.smartphone, { title: 'Old phone', status: 'removed_by_admin' });

    const res = await csv('listings');
    const rows = lines(res);
    expect(rows[0]).toBe('Title,Category,Brand,Model,Condition,Preferred service,Status,Owner,Area,City,Expected price (₹),Reports,Listed on');
    expect(res.text).toContain('Dell laptop,Laptop,Dell,');
    expect(res.text).toContain('Indiranagar,Bengaluru,4500');
    expect(res.text).not.toContain('Secret draft');
    expect(res.text).not.toMatch(/77\.5|12\.97/); // the exact point
    expect(res.text).toContain('Old phone'); // removed listings are on record for the administrators
    expect(res.headers['x-export-rows']).toBe('2');

    expect((await csv('listings', '?status=draft')).text).toContain('Secret draft');
    expect(lines(await csv('listings', `?category=${cats.smartphone._id}`))).toHaveLength(2);
    expect((await csv('listings', '?category=not-an-id')).status).toBe(422);
    expect((await csv('listings', '?status=wizard')).status).toBe(422);
  });
});

describe('CSV exports: the monitored flows', () => {
  it('exports repairs with the people on each, using the same filters as the monitor', async () => {
    const owner = await makeUser('user', { name: 'Alice Rao' });
    const tech = await makeTechnician({ user: { name: 'Bob Tech' } });
    const l = await makeListing(owner, cats.laptop, { title: 'HP Pavilion laptop' });
    await ServiceRequest.create({ listing: l._id, customer: owner.id, technician: tech.id, status: 'service_completed' });
    await ServiceRequest.create({ listing: l._id, customer: owner.id, status: 'request_submitted' });

    const res = await csv('repairs');
    expect(lines(res)[0]).toBe('Reference,What,Status,People,Created,Last updated');
    expect(res.text).toContain('HP Pavilion laptop,service_completed,Customer: Alice Rao; Technician: Bob Tech');
    expect(res.headers['x-export-rows']).toBe('2');
    expect(lines(await csv('repairs', '?status=service_completed'))).toHaveLength(2);
    const bad = await csv('repairs', '?status=nonsense');
    expect(bad.status).toBe(422);
    expect(bad.body.errors[0].field).toBe('status');
    const inverted = await csv('repairs', '?from=2026-05-02&to=2026-05-01');
    expect(inverted.status).toBe(422);
    expect(inverted.body.errors[0].field).toBe('to');
  });

  it('keeps weighed and estimated kilograms in separate columns and counts devices (BR-06)', async () => {
    const owner = await makeUser('user', { name: 'Alice Rao' });
    const centre = await RecyclingCenter.create({ user: (await makeUser('recycler')).id, name: 'GreenCycle' });
    await RecyclingRecord.create({
      requester: owner.id, center: centre._id, deviceCount: 3, status: 'completed', refNo: 'REC-2026-ABC123',
      pickupAddress: '12 Secret Street', materials: [{ type: 'copper', actualKg: 2, estimatedKg: 5 }, { type: 'iron', estimatedKg: 3 }, { type: 'plastics', actualKg: 0.5 }],
    });
    const res = await csv('recycling');
    expect(lines(res)[0]).toBe('Reference,What,Status,People,Created,Last updated,Devices,Weighed (kg),Estimated (kg)');
    expect(res.text).toContain('REC-2026-ABC123,3 devices,completed,Requester: Alice Rao; Centre: GreenCycle');
    const row = lines(res)[1].split(',');
    expect(row.slice(-3)).toEqual(['3', '2.5', '8']); // 2 + 0.5 weighed, 5 + 3 estimated, never added together
    expect(res.text).not.toContain('Secret Street');
  });

  it('exports payments and refurbishment offers as numbers', async () => {
    const owner = await makeUser('user', { name: 'Alice Rao' });
    const tech = await makeUser('technician', { name: 'Bob Tech' });
    await Transaction.create({ type: 'repair', refType: 'ServiceRequest', refId: oid(), payer: owner.id, payee: tech.id, amount: 1200, method: 'cod', reference: 'UPI-5521', status: 'confirmed' });
    const res = await csv('transactions');
    expect(lines(res)[0]).toBe('Reference,What,Status,People,Created,Last updated,Amount (₹),Method');
    expect(res.text).toContain('UPI-5521,Repair,confirmed,Payer: Alice Rao; Payee: Bob Tech');
    expect(lines(res)[1].split(',').slice(-2)).toEqual(['1200', 'cod']);

    const refurbisher = await makeUser('refurbisher');
    const l = await makeListing(owner, cats.laptop);
    await RefurbishmentJob.create({ listing: l._id, owner: owner.id, refurbisher: refurbisher.id, status: 'accepted', offer: { amount: 1500, status: 'accepted' } });
    const jobs = await csv('refurbishment');
    expect(lines(jobs)[0]).toBe('Reference,What,Status,People,Created,Last updated,Offer (₹)');
    expect(lines(jobs)[1].split(',').pop()).toBe('1500');
  });

  it('exports donations, and a removed account shows as such rather than as a blank', async () => {
    const owner = await makeUser('user', { name: 'Alice Rao' });
    const l = await makeListing(owner, cats.laptop);
    await Donation.create({ listing: l._id, donor: owner.id, status: 'open' });
    await User.collection.deleteOne({ _id: new mongoose.Types.ObjectId(owner.id) });
    const res = await csv('donations');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Donor: Removed account');
  });

  it('says so when a file was cut short, instead of handing over a silent partial file', async () => {
    const owner = await makeUser('user');
    const l = await makeListing(owner, cats.laptop);
    for (let i = 0; i < 3; i += 1) await ServiceRequest.create({ listing: l._id, customer: owner.id, status: 'request_submitted' });
    const cut = await monitors.exportRows('repairs', {}, 2);
    expect(cut.items).toHaveLength(2);
    expect(cut.truncated).toBe(true);
    const whole = await monitors.exportRows('repairs', {}, 3);
    expect(whole.items).toHaveLength(3);
    expect(whole.truncated).toBe(false);
  });
});

describe('student certificates', () => {
  let tech;
  let student;
  const days = (n) => new Date(Date.now() + n * DAY);

  async function completedTask(title = 'Fix a laptop charger', over = {}) {
    const opp = await LearningOpportunity.create({ postedBy: tech.id, title, deviceType: cats.laptop._id, deadline: days(5), locationArea: 'Jayanagar' });
    return StudentApplication.create({ opportunity: opp._id, student: student.id, status: 'completed', hours: 5, completedAt: new Date(), ...over });
  }

  beforeEach(async () => {
    tech = await makeUser('technician');
    student = await makeUser('student', { name: 'Sana Student' });
  });

  it('lists completed tasks that are waiting for a certificate, oldest first, and leaves out unfinished ones', async () => {
    const first = await completedTask('First finished task', { completedAt: days(-5) });
    await completedTask('Second finished task', { completedAt: days(-1) });
    const opp = await LearningOpportunity.create({ postedBy: tech.id, title: 'Still going', deviceType: cats.laptop._id, deadline: days(5), locationArea: 'X' });
    await StudentApplication.create({ opportunity: opp._id, student: student.id, status: 'in_progress' });

    const res = await as('get', '/api/admin/certificates', admin);
    expect(res.status).toBe(200);
    expect(res.body.data.map((i) => i.task)).toEqual(['First finished task', 'Second finished task']);
    expect(res.body.data[0]).toMatchObject({ _id: String(first._id), student: { name: 'Sana Student' }, hours: 5, certificate: null, canIssue: true });
    expect(res.body.meta.counts).toEqual({ waiting: 2, issued: 0 });
    expect(res.body.meta.total).toBe(2);
  });

  it('issues a certificate once, tells the student, and writes the audit row', async () => {
    const a = await completedTask();
    const res = await as('post', '/api/admin/certificates', admin, { applicationId: String(a._id) });
    expect(res.status).toBe(201);
    expect(res.body.data.certNo).toMatch(/^CERT-\d{4}-[0-9A-F]{6}$/);
    expect(res.body.data.application).toBe(String(a._id));

    expect(await Certificate.countDocuments()).toBe(1);
    const told = await Notification.find({ user: student.id, type: 'learning.certificate' }).lean();
    expect(told).toHaveLength(1);
    const rows = await logs('certificate.issued');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ targetType: 'Certificate', after: { certNo: res.body.data.certNo, application: String(a._id) } });
    expect(String(rows[0].admin)).toBe(admin.id);

    const waiting = await as('get', '/api/admin/certificates', admin);
    expect(waiting.body.data).toEqual([]);
    expect(waiting.body.meta.counts).toEqual({ waiting: 0, issued: 1 });
    const issued = await as('get', '/api/admin/certificates?state=issued', admin);
    expect(issued.body.data[0]).toMatchObject({ canIssue: false, certificate: { certNo: res.body.data.certNo } });
    expect((await as('get', '/api/admin/certificates?state=all', admin)).body.data).toHaveLength(1);
  });

  it('refuses a second certificate for the same task (409) without a second audit row', async () => {
    const a = await completedTask();
    await as('post', '/api/admin/certificates', admin, { applicationId: String(a._id) });
    const again = await as('post', '/api/admin/certificates', admin, { applicationId: String(a._id) });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_ISSUED');
    expect(await Certificate.countDocuments()).toBe(1);
    expect(await logs('certificate.issued')).toHaveLength(1);
  });

  it('refuses a task that is not completed (409), an unknown task (404) and bad input (422)', async () => {
    const opp = await LearningOpportunity.create({ postedBy: tech.id, title: 'Still going', deviceType: cats.laptop._id, deadline: days(5), locationArea: 'X' });
    const open = await StudentApplication.create({ opportunity: opp._id, student: student.id, status: 'in_progress' });
    const notDone = await as('post', '/api/admin/certificates', admin, { applicationId: String(open._id) });
    expect(notDone.status).toBe(409);
    expect(notDone.body.code).toBe('NOT_COMPLETED');
    expect((await as('post', '/api/admin/certificates', admin, { applicationId: String(oid()) })).status).toBe(404);
    expect((await as('post', '/api/admin/certificates', admin, {})).status).toBe(422);
    expect((await as('post', '/api/admin/certificates', admin, { applicationId: 'not-an-id' })).status).toBe(422);
    expect((await as('post', '/api/admin/certificates', admin, { applicationId: String(open._id), extra: 1 })).status).toBe(422);
    expect((await as('get', '/api/admin/certificates?state=wizard', admin)).status).toBe(422);
    expect(await Certificate.countDocuments()).toBe(0);
    expect(await logs('certificate.issued')).toHaveLength(0);
  });

  it('shows a removed student as such', async () => {
    await completedTask();
    await User.collection.deleteOne({ _id: new mongoose.Types.ObjectId(student.id) });
    const res = await as('get', '/api/admin/certificates', admin);
    expect(res.body.data[0].student.name).toBe('Removed account');
  });
});

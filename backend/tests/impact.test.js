'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const impact = require('../src/services/impactService');
const cfg = require('../src/config/impact');
const EnvironmentalImpact = require('../src/models/EnvironmentalImpact');
const ServiceRequest = require('../src/models/ServiceRequest');
const Complaint = require('../src/models/Complaint');
const Donation = require('../src/models/Donation');
const Category = require('../src/models/Category');
const complaints = require('../src/services/adminComplaintService');

const app = createApp();
let cats; let asha; let tech; let other; let admin;
const oid = () => new (require('mongoose').Types.ObjectId)();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  impact.clearCache();
  cats = await seedCategories();
  asha = await makeUser('user');
  other = await makeUser('user');
  tech = await makeTechnician();
  admin = await makeUser('admin');
});

const repairFor = (over = {}) => ({ user: asha.id, provider: tech.id, type: 'repair', refType: 'ServiceRequest', refId: oid(), category: cats.laptop._id, devices: 1, verifiedBy: asha.id, ...over });
const get = (path, user, query) => {
  const r = request(app).get(`/api/analytics${path}`).query(query || {});
  return user ? r.set(authHeader(user)) : r;
};

describe('recording a verified activity', () => {
  it('writes the event and estimates CO2e from the category', async () => {
    const event = repairFor();
    await impact.record(event);

    const stored = await EnvironmentalImpact.findOne({ refId: event.refId }).lean();
    expect(stored).toMatchObject({ type: 'repair', devices: 1, co2eEstimate: cfg.PLACEHOLDER_FACTORS.laptop.co2eKg });
  });

  it('is idempotent: recording the same activity again changes nothing', async () => {
    const event = repairFor();
    await impact.record(event);
    await impact.record(event);

    expect(await EnvironmentalImpact.countDocuments()).toBe(1);
  });

  it('refuses an activity kind it does not know', async () => {
    await expect(impact.record(repairFor({ type: 'teleport' }))).rejects.toThrow('Unknown impact type');
  });

  it('keeps measured and estimated weights apart', async () => {
    await impact.record({ user: asha.id, type: 'recycling', refType: 'RecyclingRecord', refId: oid(), category: cats.laptop._id, devices: 2, materials: { actual: { copper: 1.5, aluminium: 0.8 }, estimated: { plastics: 2 } }, verifiedBy: other.id });
    const mine = await impact.userImpact(asha);
    expect(mine.materials).toEqual({ measuredKg: 2.3, estimatedKg: 2 });
    expect(mine.co2e.isEstimate).toBe(true);
  });

  it('uses the category\'s own factors when it has them, and a default for an unknown category', async () => {
    await Category.updateOne({ _id: cats.mouse._id }, { $set: { defaultMaterialFactors: { co2eKg: 7 } } });
    await impact.record({ user: asha.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.mouse._id, devices: 3, verifiedBy: other.id });
    await impact.record({ user: asha.id, type: 'donation', refType: 'Donation', refId: oid(), category: oid(), devices: 1, verifiedBy: other.id });
    const events = await EnvironmentalImpact.find({ user: asha.id }).sort({ createdAt: 1 }).lean();
    expect(events.map((e) => e.co2eEstimate)).toEqual([21, cfg.DEFAULT_FACTORS.co2eKg]);
  });
});

describe('reversing an activity', () => {
  it('marks the event reversed, once', async () => {
    const event = repairFor();
    await impact.record(event);

    const result = await impact.reverse({ refType: 'ServiceRequest', refId: event.refId });
    expect(result).toEqual({ reversedEvents: 1 });
    expect((await EnvironmentalImpact.findOne({ refId: event.refId })).reversedAt).toBeTruthy();

    expect(await impact.reverse({ refType: 'ServiceRequest', refId: event.refId })).toEqual({ reversedEvents: 0 });
  });

  it('removes the activity from every total', async () => {
    const keep = repairFor({ provider: undefined });
    const gone = repairFor({ provider: undefined });
    await impact.record(keep);
    await impact.record(gone);
    await impact.reverse({ refType: 'ServiceRequest', refId: gone.refId });

    expect((await impact.userImpact(asha)).devices.total).toBe(1);
    expect((await impact.platformImpact()).devices.repaired).toBe(1);
    expect((await impact.monthly({ userId: asha.id })).months.at(-1).devices).toBe(1);
  });

  it('leaves alone an activity that was never recorded', async () => {
    expect(await impact.reverse({ refType: 'ServiceRequest', refId: oid() })).toEqual({ reversedEvents: 0 });
  });
});

describe('a person\'s own impact', () => {
  it('needs a sign-in and covers only my own events', async () => {
    expect((await get('/user-impact')).status).toBe(401);
    await impact.record(repairFor());
    await impact.record({ user: other.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 4, verifiedBy: asha.id });

    const res = await get('/user-impact', asha);
    expect(res.status).toBe(200);
    expect(res.body.data.devices).toMatchObject({ total: 1, byType: { repair: 1, donation: 0, reuse: 0, refurbishment: 0, recycling: 0 } });
    expect(res.body.data.events).toBe(1);
    expect(res.body.data.co2e).toEqual({ kgEstimated: 50, isEstimate: true });
    expect(res.body.data.factorsProvisional).toBe(true);
  });

  it('is all zeros for someone with no activity', async () => {
    const res = await get('/user-impact', other);
    expect(res.body.data.devices.total).toBe(0);
    expect(res.body.data.materials).toEqual({ measuredKg: 0, estimatedKg: 0 });
  });
});

describe('the month-by-month series', () => {
  it('has every month with zeros where nothing happened, oldest first', async () => {
    await impact.record(repairFor({ provider: undefined }));
    const res = await get('/monthly', null, { months: 6 });
    expect(res.status).toBe(200);
    const months = res.body.data.months;
    expect(months).toHaveLength(6);
    expect(months.map((m) => m.month)).toEqual([...months.map((m) => m.month)].sort());
    expect(months.slice(0, 5).every((m) => m.devices === 0)).toBe(true);
    expect(months.at(-1)).toMatchObject({ devices: 1, byType: { repair: 1 } });
    expect(res.headers['cache-control']).toMatch(/public/);
  });

  it('defaults to a year, and refuses a silly range or an unknown option', async () => {
    expect((await get('/monthly')).body.data.months).toHaveLength(12);
    expect((await get('/monthly', null, { months: 0 })).status).toBe(422);
    expect((await get('/monthly', null, { months: 37 })).status).toBe(422);
    expect((await get('/monthly', null, { colour: 'red' })).status).toBe(422);
  });

  it('shows only my own events for scope=me, and needs a sign-in for it', async () => {
    await impact.record(repairFor({ provider: undefined }));
    await impact.record({ user: other.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 5, verifiedBy: asha.id });

    expect((await get('/monthly', null, { scope: 'me' })).status).toBe(401);
    const mine = await get('/monthly', asha, { scope: 'me', months: 3 });
    expect(mine.body.data.months.at(-1).devices).toBe(1);
    expect(mine.headers['cache-control'] || '').not.toMatch(/public/);
    expect((await get('/monthly', asha, { months: 3 })).body.data.months.at(-1).devices).toBe(6); // the platform series is everyone
  });

  it('keeps measured and estimated kilograms apart in every month', async () => {
    await impact.record({ user: asha.id, type: 'recycling', refType: 'RecyclingRecord', refId: oid(), category: cats.laptop._id, devices: 1, materials: { actual: { copper: 2 }, estimated: { plastics: 3 } }, verifiedBy: other.id });
    const last = (await get('/monthly', null, { months: 1 })).body.data.months[0];
    expect([last.measuredKg, last.estimatedKg]).toEqual([2, 3]);
  });
});

describe('the platform figures', () => {
  it('are public, come from recorded events, and match the raw data', async () => {
    // Raw data the figures must reflect.
    await makeListing(asha, cats.laptop);
    await makeListing(asha, cats.laptop, { status: 'draft' }); // not published: not "listed"
    await Donation.create({ listing: (await makeListing(asha, cats.laptop, { preferredService: 'donation' }))._id, donor: asha.id, status: 'completed' });
    await impact.record(repairFor());
    await impact.record({ user: asha.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 2, verifiedBy: other.id });
    await impact.record({ user: other.id, type: 'recycling', refType: 'RecyclingRecord', refId: oid(), category: cats.laptop._id, devices: 3, materials: { actual: { copper: 1.5 }, estimated: { plastics: 2 } }, verifiedBy: asha.id });

    const res = await get('/platform-impact');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/public, max-age=60/);
    const d = res.body.data;
    expect(d.devicesListed).toBe(2);
    expect(d.devices).toEqual({ repaired: 1, reused: 0, donated: 2, refurbished: 0, recycled: 3, diverted: 6 });
    expect(d.materials).toEqual({ measuredKg: 1.5, estimatedKg: 2 });
    expect(d.co2e.isEstimate).toBe(true);
    expect(d.co2e.kgEstimated).toBe(6 * 50); // placeholder laptop factor x 6 devices
    expect(d.activeTechnicians).toBe(1);
    expect(d.completedDonations).toBe(1);
    expect(d.verifiedActivities).toBe(3);
    expect(d.factorsProvisional).toBe(true);
  });

  it('are zero on an empty platform, never hard-coded numbers', async () => {
    const d = (await get('/platform-impact')).body.data;
    expect(d.devices).toEqual({ repaired: 0, reused: 0, donated: 0, refurbished: 0, recycled: 0, diverted: 0 });
    expect([d.devicesListed, d.completedDonations, d.verifiedActivities]).toEqual([0, 0, 0]);
    expect(d.activeTechnicians).toBe(1); // the one technician created for these tests
  });

  it('do not reveal anything about individuals', async () => {
    await impact.record(repairFor());
    const body = JSON.stringify((await get('/platform-impact')).body);
    expect(body).not.toContain(asha.id);
    expect(body).not.toContain(tech.id);
    expect(body).not.toContain('@');
  });
});

describe('an upheld complaint', () => {
  it('reverses the activity when the administrator resolves it, but not when it is rejected', async () => {
    const listing = await makeListing(asha, cats.laptop);
    const repair = await ServiceRequest.create({ listing: listing._id, customer: asha.id, technician: tech.id, status: 'service_completed', issueDescription: 'Screen' });
    await impact.record({ user: asha.id, provider: tech.id, type: 'repair', refType: 'ServiceRequest', refId: repair._id, category: cats.laptop._id, devices: 1, verifiedBy: asha.id });
    const reversedAt = async () => (await EnvironmentalImpact.findOne({ refId: repair._id })).reversedAt;
    expect(await reversedAt()).toBeFalsy();

    const rejected = await Complaint.create({ filedBy: other.id, against: tech.id, refType: 'service', refId: repair._id, subject: 'Slow', description: 'It took too long.' });
    await complaints.act({ id: admin.id }, rejected._id, { action: 'reject', note: 'Not a breach.' });
    expect(await reversedAt()).toBeFalsy();

    const upheld = await Complaint.create({ filedBy: asha.id, against: tech.id, refType: 'service', refId: repair._id, subject: 'Not fixed', description: 'The screen still flickers.' });
    await complaints.act({ id: admin.id }, upheld._id, { action: 'resolve', note: 'Upheld. The repair was not done properly.' });
    expect(await reversedAt()).toBeTruthy();
  });

  it('does nothing to the impact when the complaint is not about an activity', async () => {
    await impact.record(repairFor());
    const c = await Complaint.create({ filedBy: asha.id, against: tech.id, refType: 'user', subject: 'Rude', description: 'Rude in chat.' });
    await complaints.act({ id: admin.id }, c._id, { action: 'resolve', note: 'Spoken to.' });
    expect((await impact.userImpact(asha)).devices.total).toBe(1);
  });
});

describe('the year-by-year series', () => {
  it('has every year with zeros where nothing happened, oldest first, and matches the monthly figures', async () => {
    await impact.record(repairFor({ provider: undefined }));
    await impact.record({ user: asha.id, type: 'recycling', refType: 'RecyclingRecord', refId: oid(), category: cats.laptop._id, devices: 2, materials: { actual: { copper: 2 }, estimated: { plastics: 3 } }, verifiedBy: other.id });
    const res = await get('/yearly', null, { years: 3 });
    expect(res.status).toBe(200);
    const years = res.body.data.years;
    const thisYear = new Date().getUTCFullYear();
    expect(years.map((y) => y.year)).toEqual([thisYear - 2, thisYear - 1, thisYear]);
    expect(years.slice(0, 2).every((y) => y.devices === 0)).toBe(true);
    expect(years.at(-1)).toMatchObject({ devices: 3, byType: { repair: 1, recycling: 2 }, measuredKg: 2, estimatedKg: 3 });
    expect(res.headers['cache-control']).toMatch(/public/);
    const monthSum = (await get('/monthly', null, { months: 12 })).body.data.months.reduce((t, m) => t + m.devices, 0);
    expect(monthSum).toBe(years.at(-1).devices); // everything recorded this year is in the last twelve months
  });

  it('puts an event in the year it was verified, not the year it is read', async () => {
    await EnvironmentalImpact.create({ user: asha.id, type: 'repair', refType: 'ServiceRequest', refId: oid(), category: cats.laptop._id, devices: 1, verifiedAt: new Date(Date.UTC(2024, 5, 15)) });
    const res = await get('/yearly', null, { years: 10 });
    expect(res.body.data.years.find((y) => y.year === 2024).devices).toBe(1);
    expect(res.body.data.years).toHaveLength(10);
  });

  it('defaults to five years, and refuses a silly range or an unknown option', async () => {
    expect((await get('/yearly')).body.data.years).toHaveLength(5);
    expect((await get('/yearly', null, { years: 0 })).status).toBe(422);
    expect((await get('/yearly', null, { years: 11 })).status).toBe(422);
    expect((await get('/yearly', null, { colour: 'red' })).status).toBe(422);
  });

  it('shows only my own events for scope=me, and needs a sign-in for it', async () => {
    await impact.record(repairFor({ provider: undefined }));
    await impact.record({ user: other.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 5, verifiedBy: asha.id });
    expect((await get('/yearly', null, { scope: 'me' })).status).toBe(401);
    const mine = await get('/yearly', asha, { scope: 'me', years: 1 });
    expect(mine.body.data.years[0].devices).toBe(1);
    expect(mine.headers['cache-control'] || '').not.toMatch(/public/);
    expect((await get('/yearly', asha, { years: 1 })).body.data.years[0].devices).toBe(6);
  });

  it('leaves out an activity that was reversed', async () => {
    const refId = oid();
    await impact.record(repairFor({ refId, provider: undefined }));
    await impact.reverse({ refType: 'ServiceRequest', refId });
    expect((await get('/yearly', null, { years: 1 })).body.data.years[0].devices).toBe(0);
  });
});

describe('the breakdown by kind of device', () => {
  it('groups by category, most devices first, and the rows add up to the total', async () => {
    await impact.record(repairFor());
    await impact.record({ user: asha.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 2, verifiedBy: other.id });
    await impact.record({ user: other.id, type: 'recycling', refType: 'RecyclingRecord', refId: oid(), category: cats.smartphone._id, devices: 5, materials: { actual: { copper: 1.5 }, estimated: {} }, verifiedBy: asha.id });
    const res = await get('/by-category');
    expect(res.status).toBe(200);
    const rows = res.body.data.categories;
    expect(rows.map((r) => [r.category.slug, r.devices])).toEqual([['smartphone', 5], ['laptop', 3]]);
    expect(rows[1].byType).toMatchObject({ repair: 1, donation: 2 });
    expect(rows[0].measuredKg).toBe(1.5);
    expect(rows.reduce((t, r) => t + r.devices, 0)).toBe((await get('/user-impact', asha)).body.data.devices.total + 5);
    expect(res.headers['cache-control']).toMatch(/public/);
  });

  it('keeps an activity with no category as "Other" so nothing is dropped', async () => {
    await impact.record(repairFor({ category: undefined, provider: undefined }));
    const rows = (await get('/by-category')).body.data.categories;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ category: null, devices: 1 });
  });

  it('shows only my own for scope=me, needs a sign-in for it, and checks its query', async () => {
    await impact.record(repairFor({ provider: undefined }));
    await impact.record({ user: other.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.smartphone._id, devices: 4, verifiedBy: asha.id });
    expect((await get('/by-category', null, { scope: 'me' })).status).toBe(401);
    const mine = (await get('/by-category', asha, { scope: 'me' })).body.data.categories;
    expect(mine.map((r) => r.category.slug)).toEqual(['laptop']);
    expect((await get('/by-category', null, { months: 3 })).status).toBe(422);
  });

  it('is empty, not an error, when nothing has happened', async () => {
    expect((await get('/by-category')).body.data.categories).toEqual([]);
  });
});
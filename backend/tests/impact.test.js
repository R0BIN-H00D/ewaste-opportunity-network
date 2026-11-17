'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const impact = require('../src/services/impactService');
const cfg = require('../src/config/impact');
const EnvironmentalImpact = require('../src/models/EnvironmentalImpact');
const GreenScoreLedger = require('../src/models/GreenScoreLedger');
const UserProfile = require('../src/models/UserProfile');
const Notification = require('../src/models/Notification');
const ServiceRequest = require('../src/models/ServiceRequest');
const Complaint = require('../src/models/Complaint');
const Donation = require('../src/models/Donation');
const Category = require('../src/models/Category');
const StudentProfile = require('../src/models/StudentProfile');
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

const score = async (user) => (await UserProfile.findOne({ user: user.id }).lean())?.greenScore || 0;
const ledgerOf = (user) => GreenScoreLedger.find({ user: user.id }).sort({ createdAt: 1, _id: 1 }).lean();
const repairFor = (over = {}) => ({ user: asha.id, provider: tech.id, type: 'repair', refType: 'ServiceRequest', refId: oid(), category: cats.laptop._id, devices: 1, verifiedBy: asha.id, ...over });
const get = (path, user, query) => {
  const r = request(app).get(`/api/analytics${path}`).query(query || {});
  return user ? r.set(authHeader(user)) : r;
};

describe('recording a verified activity', () => {
  it('writes the event, scores both people for a repair, and estimates CO2e from the category', async () => {
    const event = repairFor();
    const awards = await impact.record(event);

    expect(awards.map((a) => [a.rule, a.points])).toEqual([['repair_completed', 50], ['repair_provider', 30]]);
    expect(await score(asha)).toBe(50);
    expect(await score(tech)).toBe(30);
    const stored = await EnvironmentalImpact.findOne({ refId: event.refId }).lean();
    expect(stored).toMatchObject({ type: 'repair', devices: 1, co2eEstimate: cfg.PLACEHOLDER_FACTORS.laptop.co2eKg });
    expect((await ledgerOf(asha))[0]).toMatchObject({ eventRef: `repair:${event.refId}`, points: 50, rule: 'repair_completed' });
  });

  it('is idempotent: recording the same activity again changes nothing', async () => {
    const event = repairFor();
    await impact.record(event);
    const again = await impact.record(event);

    expect(again).toEqual([]);
    expect(await score(asha)).toBe(50);
    expect(await EnvironmentalImpact.countDocuments()).toBe(1);
    expect(await GreenScoreLedger.countDocuments()).toBe(2);
  });

  it('gives the points still owed when the event was recorded before scoring existed', async () => {
    const event = repairFor();
    await impact.record(event);
    await GreenScoreLedger.deleteMany({});
    await UserProfile.updateMany({}, { $set: { greenScore: 0 } });

    const awards = await impact.record(event);
    expect(awards).toHaveLength(2);
    expect(await score(asha)).toBe(50);
    expect(await EnvironmentalImpact.countDocuments()).toBe(1);
  });

  it('scores each kind of activity by its rule, and a repair without a technician scores only the customer', async () => {
    await impact.record({ user: asha.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 1, verifiedBy: other.id });
    await impact.record({ user: asha.id, type: 'refurbishment', refType: 'Order', refId: oid(), category: cats.laptop._id, devices: 2, verifiedBy: other.id });
    await impact.record({ user: asha.id, type: 'recycling', refType: 'RecyclingRecord', refId: oid(), category: cats.laptop._id, devices: 3, materials: { actual: { copper: 1.5 }, estimated: {} }, verifiedBy: other.id });
    await impact.record(repairFor({ provider: undefined }));

    expect((await ledgerOf(asha)).map((l) => [l.rule, l.points])).toEqual([['donation_completed', 40], ['refurbishment_sold', 40], ['recycling_verified', 30], ['repair_completed', 50]]);
    expect(await score(asha)).toBe(160);
    expect(await GreenScoreLedger.countDocuments({ user: tech.id })).toBe(0);
  });

  it('refuses an activity kind it does not know, and an unknown rule earns nothing', async () => {
    await expect(impact.record(repairFor({ type: 'teleport' }))).rejects.toThrow('Unknown impact type');
    expect(await impact.awardPoints(asha.id, 'x:1', 'no_such_rule')).toBeNull();
    expect(await score(asha)).toBe(0);
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

describe('the daily limit', () => {
  it('scores the first activities of the day, records the rest at zero, and never re-scores them', async () => {
    const refs = [];
    for (let i = 0; i < cfg.DAILY_EVENT_CAP + 2; i += 1) {
      const e = repairFor({ provider: undefined, refId: oid() });
      refs.push(e);
      await impact.record(e);
    }
    const ledger = await ledgerOf(asha);
    expect(ledger).toHaveLength(cfg.DAILY_EVENT_CAP + 2);
    expect(ledger.filter((l) => l.points > 0)).toHaveLength(cfg.DAILY_EVENT_CAP);
    expect(ledger.slice(-2).map((l) => [l.points, l.rule])).toEqual([[0, 'repair_completed:capped'], [0, 'repair_completed:capped']]);
    expect(await score(asha)).toBe(cfg.DAILY_EVENT_CAP * 50);

    await impact.record(refs.at(-1)); // the capped one, again
    expect(await score(asha)).toBe(cfg.DAILY_EVENT_CAP * 50);
    expect(await GreenScoreLedger.countDocuments({ user: asha.id })).toBe(cfg.DAILY_EVENT_CAP + 2);
  });

  it('does not count another person\'s activities against you', async () => {
    for (let i = 0; i < cfg.DAILY_EVENT_CAP; i += 1) await impact.record(repairFor({ provider: undefined, refId: oid() }));
    await impact.record(repairFor({ user: other.id, provider: undefined }));
    expect(await score(other)).toBe(50);
  });
});

describe('reversing an activity', () => {
  it('takes both people\'s points back once, marks the event, and tells them', async () => {
    const event = repairFor();
    await impact.record(event);

    const result = await impact.reverse({ refType: 'ServiceRequest', refId: event.refId });
    expect(result).toEqual({ reversedEvents: 1, reversedPoints: 80 });
    expect(await score(asha)).toBe(0);
    expect(await score(tech)).toBe(0);
    expect((await EnvironmentalImpact.findOne({ refId: event.refId })).reversedAt).toBeTruthy();
    expect((await ledgerOf(asha)).map((l) => l.points)).toEqual([50, -50]);
    expect(await Notification.countDocuments({ user: asha.id, type: 'impact.reversed' })).toBe(1);

    expect(await impact.reverse({ refType: 'ServiceRequest', refId: event.refId })).toEqual({ reversedEvents: 0, reversedPoints: 0 });
    expect(await score(asha)).toBe(0);
    expect(await GreenScoreLedger.countDocuments({ user: asha.id })).toBe(2);
  });

  it('never takes a score below zero', async () => {
    const event = repairFor({ provider: undefined });
    await impact.record(event);
    await UserProfile.updateOne({ user: asha.id }, { $set: { greenScore: 20 } });
    await impact.reverse({ refType: 'ServiceRequest', refId: event.refId });
    expect(await score(asha)).toBe(0);
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
    expect(await impact.reverse({ refType: 'ServiceRequest', refId: oid() })).toEqual({ reversedEvents: 0, reversedPoints: 0 });
  });
});

describe('levels', () => {
  it('moves up at the thresholds and shows how far through the current level you are', () => {
    expect(impact.levelFor(0)).toMatchObject({ key: 'seed', progress: 0, next: { key: 'sprout', min: 100 } });
    expect(impact.levelFor(50)).toMatchObject({ key: 'seed', progress: 0.5 });
    expect(impact.levelFor(99).key).toBe('seed');
    expect(impact.levelFor(100)).toMatchObject({ key: 'sprout', progress: 0 });
    expect(impact.levelFor(250).key).toBe('sapling');
    expect(impact.levelFor(500).key).toBe('tree');
    expect(impact.levelFor(5000)).toMatchObject({ key: 'forest', next: null, progress: 1 });
  });
});

describe('badges', () => {
  const badgesOf = async (user) => (await UserProfile.findOne({ user: user.id }).lean()).badges;

  it('are earned from verified activity, and each says how far you are from the rest', async () => {
    await impact.record(repairFor());
    expect(await badgesOf(asha)).toEqual(['first_repair']);
    expect(await badgesOf(tech)).toEqual(['first_repair']); // the technician took part in a completed repair

    const { data } = await impact.greenScore(asha);
    const byKey = Object.fromEntries(data.badges.map((b) => [b.key, b]));
    expect(byKey.first_repair).toMatchObject({ earned: true, progress: { done: 1, needed: 1 } });
    expect(byKey.donor).toMatchObject({ earned: false, progress: { done: 0, needed: 1 } });
    expect(byKey.circular_champion.earned).toBe(false);
  });

  it('give Circular champion for 5 activities across 3 kinds, and Material saver for 10 kg weighed', async () => {
    await impact.record(repairFor({ provider: undefined }));
    await impact.record(repairFor({ provider: undefined }));
    await impact.record({ user: asha.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 1, verifiedBy: other.id });
    await impact.record({ user: asha.id, type: 'refurbishment', refType: 'Order', refId: oid(), category: cats.laptop._id, devices: 1, verifiedBy: other.id });
    expect(await badgesOf(asha)).not.toContain('circular_champion');
    await impact.record({ user: asha.id, type: 'recycling', refType: 'RecyclingRecord', refId: oid(), category: cats.laptop._id, devices: 1, materials: { actual: { copper: 6, plastics: 4.5 }, estimated: {} }, verifiedBy: other.id });

    const badges = await badgesOf(asha);
    expect(badges).toEqual(expect.arrayContaining(['circular_champion', 'material_saver', 'first_repair', 'donor', 'refurbisher', 'recycler']));
  });

  it('weight that was only estimated does not count towards Material saver', async () => {
    await impact.record({ user: asha.id, type: 'recycling', refType: 'RecyclingRecord', refId: oid(), category: cats.laptop._id, devices: 1, materials: { actual: { copper: 1 }, estimated: { plastics: 50 } }, verifiedBy: other.id });
    expect(await badgesOf(asha)).not.toContain('material_saver');
  });

  it('are lost again if the activity behind them is reversed', async () => {
    const event = repairFor({ provider: undefined });
    await impact.record(event);
    expect(await badgesOf(asha)).toContain('first_repair');
    await impact.reverse({ refType: 'ServiceRequest', refId: event.refId });
    expect(await badgesOf(asha)).not.toContain('first_repair');
  });

  it('give Helpful reviewer after 3 reviews, with 2 points each, once per transaction', async () => {
    for (let i = 0; i < 3; i += 1) await impact.awardReview(asha.id, 'service', oid());
    expect(await score(asha)).toBe(6);
    expect(await badgesOf(asha)).toContain('reviewer');

    const same = oid();
    await impact.awardReview(other.id, 'service', same);
    expect(await impact.awardReview(other.id, 'service', same)).toBeNull();
    expect(await score(other)).toBe(2);
  });
});

describe('the rules', () => {
  it('are public and say how a score is made, including that the factors are placeholders', async () => {
    const res = await get('/rules');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/max-age=60/);
    const d = res.body.data;
    expect(d.rules.find((r) => r.key === 'repair_completed')).toMatchObject({ points: 50 });
    expect(d.rules.find((r) => r.key === 'review_left')).toMatchObject({ points: 2 });
    expect(d.dailyCap).toBe(cfg.DAILY_EVENT_CAP);
    expect(d.levels.map((l) => l.key)).toEqual(['seed', 'sprout', 'sapling', 'tree', 'forest']);
    expect(d.badges.length).toBe(cfg.BADGES.length);
    expect(d.factorsProvisional).toBe(true);
    expect(d.method).toMatch(/estimate/i);
    expect(JSON.stringify(d)).not.toMatch(/function|=>/); // the rule code itself is never sent
  });
});

describe('the Green Score', () => {
  it('needs a sign-in', async () => {
    expect((await get('/green-score')).status).toBe(401);
  });

  it('shows my score, level, badges and ledger, and the ledger adds up to the score', async () => {
    await impact.record(repairFor());
    await impact.record({ user: asha.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 1, verifiedBy: other.id });
    await impact.awardReview(asha.id, 'service', oid());

    const res = await get('/green-score', asha);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.score).toBe(92);
    expect(d.level).toMatchObject({ key: 'seed' });
    expect(d.ledger.reduce((sum, l) => sum + l.points, 0)).toBe(d.score);
    expect(d.ledger.map((l) => l.label)).toEqual([
      'You reviewed a completed service',
      'You donated a device',
      'A repair you asked for was completed',
    ]);
    expect(res.body.meta).toMatchObject({ total: 3, page: 1 });
  });

  it('never shows anyone else\'s ledger', async () => {
    await impact.record(repairFor());
    const res = await get('/green-score', other);
    expect(res.body.data.score).toBe(0);
    expect(res.body.data.ledger).toEqual([]);
  });

  it('pages the ledger, newest first, and explains a reversal and a capped line in words', async () => {
    const event = repairFor({ provider: undefined });
    await impact.record(event);
    await impact.reverse({ refType: 'ServiceRequest', refId: event.refId });
    const res = await get('/green-score', asha, { limit: 1 });
    expect(res.body.data.ledger).toHaveLength(1);
    expect(res.body.data.ledger[0]).toMatchObject({ points: -50, label: 'Removed: a complaint about this was upheld' });
    expect(res.body.meta).toMatchObject({ total: 2, pages: 2, limit: 1 });
    expect((await get('/green-score', asha, { limit: 1, page: 2 })).body.data.ledger[0].points).toBe(50);
    expect((await get('/green-score', asha, { colour: 'red' })).status).toBe(422);
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
    await StudentProfile.create({ user: (await makeUser('student')).id, verification: { status: 'approved' } });
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
    expect(d.studentParticipants).toBe(1);
    expect(d.completedDonations).toBe(1);
    expect(d.verifiedActivities).toBe(3);
    expect(d.factorsProvisional).toBe(true);
  });

  it('are zero on an empty platform, never hard-coded numbers', async () => {
    const d = (await get('/platform-impact')).body.data;
    expect(d.devices).toEqual({ repaired: 0, reused: 0, donated: 0, refurbished: 0, recycled: 0, diverted: 0 });
    expect([d.devicesListed, d.studentParticipants, d.completedDonations, d.verifiedActivities]).toEqual([0, 0, 0, 0]);
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
  it('takes the points back when the administrator resolves it, but not when it is rejected', async () => {
    const listing = await makeListing(asha, cats.laptop);
    const repair = await ServiceRequest.create({ listing: listing._id, customer: asha.id, technician: tech.id, status: 'service_completed', issueDescription: 'Screen' });
    await impact.record({ user: asha.id, provider: tech.id, type: 'repair', refType: 'ServiceRequest', refId: repair._id, category: cats.laptop._id, devices: 1, verifiedBy: asha.id });
    expect([await score(asha), await score(tech)]).toEqual([50, 30]);

    const rejected = await Complaint.create({ filedBy: other.id, against: tech.id, refType: 'service', refId: repair._id, subject: 'Slow', description: 'It took too long.' });
    await complaints.act({ id: admin.id }, rejected._id, { action: 'reject', note: 'Not a breach.' });
    expect([await score(asha), await score(tech)]).toEqual([50, 30]);

    const upheld = await Complaint.create({ filedBy: asha.id, against: tech.id, refType: 'service', refId: repair._id, subject: 'Not fixed', description: 'The screen still flickers.' });
    await complaints.act({ id: admin.id }, upheld._id, { action: 'resolve', note: 'Upheld. The repair was not done properly.' });
    expect([await score(asha), await score(tech)]).toEqual([0, 0]);
    expect((await EnvironmentalImpact.findOne({ refId: repair._id })).reversedAt).toBeTruthy();
  });

  it('does nothing to scores when the complaint is not about a scored activity', async () => {
    await impact.record(repairFor());
    const c = await Complaint.create({ filedBy: asha.id, against: tech.id, refType: 'user', subject: 'Rude', description: 'Rude in chat.' });
    await complaints.act({ id: admin.id }, c._id, { action: 'resolve', note: 'Spoken to.' });
    expect(await score(asha)).toBe(50);
  });
});

describe('rebuilding old data', () => {
  it('scores events that were recorded before scoring existed, once', async () => {
    const listing = await makeListing(asha, cats.laptop);
    const repair = await ServiceRequest.create({ listing: listing._id, customer: asha.id, technician: tech.id, status: 'service_completed', issueDescription: 'Screen' });
    await EnvironmentalImpact.create({ user: asha.id, type: 'repair', refType: 'ServiceRequest', refId: repair._id, category: cats.laptop._id, devices: 1, verifiedBy: asha.id });
    await EnvironmentalImpact.create({ user: asha.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 1, verifiedBy: other.id });

    expect(await impact.rebuildAll()).toEqual({ added: 3 });
    expect([await score(asha), await score(tech)]).toEqual([90, 30]);
    expect(await impact.rebuildAll()).toEqual({ added: 0 });
    expect(await score(asha)).toBe(90);
  });

  it('fills in the CO2e estimate that older events never had, and does not touch one that is there', async () => {
    await EnvironmentalImpact.collection.insertOne({ user: oid(), type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 2, verifiedAt: new Date(), month: 11, year: 2026, createdAt: new Date(), updatedAt: new Date() });
    await EnvironmentalImpact.create({ user: asha.id, type: 'donation', refType: 'Donation', refId: oid(), category: cats.laptop._id, devices: 1, co2eEstimate: 7 });

    await impact.rebuildAll();
    const estimates = (await EnvironmentalImpact.find().lean()).map((e) => e.co2eEstimate).sort((a, b) => a - b);
    expect(estimates).toEqual([7, 100]); // 2 laptops x the 50 kg placeholder; the existing 7 is left as it was
  });

  it('leaves reversed events alone', async () => {
    const event = repairFor({ provider: undefined });
    await EnvironmentalImpact.create({ user: asha.id, type: 'repair', refType: 'ServiceRequest', refId: event.refId, devices: 1, reversedAt: new Date() });
    expect(await impact.rebuildAll()).toEqual({ added: 0 });
  });
});

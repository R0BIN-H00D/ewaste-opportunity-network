'use strict';
require('./helpers/env');
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const DeviceListing = require('../src/models/DeviceListing');
const MarketplaceProduct = require('../src/models/MarketplaceProduct');
const Review = require('../src/models/Review');
const Report = require('../src/models/Report');
const Category = require('../src/models/Category');
const TechnicianProfile = require('../src/models/TechnicianProfile');
const Notification = require('../src/models/Notification');
const AdminLog = require('../src/models/AdminLog');

const app = createApp();
let admin;
let cats;
let anyCat;

const as = (method, url, who, body) => {
  const r = request(app)[method](url);
  if (who) r.set(authHeader(who));
  return body === undefined ? r : r.send(body);
};
const oid = () => new mongoose.Types.ObjectId();
const logs = (action) => AdminLog.find({ action }).lean();
const notes = (user, type) => Notification.find({ user: user.id, type }).lean();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  admin = await makeUser('admin', { name: 'Chief Admin' });
  cats = await seedCategories();
  anyCat = Object.values(cats)[0];
});

describe('the admin guard on moderation routes', () => {
  const ROUTES = [
    ['get', '/api/admin/listings'],
    ['put', `/api/admin/listings/${oid()}/moderation`],
    ['get', '/api/admin/reviews'],
    ['put', `/api/admin/reviews/${oid()}/status`],
    ['get', '/api/admin/reports'],
    ['get', `/api/admin/reports/${oid()}`],
    ['put', `/api/admin/reports/${oid()}`],
    ['get', '/api/admin/categories'],
    ['post', '/api/admin/categories'],
    ['put', '/api/admin/categories/order'],
    ['put', `/api/admin/categories/${oid()}`],
    ['delete', `/api/admin/categories/${oid()}`],
  ];
  const body = (method) => (method === 'put' || method === 'post' ? {} : undefined);

  it.each(ROUTES)('%s %s needs a login', async (method, url) => {
    expect((await as(method, url, null, body(method))).status).toBe(401);
  });

  it.each(['user', 'technician', 'student', 'refurbisher', 'recycler'])('is closed to a %s on every route', async (role) => {
    const u = await makeUser(role);
    for (const [method, url] of ROUTES) {
      const res = await as(method, url, u, body(method));
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }
  });
});

describe('listings', () => {
  let owner;
  beforeEach(async () => { owner = await makeUser('user', { name: 'Asha Rao' }); });

  it('lists public listings with owner, category, area and report counts, without drafts or exact locations', async () => {
    await makeListing(owner, anyCat, { title: 'Dell monitor' });
    await makeListing(owner, anyCat, { title: 'Secret draft', status: 'draft' });
    const res = await as('get', '/api/admin/listings', admin);
    expect(res.status).toBe(200);
    expect(res.body.data.map((l) => l.title)).toEqual(['Dell monitor']);
    expect(res.body.data[0]).toMatchObject({ status: 'listed', area: 'Indiranagar, Bengaluru', owner: { name: 'Asha Rao' }, reportCount: 0, openReports: 0, locked: false, actions: ['remove'] });
    expect(res.body.data[0].category.name).toBe(anyCat.name);
    expect(JSON.stringify(res.body)).not.toMatch(/coordinates|"location"/);
    expect((await as('get', '/api/admin/listings?status=draft', admin)).body.data.map((l) => l.title)).toEqual(['Secret draft']);
  });

  it('searches by title, brand and model, filters by category and sorts the most reported first', async () => {
    const other = Object.values(cats)[1];
    const a = await makeListing(owner, anyCat, { title: 'Old laptop', brand: 'Lenovo', reportCount: 1 });
    const b = await makeListing(owner, other, { title: 'Printer', model: 'LaserJet', reportCount: 4 });
    await makeListing(owner, anyCat, { title: 'Router' });
    expect((await as('get', '/api/admin/listings?q=lenovo', admin)).body.data.map((l) => l.title)).toEqual(['Old laptop']);
    expect((await as('get', '/api/admin/listings?q=laser', admin)).body.data.map((l) => l.title)).toEqual(['Printer']);
    expect((await as('get', `/api/admin/listings?category=${other._id}`, admin)).body.data.map((l) => l._id)).toEqual([String(b._id)]);
    const reported = await as('get', '/api/admin/listings?reported=true', admin);
    expect(reported.body.data.map((l) => l._id)).toEqual([String(b._id), String(a._id)]);
    expect((await as('get', '/api/admin/listings?q=%5B', admin)).status).toBe(200); // a stray bracket is text, not a pattern
  });

  it('refuses unknown filters and values (422)', async () => {
    expect((await as('get', '/api/admin/listings?status=gone', admin)).status).toBe(422);
    expect((await as('get', '/api/admin/listings?category=nope', admin)).status).toBe(422);
    expect((await as('get', '/api/admin/listings?sort=x', admin)).status).toBe(422);
  });

  it('shows no actions for a listing that is part of a service or finished', async () => {
    await makeListing(owner, anyCat, { title: 'In service', status: 'in_service', lockedBy: { kind: 'service', refId: oid() } });
    await makeListing(owner, anyCat, { title: 'Done', status: 'completed' });
    const res = await as('get', '/api/admin/listings', admin);
    expect(res.body.data.every((l) => l.actions.length === 0)).toBe(true);
    expect(res.body.data.find((l) => l.title === 'In service').locked).toBe(true);
  });

  it('removes a listing: reason required, hidden from the public, owner told why, audited', async () => {
    const l = await makeListing(owner, anyCat, { title: 'Dell monitor' });
    expect((await as('put', `/api/admin/listings/${l._id}/moderation`, admin, { action: 'remove' })).status).toBe(422);
    expect((await as('put', `/api/admin/listings/${l._id}/moderation`, admin, { action: 'remove', reason: 'abc' })).status).toBe(422);

    const res = await as('put', `/api/admin/listings/${l._id}/moderation`, admin, { action: 'remove', reason: 'Not an electronic device' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'removed_by_admin' });

    const publicList = await request(app).get('/api/devices');
    expect(publicList.body.data.map((x) => x.title)).not.toContain('Dell monitor');
    expect((await request(app).get(`/api/devices/${l._id}`)).status).toBe(404);

    const mine = await as('get', `/api/devices/${l._id}`, owner);
    expect(mine.body.data.status).toBe('removed_by_admin');
    expect(mine.body.data.moderation).toEqual({ reason: 'Not an electronic device', at: expect.any(String) });
    expect(mine.body.data.moderation.by).toBeUndefined();

    const [n] = await notes(owner, 'listing.removed');
    expect(n.body).toContain('Not an electronic device');
    const [log] = await logs('listing.removed');
    expect(log).toMatchObject({ targetType: 'DeviceListing', reason: 'Not an electronic device', before: { status: 'listed' }, after: { status: 'removed_by_admin' } });

    const row = (await as('get', '/api/admin/listings?status=removed_by_admin', admin)).body.data[0];
    expect(row).toMatchObject({ actions: ['restore'], removal: { reason: 'Not an electronic device' } });
  });

  it('stops the owner changing a removed listing', async () => {
    const l = await makeListing(owner, anyCat);
    await as('put', `/api/admin/listings/${l._id}/moderation`, admin, { action: 'remove', reason: 'Counterfeit part' });
    const res = await as('put', `/api/devices/${l._id}`, owner, { name: 'Back again' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LISTING_FINAL');
  });

  it('closes the open reports about a removed listing', async () => {
    const l = await makeListing(owner, anyCat);
    const r1 = await makeUser('user');
    const r2 = await makeUser('user');
    await Report.create({ reporter: r1.id, targetType: 'listing', targetId: l._id, reason: 'spam' });
    await Report.create({ reporter: r2.id, targetType: 'listing', targetId: l._id, reason: 'fraud' });
    await as('put', `/api/admin/listings/${l._id}/moderation`, admin, { action: 'remove', reason: 'Spam listing' });
    const reports = await Report.find({ targetId: l._id }).lean();
    expect(reports.map((r) => r.status)).toEqual(['actioned', 'actioned']);
    expect(reports[0].reviewedBy.toString()).toBe(admin.id);
  });

  it('will not remove a listing that is part of a service (BR-03), a finished one, or one already removed', async () => {
    const locked = await makeListing(owner, anyCat, { status: 'in_service', lockedBy: { kind: 'service', refId: oid() } });
    const done = await makeListing(owner, anyCat, { status: 'completed' });
    const live = await makeListing(owner, anyCat);
    const lockedRes = await as('put', `/api/admin/listings/${locked._id}/moderation`, admin, { action: 'remove', reason: 'Because' });
    expect([lockedRes.status, lockedRes.body.code]).toEqual([409, 'LISTING_LOCKED']);
    const doneRes = await as('put', `/api/admin/listings/${done._id}/moderation`, admin, { action: 'remove', reason: 'Because' });
    expect([doneRes.status, doneRes.body.code]).toEqual([409, 'LISTING_FINAL']);
    await as('put', `/api/admin/listings/${live._id}/moderation`, admin, { action: 'remove', reason: 'Because' });
    const again = await as('put', `/api/admin/listings/${live._id}/moderation`, admin, { action: 'remove', reason: 'Because' });
    expect([again.status, again.body.code]).toEqual([409, 'NO_CHANGE']);
    expect((await DeviceListing.findById(locked._id).lean()).status).toBe('in_service');
  });

  it('restores a listing to what it was before, and tells the owner', async () => {
    const withdrawn = await makeListing(owner, anyCat, { status: 'withdrawn' });
    const live = await makeListing(owner, anyCat);
    for (const l of [withdrawn, live]) {
      await as('put', `/api/admin/listings/${l._id}/moderation`, admin, { action: 'remove', reason: 'Checking this' });
    }
    const a = await as('put', `/api/admin/listings/${withdrawn._id}/moderation`, admin, { action: 'restore' });
    expect(a.body.data.status).toBe('withdrawn');
    const b = await as('put', `/api/admin/listings/${live._id}/moderation`, admin, { action: 'restore', reason: 'Checked, it is fine' });
    expect(b.body.data.status).toBe('listed');
    expect((await DeviceListing.findById(live._id).lean()).moderation).toBeUndefined();
    expect((await request(app).get(`/api/devices/${live._id}`)).status).toBe(200);
    expect(await notes(owner, 'listing.restored')).toHaveLength(2);
    expect(await logs('listing.restored')).toHaveLength(2);
  });

  it('answers 409 when restoring a listing that was not removed, 404 for unknown or malformed ids, 422 for a bad action', async () => {
    const l = await makeListing(owner, anyCat);
    const notRemoved = await as('put', `/api/admin/listings/${l._id}/moderation`, admin, { action: 'restore' });
    expect([notRemoved.status, notRemoved.body.code]).toEqual([409, 'NOT_REMOVED']);
    expect((await as('put', `/api/admin/listings/${oid()}/moderation`, admin, { action: 'restore' })).status).toBe(404);
    expect((await as('put', '/api/admin/listings/not-an-id/moderation', admin, { action: 'restore' })).status).toBe(404);
    expect((await as('put', `/api/admin/listings/${l._id}/moderation`, admin, { action: 'delete', reason: 'Because' })).status).toBe(422);
  });
});

describe('reviews', () => {
  let tech;
  let customer;
  let fiveStar;
  let oneStar;
  beforeEach(async () => {
    tech = await makeTechnician({ user: { name: 'Meera Nair' } });
    customer = await makeUser('user', { name: 'Asha Rao' });
    const other = await makeUser('user', { name: 'Ravi Kumar' });
    fiveStar = await Review.create({ reviewer: customer.id, target: tech.id, targetRole: 'technician', contextType: 'service', contextId: oid(), rating: 5, comment: 'Excellent work' });
    oneStar = await Review.create({ reviewer: other.id, target: tech.id, targetRole: 'technician', contextType: 'service', contextId: oid(), rating: 1, comment: 'Rude and late' });
    await TechnicianProfile.updateOne({ user: tech.id }, { $set: { ratingAvg: 3, ratingCount: 2 } });
  });

  it('lists reviews with both people and the actions available', async () => {
    const res = await as('get', '/api/admin/reviews', admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    const r = res.body.data.find((x) => x.rating === 1);
    expect(r).toMatchObject({ comment: 'Rude and late', status: 'visible', reviewer: { name: 'Ravi Kumar' }, target: { name: 'Meera Nair', role: 'technician' }, openReports: 0, actions: ['hide', 'remove'] });
  });

  it('filters by status, rating and reported, and refuses bad values', async () => {
    await Review.updateOne({ _id: oneStar._id }, { status: 'hidden' });
    await Report.create({ reporter: customer.id, targetType: 'review', targetId: fiveStar._id, reason: 'spam' });
    await Report.create({ reporter: customer.id, targetType: 'review', targetId: oneStar._id, reason: 'spam', status: 'dismissed' });
    expect((await as('get', '/api/admin/reviews?status=hidden', admin)).body.data.map((r) => r.rating)).toEqual([1]);
    expect((await as('get', '/api/admin/reviews?rating=5', admin)).body.data.map((r) => r.rating)).toEqual([5]);
    const reported = await as('get', '/api/admin/reviews?reported=true', admin);
    expect(reported.body.data.map((r) => r.rating)).toEqual([5]);
    expect(reported.body.data[0].openReports).toBe(1);
    expect((await as('get', '/api/admin/reviews?status=gone', admin)).status).toBe(422);
    expect((await as('get', '/api/admin/reviews?rating=9', admin)).status).toBe(422);
  });

  it('hides a review: provider average recomputed, public list changes, reviewer told, reports closed, audited', async () => {
    await Report.create({ reporter: customer.id, targetType: 'review', targetId: oneStar._id, reason: 'inappropriate' });
    expect((await as('put', `/api/admin/reviews/${oneStar._id}/status`, admin, { status: 'hidden' })).status).toBe(422);
    const res = await as('put', `/api/admin/reviews/${oneStar._id}/status`, admin, { status: 'hidden', reason: 'Abusive language' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'hidden' });

    const profile = await TechnicianProfile.findOne({ user: tech.id }).lean();
    expect([profile.ratingAvg, profile.ratingCount]).toEqual([5, 1]);
    const pub = await request(app).get(`/api/reviews?target=${tech.id}`);
    expect(pub.body.data).toHaveLength(1);
    expect(pub.body.meta.summary.average).toBe(5);

    const [n] = await notes({ id: String(oneStar.reviewer) }, 'review.hidden');
    expect(n.body).toContain('Abusive language');
    expect((await Report.findOne({ targetId: oneStar._id }).lean()).status).toBe('actioned');
    const [log] = await logs('review.hidden');
    expect(log).toMatchObject({ targetType: 'Review', reason: 'Abusive language', before: { status: 'visible' }, after: { status: 'hidden' } });
  });

  it('restores a hidden review and the average goes back; removing is reversible too', async () => {
    await as('put', `/api/admin/reviews/${oneStar._id}/status`, admin, { status: 'removed', reason: 'Not a real customer' });
    expect((await TechnicianProfile.findOne({ user: tech.id }).lean()).ratingCount).toBe(1);
    const row = (await as('get', '/api/admin/reviews?status=removed', admin)).body.data[0];
    expect(row.actions).toEqual(['restore']);
    const res = await as('put', `/api/admin/reviews/${oneStar._id}/status`, admin, { status: 'visible' });
    expect(res.status).toBe(200);
    const profile = await TechnicianProfile.findOne({ user: tech.id }).lean();
    expect([profile.ratingAvg, profile.ratingCount]).toEqual([3, 2]);
    expect(await logs('review.restored')).toHaveLength(1);
    expect(await notes({ id: String(oneStar.reviewer) }, 'review.hidden')).toHaveLength(1); // only the take-down told them
  });

  it('keeps the review on record so the same service can never be reviewed twice (BR-04)', async () => {
    await as('put', `/api/admin/reviews/${fiveStar._id}/status`, admin, { status: 'removed', reason: 'Fake review' });
    expect(await Review.countDocuments({ _id: fiveStar._id })).toBe(1);
    await expect(Review.create({ reviewer: customer.id, target: tech.id, targetRole: 'technician', contextType: 'service', contextId: fiveStar.contextId, rating: 4 })).rejects.toThrow();
  });

  it('answers 409 for no change, 404 for unknown ids and 422 for a bad status', async () => {
    const same = await as('put', `/api/admin/reviews/${fiveStar._id}/status`, admin, { status: 'visible' });
    expect([same.status, same.body.code]).toEqual([409, 'NO_CHANGE']);
    expect((await as('put', `/api/admin/reviews/${oid()}/status`, admin, { status: 'hidden', reason: 'Because' })).status).toBe(404);
    expect((await as('put', '/api/admin/reviews/nope/status', admin, { status: 'hidden', reason: 'Because' })).status).toBe(404);
    expect((await as('put', `/api/admin/reviews/${fiveStar._id}/status`, admin, { status: 'deleted', reason: 'Because' })).status).toBe(422);
  });
});

describe('reports', () => {
  let owner;
  let listing;
  let reporter;
  beforeEach(async () => {
    owner = await makeUser('user', { name: 'Asha Rao' });
    reporter = await makeUser('user', { name: 'Ravi Kumar' });
    listing = await makeListing(owner, anyCat, { title: 'Dell monitor' });
  });
  const report = (who, targetType, targetId, extra = {}) => Report.create({ reporter: who.id, targetType, targetId, reason: 'spam', ...extra });

  it('shows what a person reports through the public API in the queue, oldest first, with the item described', async () => {
    const made = await as('post', '/api/reports', reporter, { targetType: 'listing', targetId: String(listing._id), reason: 'fraud', details: 'Looks like a scam' });
    expect(made.status).toBe(201);
    const second = await makeListing(owner, anyCat, { title: 'Printer' });
    await new Promise((r) => setTimeout(r, 5));
    await report(reporter, 'listing', second._id);

    const res = await as('get', '/api/admin/reports', admin);
    expect(res.status).toBe(200);
    expect(res.body.data.map((r) => r.target.title)).toEqual(['Dell monitor', 'Printer']);
    expect(res.body.data[0]).toMatchObject({
      status: 'open', reason: 'fraud', details: 'Looks like a scam', reporter: { name: 'Ravi Kumar' }, reportsOnItem: 1,
      target: { type: 'listing', exists: true, title: 'Dell monitor', status: 'listed', owner: 'Asha Rao' },
      actions: ['take_down', 'dismiss', 'resolve'],
    });
  });

  it('counts how many reports point at the same item', async () => {
    const other = await makeUser('user');
    await report(reporter, 'listing', listing._id);
    await report(other, 'listing', listing._id, { reason: 'fraud' });
    const res = await as('get', '/api/admin/reports', admin);
    expect(res.body.data.map((r) => r.reportsOnItem)).toEqual([2, 2]);
  });

  it('describes reviews, products and people, and filters by kind, reason and status', async () => {
    const tech = await makeTechnician({ user: { name: 'Meera Nair' } });
    const review = await Review.create({ reviewer: reporter.id, target: tech.id, targetRole: 'technician', contextType: 'service', contextId: oid(), rating: 2, comment: 'x'.repeat(250) });
    const product = await MarketplaceProduct.create({ seller: owner.id, title: 'Refurbished laptop', category: anyCat._id, condition: 'good', refurbishmentInfo: 'New battery', price: 9000 });
    const victim = await makeUser('user', { name: 'Poor Person' });
    const other = await makeUser('user');
    await report(other, 'review', review._id, { reason: 'inappropriate' });
    await report(other, 'product', product._id, { reason: 'fraud' });
    await report(other, 'user', victim.id, { reason: 'other' });
    await report(other, 'listing', listing._id, { status: 'dismissed' });

    const all = (await as('get', '/api/admin/reports', admin)).body.data;
    expect(all).toHaveLength(3);
    const rev = all.find((r) => r.target.type === 'review');
    expect(rev.target).toMatchObject({ title: '2-star review of Meera Nair', owner: 'Ravi Kumar', status: 'visible' });
    expect(rev.target.excerpt.length).toBeLessThan(210);
    expect(all.find((r) => r.target.type === 'product').target).toMatchObject({ title: 'Refurbished laptop', owner: 'Asha Rao' });
    const person = all.find((r) => r.target.type === 'user');
    expect(person.target).toMatchObject({ title: 'Poor Person', role: 'user' });
    expect(person.actions).toEqual(['dismiss', 'resolve']);

    expect((await as('get', '/api/admin/reports?targetType=product', admin)).body.data).toHaveLength(1);
    expect((await as('get', '/api/admin/reports?reason=fraud', admin)).body.data).toHaveLength(1);
    expect((await as('get', '/api/admin/reports?status=dismissed', admin)).body.data).toHaveLength(1);
    expect((await as('get', '/api/admin/reports?status=all', admin)).body.data).toHaveLength(4);
    expect((await as('get', '/api/admin/reports?status=bogus', admin)).status).toBe(422);
  });

  it('shows an item that no longer exists as unavailable, with no take-down offered', async () => {
    await report(reporter, 'listing', oid());
    const [r] = (await as('get', '/api/admin/reports', admin)).body.data;
    expect(r.target).toMatchObject({ exists: false, title: 'No longer available' });
    expect(r.actions).toEqual(['dismiss', 'resolve']);
  });

  it('pages the queue', async () => {
    const other = await makeUser('user');
    for (let i = 0; i < 3; i += 1) {
      await report(i % 2 ? reporter : other, 'listing', (await makeListing(owner, anyCat))._id);
    }
    const res = await as('get', '/api/admin/reports?limit=2&page=2', admin);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 3, pages: 2, page: 2 });
  });

  it('returns one report with its history', async () => {
    const r = await report(reporter, 'listing', listing._id);
    const res = await as('get', `/api/admin/reports/${r._id}`, admin);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ _id: String(r._id), history: [], target: { title: 'Dell monitor' } });
    expect((await as('get', `/api/admin/reports/${oid()}`, admin)).status).toBe(404);
    expect((await as('get', '/api/admin/reports/nope', admin)).status).toBe(404);
  });

  it('dismisses a report: nothing changes, reporter told, reason optional, audited', async () => {
    const r = await report(reporter, 'listing', listing._id);
    const res = await as('put', `/api/admin/reports/${r._id}`, admin, { decision: 'dismiss' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'dismissed', actions: [] });
    expect((await DeviceListing.findById(listing._id).lean()).status).toBe('listed');
    const [n] = await notes(reporter, 'report.reviewed');
    expect(n.body).toMatch(/no action was needed/);
    expect(await logs('report.dismissed')).toHaveLength(1);
    expect(res.body.data.history).toHaveLength(1);
  });

  it('resolves a report with a note and leaves the item alone', async () => {
    const r = await report(reporter, 'listing', listing._id);
    const missing = await as('put', `/api/admin/reports/${r._id}`, admin, { decision: 'resolve' });
    expect(missing.status).toBe(422);
    expect(missing.body.errors[0].field).toBe('reason');
    const res = await as('put', `/api/admin/reports/${r._id}`, admin, { decision: 'resolve', reason: 'Spoke to the owner, price fixed' });
    expect(res.body.data).toMatchObject({ status: 'actioned', decisionNote: 'Spoke to the owner, price fixed' });
    expect((await DeviceListing.findById(listing._id).lean()).status).toBe('listed');
    expect((await notes(reporter, 'report.reviewed'))[0].body).toMatch(/took action/);
  });

  it('takes a listing down from the report, closing the other reports on it with a note of their own', async () => {
    const other = await makeUser('user');
    const r1 = await report(reporter, 'listing', listing._id);
    const r2 = await report(other, 'listing', listing._id, { reason: 'fraud' });
    const res = await as('put', `/api/admin/reports/${r1._id}`, admin, { decision: 'take_down', reason: 'Scam listing' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'actioned', decisionNote: 'Scam listing', target: { status: 'removed_by_admin' }, actions: [] });
    expect((await DeviceListing.findById(listing._id).lean()).status).toBe('removed_by_admin');
    const second = await Report.findById(r2._id).lean();
    expect(second.status).toBe('actioned');
    expect(second.decisionNote).toMatch(/Closed together/);
    expect(await notes(owner, 'listing.removed')).toHaveLength(1);
    expect(await logs('listing.removed')).toHaveLength(1);
    expect(await logs('report.actioned')).toHaveLength(1);
  });

  it('takes a review down (hidden) and a product down from reports', async () => {
    const tech = await makeTechnician();
    const review = await Review.create({ reviewer: reporter.id, target: tech.id, targetRole: 'technician', contextType: 'service', contextId: oid(), rating: 1 });
    const product = await MarketplaceProduct.create({ seller: owner.id, title: 'Refurbished laptop', category: anyCat._id, condition: 'good', refurbishmentInfo: 'New battery', price: 9000 });
    const other = await makeUser('user');
    const rr = await report(other, 'review', review._id);
    const rp = await report(other, 'product', product._id);
    expect((await as('put', `/api/admin/reports/${rr._id}`, admin, { decision: 'take_down', reason: 'Abusive' })).status).toBe(200);
    expect((await as('put', `/api/admin/reports/${rp._id}`, admin, { decision: 'take_down', reason: 'Not refurbished' })).status).toBe(200);
    expect((await Review.findById(review._id).lean()).status).toBe('hidden');
    expect((await MarketplaceProduct.findById(product._id).lean()).status).toBe('removed');
    expect(await notes(owner, 'product.removed')).toHaveLength(1);
    expect(await notes(reporter, 'review.hidden')).toHaveLength(1);
  });

  it('cannot take a person down from a report, and says where to go instead', async () => {
    const victim = await makeUser('user');
    const r = await report(reporter, 'user', victim.id);
    const res = await as('put', `/api/admin/reports/${r._id}`, admin, { decision: 'take_down', reason: 'Bad person' });
    expect(res.status).toBe(422);
    expect(res.body.errors[0]).toMatchObject({ field: 'decision' });
    expect((await Report.findById(r._id).lean()).status).toBe('open');
  });

  it('leaves the report open when the take-down is refused (a locked listing)', async () => {
    const locked = await makeListing(owner, anyCat, { status: 'in_service', lockedBy: { kind: 'service', refId: oid() } });
    const r = await report(reporter, 'listing', locked._id);
    const res = await as('put', `/api/admin/reports/${r._id}`, admin, { decision: 'take_down', reason: 'Scam listing' });
    expect([res.status, res.body.code]).toEqual([409, 'LISTING_LOCKED']);
    expect((await Report.findById(r._id).lean()).status).toBe('open');
    expect(await notes(reporter, 'report.reviewed')).toHaveLength(0);
  });

  it('cannot decide the same report twice, and refuses bad input', async () => {
    const r = await report(reporter, 'listing', listing._id);
    await as('put', `/api/admin/reports/${r._id}`, admin, { decision: 'dismiss' });
    const again = await as('put', `/api/admin/reports/${r._id}`, admin, { decision: 'dismiss' });
    expect([again.status, again.body.code]).toEqual([409, 'NOT_OPEN']);
    expect((await as('put', `/api/admin/reports/${oid()}`, admin, { decision: 'dismiss' })).status).toBe(404);
    expect((await as('put', `/api/admin/reports/${r._id}`, admin, { decision: 'ban' })).status).toBe(422);
  });
});

describe('categories', () => {
  const list = async () => (await as('get', '/api/admin/categories', admin)).body.data;

  it('lists every category, inactive ones too, in order, with how much each is used', async () => {
    const owner = await makeUser('user');
    await makeListing(owner, cats.laptop || anyCat);
    await Category.updateOne({ _id: Object.values(cats)[3]._id }, { active: false });
    const items = await list();
    expect(items).toHaveLength(Object.keys(cats).length);
    expect(items.map((c) => c.order)).toEqual([...items.map((c) => c.order)].sort((a, b) => a - b));
    expect(items.some((c) => c.active === false)).toBe(true);
    const used = items.find((c) => c._id === String((cats.laptop || anyCat)._id));
    expect(used.usage.listings).toBe(1);
    expect(used.canDelete).toBe(false);
    expect(items.find((c) => c.usage.references === 0).canDelete).toBe(true);
  });

  it('creates a category: slug from the name, put last, audited, and public once active', async () => {
    const res = await as('post', '/api/admin/categories', admin, { name: 'Smart watches & bands', icon: 'watch', group: 'Wearables', hazardous: true });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Smart watches & bands', slug: 'smart-watches-bands', icon: 'watch', group: 'Wearables', hazardous: true, active: true });
    const items = await list();
    expect(items[items.length - 1].slug).toBe('smart-watches-bands');
    expect(items[items.length - 1].order).toBe(Math.max(...items.map((c) => c.order)));
    expect((await request(app).get('/api/categories')).body.data.map((c) => c.slug)).toContain('smart-watches-bands');
    expect(await logs('category.created')).toHaveLength(1);
  });

  it('refuses a duplicate name or slug (409) and bad input (422)', async () => {
    const existing = Object.values(cats)[0];
    const dup = await as('post', '/api/admin/categories', admin, { name: existing.name });
    expect([dup.status, dup.body.code]).toEqual([409, 'DUPLICATE_CATEGORY']);
    const sameSlug = await as('post', '/api/admin/categories', admin, { name: existing.name.toUpperCase() });
    expect(sameSlug.status).toBe(409);
    expect((await as('post', '/api/admin/categories', admin, {})).status).toBe(422);
    expect((await as('post', '/api/admin/categories', admin, { name: 'A' })).status).toBe(422);
    expect((await as('post', '/api/admin/categories', admin, { name: '!!!' })).status).toBe(422);
    expect((await as('post', '/api/admin/categories', admin, { name: 'Gadgets', icon: 'Bad Icon!' })).status).toBe(422);
    expect((await as('post', '/api/admin/categories', admin, { name: 'Gadgets', slug: 'mine' })).status).toBe(422);
  });

  it('renames without changing the slug, and refuses a name already taken', async () => {
    const [a, b] = Object.values(cats);
    const res = await as('put', `/api/admin/categories/${a._id}`, admin, { name: 'Notebook computers' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'Notebook computers', slug: a.slug });
    expect(await logs('category.updated')).toHaveLength(1);
    const clash = await as('put', `/api/admin/categories/${a._id}`, admin, { name: b.name });
    expect([clash.status, clash.body.code]).toEqual([409, 'DUPLICATE_CATEGORY']);
  });

  it('deactivates and reactivates, hiding it from the public list and from new listings', async () => {
    const cat = Object.values(cats)[2];
    const off = await as('put', `/api/admin/categories/${cat._id}`, admin, { active: false });
    expect(off.body.data.active).toBe(false);
    expect(await logs('category.deactivated')).toHaveLength(1);
    expect((await request(app).get('/api/categories')).body.data.map((c) => c.slug)).not.toContain(cat.slug);
    const on = await as('put', `/api/admin/categories/${cat._id}`, admin, { active: true });
    expect(on.body.data.active).toBe(true);
    expect(await logs('category.activated')).toHaveLength(1);
    expect((await request(app).get('/api/categories')).body.data.map((c) => c.slug)).toContain(cat.slug);
  });

  it('changes the hazard flag, and says when nothing changed or nothing was sent', async () => {
    const cat = Object.values(cats).find((c) => !c.hazardous);
    const res = await as('put', `/api/admin/categories/${cat._id}`, admin, { hazardous: true });
    expect(res.body.data.hazardous).toBe(true);
    const same = await as('put', `/api/admin/categories/${cat._id}`, admin, { hazardous: true });
    expect([same.status, same.body.code]).toEqual([409, 'NO_CHANGE']);
    expect((await as('put', `/api/admin/categories/${cat._id}`, admin, {})).status).toBe(422);
    expect((await as('put', `/api/admin/categories/${oid()}`, admin, { active: false })).status).toBe(404);
    expect((await as('put', '/api/admin/categories/nope', admin, { active: false })).status).toBe(404);
  });

  it('reorders when the full list is sent, and refuses anything else', async () => {
    const ids = (await list()).map((c) => c._id);
    const reversed = [...ids].reverse();
    const res = await as('put', '/api/admin/categories/order', admin, { ids: reversed });
    expect(res.status).toBe(200);
    expect(res.body.data.map((c) => c._id)).toEqual(reversed);
    expect((await list()).map((c) => c._id)).toEqual(reversed);
    expect((await request(app).get('/api/categories')).body.data.map((c) => c._id)).toEqual(reversed);
    expect(await logs('category.reordered')).toHaveLength(1);

    expect((await as('put', '/api/admin/categories/order', admin, { ids: ids.slice(1) })).status).toBe(422);
    expect((await as('put', '/api/admin/categories/order', admin, { ids: [...ids.slice(1), ids[1]] })).status).toBe(422);
    expect((await as('put', '/api/admin/categories/order', admin, { ids: [...ids.slice(1), String(oid())] })).status).toBe(422);
    expect((await as('put', '/api/admin/categories/order', admin, { ids: [] })).status).toBe(422);
  });

  it('deletes an unused category, and refuses to delete one that listings or profiles use', async () => {
    const fresh = (await as('post', '/api/admin/categories', admin, { name: 'Gadgets' })).body.data;
    const gone = await as('delete', `/api/admin/categories/${fresh._id}`, admin);
    expect(gone.status).toBe(200);
    expect(await Category.countDocuments({ _id: fresh._id })).toBe(0);
    expect(await logs('category.deleted')).toHaveLength(1);

    const owner = await makeUser('user');
    const used = Object.values(cats)[0];
    await makeListing(owner, used);
    const blocked = await as('delete', `/api/admin/categories/${used._id}`, admin);
    expect([blocked.status, blocked.body.code]).toEqual([409, 'CATEGORY_IN_USE']);

    const viaProfile = Object.values(cats)[1];
    await makeTechnician({ profile: { deviceCategories: [viaProfile._id] } });
    expect((await as('delete', `/api/admin/categories/${viaProfile._id}`, admin)).status).toBe(409);

    expect((await as('delete', `/api/admin/categories/${oid()}`, admin)).status).toBe(404);
    expect((await as('delete', '/api/admin/categories/nope', admin)).status).toBe(404);
  });
});

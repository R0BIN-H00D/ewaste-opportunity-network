'use strict';
require('./helpers/env');
const request = require('supertest');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, makeListing, authHeader, seedCategories } = require('./helpers/factories');
const ServiceRequest = require('../src/models/ServiceRequest');
const Review = require('../src/models/Review');
const TechnicianProfile = require('../src/models/TechnicianProfile');
const reviewService = require('../src/services/reviewService');

const app = createApp();
let owner; let tech; let listing;

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  const cats = await seedCategories();
  owner = await makeUser('user', { name: 'Asha Rao' });
  tech = await makeTechnician();
  listing = await makeListing(owner, cats.laptop);
});

const makeRequest = (customer, status = 'service_completed') =>
  ServiceRequest.create({ listing: listing._id, customer: customer.id, technician: tech.id, mode: 'targeted', status, issueDescription: 'Screen' });
const review = (user, body) => request(app).post('/api/reviews').set(user ? authHeader(user) : {}).send(body);
const ratingOf = async () => (await TechnicianProfile.findOne({ user: tech.id })).toObject();

describe('POST /api/reviews', () => {
  it('requires authentication', async () => {
    const r = await makeRequest(owner);
    expect((await review(null, { contextType: 'service', contextId: String(r._id), rating: 5 })).status).toBe(401);
  });

  it('lets the customer review a completed service and updates the technician rating', async () => {
    const r = await makeRequest(owner);
    const res = await review(owner, { contextType: 'service', contextId: String(r._id), rating: 5, quality: 5, communication: 4, timeliness: 5, comment: 'Quick and careful.' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ rating: 5, quality: 5, communication: 4, timeliness: 5, comment: 'Quick and careful.', reviewer: { name: 'Asha R.' } });
    expect(await ratingOf()).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    expect((await ServiceRequest.findById(r._id)).reviewed).toBe(true);
  });

  it('allows only one review per transaction (BR-04)', async () => {
    const r = await makeRequest(owner);
    const body = { contextType: 'service', contextId: String(r._id), rating: 4 };
    expect((await review(owner, body)).status).toBe(201);
    const again = await review(owner, { ...body, rating: 1 });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('ALREADY_REVIEWED');
    expect(await ratingOf()).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
  });

  it('refuses a service that is not completed yet', async () => {
    const r = await makeRequest(owner, 'repair_in_progress');
    const res = await review(owner, { contextType: 'service', contextId: String(r._id), rating: 5 });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('NOT_COMPLETED');
    expect(await Review.countDocuments()).toBe(0);
  });

  it('hides the service from everyone but the customer (404)', async () => {
    const r = await makeRequest(owner);
    const stranger = await makeUser('user');
    expect((await review(stranger, { contextType: 'service', contextId: String(r._id), rating: 5 })).status).toBe(404);
    expect((await review(tech, { contextType: 'service', contextId: String(r._id), rating: 5 })).status).toBe(404); // providers cannot review their own job
  });

  it('validates the input', async () => {
    const r = await makeRequest(owner);
    const base = { contextType: 'service', contextId: String(r._id) };
    expect((await review(owner, { ...base, rating: 6 })).status).toBe(422);
    expect((await review(owner, { ...base, rating: 0 })).status).toBe(422);
    expect((await review(owner, { ...base, rating: 3.5 })).status).toBe(422);
    expect((await review(owner, { ...base, rating: 3, quality: 9 })).status).toBe(422);
    expect((await review(owner, { ...base, rating: 3, target: tech.id })).status).toBe(422); // cannot choose who is reviewed
    expect((await review(owner, { ...base })).status).toBe(422);
    expect((await review(owner, { contextType: 'service', contextId: 'nope', rating: 3 })).status).toBe(422);
  });

  it('does not accept kinds of service that are not built yet', async () => {
    const res = await review(owner, { contextType: 'recycling', contextId: String(listing._id), rating: 5 });
    expect(res.status).toBe(422);
  });

  it('averages several reviews', async () => {
    const second = await makeUser('user', { name: 'Ben Carter' });
    const a = await makeRequest(owner);
    const b = await makeRequest(second);
    await review(owner, { contextType: 'service', contextId: String(a._id), rating: 5 });
    await review(second, { contextType: 'service', contextId: String(b._id), rating: 4 });
    expect(await ratingOf()).toMatchObject({ ratingAvg: 4.5, ratingCount: 2 });
  });
});

describe('rating recomputation', () => {
  it('ignores hidden reviews', async () => {
    const second = await makeUser('user');
    const a = await makeRequest(owner);
    const b = await makeRequest(second);
    await review(owner, { contextType: 'service', contextId: String(a._id), rating: 5 });
    await review(second, { contextType: 'service', contextId: String(b._id), rating: 1 });
    expect(await ratingOf()).toMatchObject({ ratingAvg: 3, ratingCount: 2 });
    await Review.updateOne({ reviewer: second.id }, { $set: { status: 'hidden' } });
    await reviewService.recomputeRating(tech.id, 'technician');
    expect(await ratingOf()).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
    await Review.updateMany({}, { $set: { status: 'removed' } });
    await reviewService.recomputeRating(tech.id, 'technician');
    expect(await ratingOf()).toMatchObject({ ratingAvg: 0, ratingCount: 0 });
  });
});

describe('GET /api/reviews', () => {
  it('lists the visible reviews of a provider publicly with a summary', async () => {
    const second = await makeUser('user', { name: 'Ben Carter' });
    const a = await makeRequest(owner);
    const b = await makeRequest(second);
    await review(owner, { contextType: 'service', contextId: String(a._id), rating: 5, comment: 'Great' });
    await review(second, { contextType: 'service', contextId: String(b._id), rating: 3 });
    await Review.updateOne({ reviewer: second.id }, { $set: { status: 'hidden' } });

    const res = await request(app).get('/api/reviews').query({ target: tech.id });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ rating: 5, comment: 'Great', reviewer: { name: 'Asha R.' } });
    expect(res.body.meta.summary).toMatchObject({ average: 5, count: 1, distribution: { 5: 1, 3: 0 } });
    const json = JSON.stringify(res.body);
    expect(json).not.toContain('@test.local');
    expect(json).not.toContain(owner.id); // reviewers are not identifiable by id
  });

  it('requires a valid target', async () => {
    expect((await request(app).get('/api/reviews')).status).toBe(422);
    expect((await request(app).get('/api/reviews').query({ target: 'x' })).status).toBe(422);
  });

  it('returns an empty summary for a provider with no reviews', async () => {
    const res = await request(app).get('/api/reviews').query({ target: tech.id });
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.summary).toMatchObject({ average: 0, count: 0 });
  });
});

'use strict';
require('./helpers/env');
const mongoose = require('mongoose');
const db = require('./helpers/db');
const { makeUser, seedCategories } = require('./helpers/factories');
const M = require('../src/models');

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(db.clear);

const EXPECTED = [
  'User', 'UserProfile', 'Device', 'DeviceListing', 'ServiceRequest', 'TechnicianProfile',
  'RefurbisherProfile', 'RecyclingCenter', 'VerificationDocument', 'Quotation', 'Donation', 'DonationRequest',
  'MarketplaceProduct', 'Order', 'Transaction', 'PickupSchedule', 'Conversation', 'Message', 'Notification',
  'Review', 'RecyclingRecord', 'EnvironmentalImpact', 'Complaint', 'AdminLog',
  // added during design (requirements §8.2)
  'Category', 'RefreshToken', 'Report', 'DeviceToken', 'Announcement', 'EducationArticle', 'RefurbishmentJob',
  'WantedRequest', 'WantedResponse',
];

describe('model registry', () => {
  it('registers every collection', () => {
    expect(Object.keys(M).sort()).toEqual([...EXPECTED].sort());
    expect(EXPECTED).toHaveLength(33);
  });
});

describe('model rules', () => {
  it('never serialises password hashes', async () => {
    const u = await makeUser('user');
    const stored = await M.User.findById(u.id).select('+passwordHash');
    expect(stored.passwordHash).toBeDefined();
    expect(JSON.stringify(stored.toJSON())).not.toMatch(/passwordHash/);
    expect((await M.User.findById(u.id)).passwordHash).toBeUndefined(); // select:false
  });

  it('enforces unique email (case-insensitive via lowercase)', async () => {
    await makeUser('user', { email: 'dup@test.local' });
    await expect(makeUser('user', { email: 'DUP@test.local' })).rejects.toThrow(/duplicate|E11000/i);
  });

  it('one review per transaction and whole-number ratings (BR-04)', async () => {
    const a = await makeUser('user'); const b = await makeUser('technician');
    const ctx = new mongoose.Types.ObjectId();
    const r = { reviewer: a.id, target: b.id, targetRole: 'technician', contextType: 'service', contextId: ctx, rating: 5 };
    await M.Review.create(r);
    await expect(M.Review.create(r)).rejects.toThrow(/duplicate|E11000/i);
    await expect(M.Review.create({ ...r, contextId: new mongoose.Types.ObjectId(), rating: 4.5 })).rejects.toThrow(/whole number/i);
  });

  it('admin audit log is insert-only', async () => {
    const admin = await makeUser('admin');
    const log = await M.AdminLog.create({ admin: admin.id, action: 'user.suspend' });
    await expect(M.AdminLog.updateOne({ _id: log._id }, { action: 'tampered' })).rejects.toThrow(/insert-only/);
    await expect(M.AdminLog.deleteMany({})).rejects.toThrow(/insert-only/);
    log.action = 'tampered';
    await expect(log.save()).rejects.toThrow(/insert-only/);
  });

  it('conversations need two distinct participants and are unique per context', async () => {
    const a = await makeUser('user'); const b = await makeUser('technician');
    const ctx = new mongoose.Types.ObjectId();
    await expect(M.Conversation.create({ participants: [a.id, a.id], contextType: 'service', contextId: ctx })).rejects.toThrow(/participants/i);
    await M.Conversation.create({ participants: [a.id, b.id], contextType: 'service', contextId: ctx });
    await expect(M.Conversation.create({ participants: [b.id, a.id], contextType: 'service', contextId: ctx })).rejects.toThrow(/duplicate|E11000/i);
  });

  it('impact events are idempotent per referenced activity', async () => {
    const u = await makeUser('user'); const ref = new mongoose.Types.ObjectId();
    const e = { user: u.id, type: 'repair', refType: 'ServiceRequest', refId: ref };
    await M.EnvironmentalImpact.create(e);
    await expect(M.EnvironmentalImpact.create(e)).rejects.toThrow(/duplicate|E11000/i);
  });

  it('keeps actual and estimated recycled weights in separate fields (BR-06)', async () => {
    const u = await makeUser('user'); const c = await makeUser('recycler');
    const cats = await seedCategories();
    const center = await M.RecyclingCenter.create({ user: c.id, name: 'Test centre', acceptedCategories: [cats.laptop._id] });
    const rec = await M.RecyclingRecord.create({ requester: u.id, center: center._id, materials: [{ type: 'copper', actualKg: 1.2, estimatedKg: 2 }] });
    expect(rec.materials[0].actualKg).toBe(1.2);
    expect(rec.materials[0].estimatedKg).toBe(2);
  });

  it('marketplace products are always labelled refurbished and the flag is immutable', async () => {
    const s = await makeUser('refurbisher'); const cats = await seedCategories();
    const p = await M.MarketplaceProduct.create({ seller: s.id, title: 'Refurb laptop', category: cats.laptop._id, condition: 'good', refurbishmentInfo: 'New SSD and battery', price: 15000 });
    expect(p.isRefurbished).toBe(true);
    p.isRefurbished = false;
    await p.save();
    expect((await M.MarketplaceProduct.findById(p._id)).isRefurbished).toBe(true);
  });

  it('soft-deleted records are hidden from queries by default', async () => {
    const u = await makeUser('user'); const cats = await seedCategories();
    const d = await M.Device.create({ owner: u.id, name: 'Old phone', category: cats.smartphone._id });
    await d.softDelete();
    expect(await M.Device.countDocuments({ owner: u.id })).toBe(0);
    expect(await M.Device.countDocuments({ owner: u.id }).setOptions({ withDeleted: true })).toBe(1);
  });
});

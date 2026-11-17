'use strict';
require('./helpers/env');
const mongoose = require('mongoose');
const db = require('./helpers/db');
const reminders = require('../src/services/reminderService');
const scheduler = require('../src/jobs/scheduler');
const { reschedule } = require('../src/services/pickupRules');
const PickupSchedule = require('../src/models/PickupSchedule');
const Notification = require('../src/models/Notification');
const { makeUser } = require('./helpers/factories');

const H = 3600 * 1000;
let a; let b; let now;

const pickup = (over = {}) => PickupSchedule.create({
  contextType: 'recycling', contextId: new mongoose.Types.ObjectId(), requester: a.id, provider: b.id,
  date: new Date(now.getTime() + 20 * H), status: 'confirmed', timeSlot: '10:00-12:00', timeSetAt: new Date(now.getTime() - 3 * 24 * H), ...over,
});
const notes = (user, type = 'pickup.reminder') => Notification.find({ user: user.id, type }).lean();

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  now = new Date();
  a = await makeUser('user');
  b = await makeUser('recycler');
});

describe('pickup reminders', () => {
  it('sends the day-before reminder to both people, once', async () => {
    const p = await pickup();
    expect(await reminders.sendDue(now)).toEqual({ day: 1, hour: 0 });
    for (const who of [a, b]) {
      const [n] = await notes(who);
      expect(n).toMatchObject({ title: 'Pickup tomorrow' });
      expect(n.body).toMatch(/^Recycling pickup: .*\(10:00-12:00\)$/);
      expect(n.data).toMatchObject({ id: String(p.contextId), pickupId: String(p._id), deepLink: `/dashboard/recycling/${p.contextId}` });
    }
    expect(await reminders.sendDue(now)).toEqual({ day: 0, hour: 0 });
    expect(await Notification.countDocuments({ type: 'pickup.reminder' })).toBe(2);
  });

  it('sends the two-hour reminder when the time is near, after the day one', async () => {
    await pickup();
    await reminders.sendDue(now);
    const later = new Date(now.getTime() + 19 * H); // one hour before the pickup
    expect(await reminders.sendDue(later)).toEqual({ day: 0, hour: 1 });
    const titles = (await notes(a)).map((n) => n.title).sort();
    expect(titles).toEqual(['Pickup in about two hours', 'Pickup tomorrow']);
  });

  it('does nothing early, late, or for a pickup that is not confirmed', async () => {
    await pickup({ date: new Date(now.getTime() + 40 * H) }); // too far away
    await pickup({ date: new Date(now.getTime() - 1 * H) }); // already past
    for (const status of ['requested', 'rescheduled', 'collected', 'cancelled']) await pickup({ status });
    expect(await reminders.sendDue(now)).toEqual({ day: 0, hour: 0 });
    expect(await Notification.countDocuments()).toBe(0);
  });

  it('does not remind about a time that was set with too little notice to be useful', async () => {
    await pickup({ timeSetAt: new Date(now.getTime() - 2 * H) }); // set two hours ago for tomorrow: they know
    expect(await reminders.sendDue(now)).toEqual({ day: 0, hour: 0 });
    // But a pickup set a day ahead still gets the hour-before one.
    const p = await pickup({ date: new Date(now.getTime() + 1 * H), timeSetAt: new Date(now.getTime() - 20 * H) });
    expect(await reminders.sendDue(now)).toEqual({ day: 0, hour: 1 });
    expect((await PickupSchedule.findById(p._id)).reminders.hour).toBeTruthy();
    // And one set only an hour ago for in an hour gets none.
    await PickupSchedule.deleteMany({});
    await pickup({ date: new Date(now.getTime() + 1 * H), timeSetAt: new Date(now.getTime() - 1 * H) });
    expect(await reminders.sendDue(now)).toEqual({ day: 0, hour: 0 });
  });

  it('uses the creation time for an older pickup that has no "time set" stamp', async () => {
    const p = await pickup();
    await PickupSchedule.collection.updateOne({ _id: p._id }, { $unset: { timeSetAt: '' } });
    await PickupSchedule.collection.updateOne({ _id: p._id }, { $set: { createdAt: new Date(now.getTime() - 5 * 24 * H) } });
    expect((await reminders.sendDue(now)).day).toBe(1);
  });

  it('starts again when the time is changed', async () => {
    const p = await pickup();
    await reminders.sendDue(now);
    const doc = await PickupSchedule.findById(p._id);
    await reschedule(doc, { date: new Date(now.getTime() + 22 * H), timeSlot: '14:00-16:00' }, 'pickup', a.id);
    let fresh = await PickupSchedule.findById(p._id);
    expect(fresh.reminders?.day).toBeUndefined();
    expect(fresh.status).toBe('rescheduled');
    expect(await reminders.sendDue(now)).toEqual({ day: 0, hour: 0 }); // not confirmed yet, and set with too little notice anyway
    await PickupSchedule.updateOne({ _id: p._id }, { $set: { status: 'confirmed', timeSetAt: new Date(now.getTime() - 3 * 24 * H) } });
    expect((await reminders.sendDue(now)).day).toBe(1);
    fresh = await PickupSchedule.findById(p._id);
    expect(fresh.reminders.day).toBeTruthy();
  });

  it('never sends one twice when two runs happen together', async () => {
    await pickup();
    const [x, y] = await Promise.all([reminders.sendDue(now), reminders.sendDue(now)]);
    expect(x.day + y.day).toBe(1);
    expect(await Notification.countDocuments({ type: 'pickup.reminder', user: a.id })).toBe(1);
  });

  it('carries on past one bad pickup', async () => {
    await pickup({ contextType: 'service', contextId: new mongoose.Types.ObjectId(), requester: new mongoose.Types.ObjectId(), provider: b.id });
    await pickup();
    expect((await reminders.sendDue(now)).day).toBe(2);
  });
});

describe('the scheduler', () => {
  it('runs each job, reports what they did, and keeps going when one fails', async () => {
    const calls = [];
    const jobs = [{ name: 'one', run: async () => { calls.push('one'); return { ok: 1 }; } }, { name: 'bad', run: async () => { calls.push('bad'); throw new Error('boom'); } }, { name: 'three', run: async () => { calls.push('three'); return 3; } }];
    expect(await scheduler.tick(jobs)).toEqual({ one: { ok: 1 }, bad: { failed: true }, three: 3 });
    expect(calls).toEqual(['one', 'bad', 'three']);
  });

  it('does not start a run while the last one is still going', async () => {
    let release;
    const slow = [{ name: 'slow', run: () => new Promise((resolve) => { release = () => resolve('done'); }) }];
    const first = scheduler.tick(slow);
    expect(await scheduler.tick(slow)).toEqual({ skipped: true });
    release();
    expect(await first).toEqual({ slow: 'done' });
    expect(await scheduler.tick([{ name: 'again', run: async () => 1 }])).toEqual({ again: 1 }); // free again afterwards
  });

  it('starts once, and stops', () => {
    jest.useFakeTimers();
    scheduler.start({ intervalMs: 1000, firstRunMs: 10 });
    scheduler.start({ intervalMs: 1000, firstRunMs: 10 });
    expect(jest.getTimerCount()).toBe(2); // the repeating timer and the first run, not doubled
    scheduler.stop();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    scheduler.stop();
  });

  it('is part of the running server unless switched off, and has the reminders job', () => {
    expect(scheduler.JOBS.map((j) => j.name)).toEqual(['pickup reminders']);
    expect(require('../src/config/env').SCHEDULER_ENABLED).toBe(true);
  });
});
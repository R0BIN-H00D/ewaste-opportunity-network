'use strict';
require('./helpers/env');
const request = require('supertest');
const mongoose = require('mongoose');
const createApp = require('../src/app');
const db = require('./helpers/db');
const { makeUser, makeTechnician, authHeader, seedCategories } = require('./helpers/factories');
const LearningOpportunity = require('../src/models/LearningOpportunity');
const StudentApplication = require('../src/models/StudentApplication');
const StudentProfile = require('../src/models/StudentProfile');
const Notification = require('../src/models/Notification');
const Certificate = require('../src/models/Certificate');
const learningService = require('../src/services/learningService');
const workflow = require('../src/services/workflow/learning');

const app = createApp();
const S = '/api/students';
let cats; let tech; let tech2; let student; let student2; let admin;

const days = (n) => new Date(Date.now() + n * 24 * 3600 * 1000);
const call = (method, url, user, body) => {
  const r = request(app)[method](url);
  if (user) r.set(authHeader(user));
  return body === undefined ? r : r.send(body);
};

async function makeStudent(extra = {}, status = 'approved') {
  const u = await makeUser('student', extra);
  await StudentProfile.create({ user: u.id, college: 'Demo Institute', course: 'B.E. Electronics', yearOfStudy: 3, verification: { status } });
  return u;
}

const payload = (over = {}) => ({
  title: 'Diagnose a laptop that will not power on',
  description: 'Test the charger and power rail with the technician.',
  deviceTypeId: String(cats.laptop._id),
  requiredSkills: ['Multimeter', 'multimeter', 'Soldering basics'],
  difficulty: 'beginner',
  locationArea: 'Indiranagar',
  deadline: days(10).toISOString(),
  seats: 1,
  expectedHours: 4,
  supervisionAcknowledged: true,
  ...over,
});
const post = async (user = tech, over) => (await call('post', `${S}/opportunities`, user, payload(over))).body.data;
const apply = (user, opportunityId, message) => call('post', `${S}/applications`, user, { opportunityId, ...(message ? { message } : {}) });
const decide = (id, decision, user = tech, feedback) => call('put', `${S}/applications/${id}/decision`, user, { decision, ...(feedback ? { feedback } : {}) });
const start = (id, user = tech) => call('post', `${S}/applications/${id}/start`, user);
const complete = (id, body = { hours: 5, feedback: 'Worked carefully' }, user = tech) => call('put', `${S}/applications/${id}/complete`, user, body);

/** Posts an opportunity and has `student` apply; returns both ids. */
async function applied(over, who = student) {
  const opp = await post(tech, over);
  const res = await apply(who, opp._id);
  return { opp, appId: res.body.data._id };
}
async function toInProgress(over, who = student) {
  const x = await applied(over, who);
  await decide(x.appId, 'accepted');
  await start(x.appId);
  return x;
}

beforeAll(db.connect);
afterAll(db.disconnect);
beforeEach(async () => {
  await db.clear();
  cats = await seedCategories();
  tech = await makeTechnician({ user: { name: 'Ravi Kumar' } });
  tech2 = await makeTechnician();
  student = await makeStudent({ name: 'Meera Nair' });
  student2 = await makeStudent({ name: 'Arjun Das' });
  admin = await makeUser('admin');
});

describe('learning workflow rules (pure)', () => {
  it('lets only the supervisor decide, start and complete, and only the student withdraw', () => {
    expect(workflow.canTransition('applied', 'accepted', 'supervisor')).toBe(true);
    expect(workflow.canTransition('applied', 'accepted', 'student')).toBe(false);
    expect(workflow.canTransition('accepted', 'in_progress', 'supervisor')).toBe(true);
    expect(workflow.canTransition('in_progress', 'completed', 'student')).toBe(false);
    expect(workflow.canTransition('accepted', 'completed', 'supervisor')).toBe(false);
    expect(workflow.canTransition('completed', 'withdrawn', 'student')).toBe(false);
    expect(() => workflow.assertTransition('completed', 'rejected', 'supervisor')).toThrow(/cannot move/);
  });

  it('offers actions by role', () => {
    expect(workflow.availableActions({ status: 'applied' }, 'supervisor')).toEqual(['accept', 'reject']);
    expect(workflow.availableActions({ status: 'accepted' }, 'supervisor')).toEqual(['start', 'reject']);
    expect(workflow.availableActions({ status: 'in_progress' }, 'supervisor')).toEqual(['complete']);
    expect(workflow.availableActions({ status: 'completed' }, 'supervisor')).toEqual([]);
    expect(workflow.availableActions({ status: 'applied' }, 'student')).toEqual(['withdraw']);
    expect(workflow.availableActions({ status: 'completed' }, 'student')).toEqual([]);
  });

  it('says why a student cannot apply, first reason first', () => {
    const opp = { status: 'open', seats: 1, deadline: days(2) };
    const base = { studentVerified: true, existing: null, seatsTaken: 0 };
    expect(workflow.applyBlock(opp, base)).toBeNull();
    expect(workflow.applyBlock(opp, { ...base, studentVerified: false })).toBe('not_verified');
    expect(workflow.applyBlock(opp, { ...base, existing: { status: 'applied' } })).toBe('already_applied');
    expect(workflow.applyBlock(opp, { ...base, existing: { status: 'withdrawn' } })).toBeNull();
    expect(workflow.applyBlock({ ...opp, status: 'closed' }, base)).toBe('closed');
    expect(workflow.applyBlock(opp, { ...base, seatsTaken: 1 })).toBe('filled');
    expect(workflow.applyBlock({ ...opp, deadline: days(-1) }, base)).toBe('deadline_passed');
  });
});

describe('posting an opportunity', () => {
  it('lets a verified technician post a supervised task with no hazardous handling', async () => {
    const res = await call('post', `${S}/opportunities`, tech, payload());
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      title: 'Diagnose a laptop that will not power on', status: 'open', seats: 1, seatsLeft: 1, supervised: true, hazardousExcluded: true, viewerRole: 'supervisor',
      supervisor: { name: 'Ravi Kumar' }, deviceType: { slug: 'laptop' }, locationArea: 'Indiranagar',
    });
    // Skills are stored lower-case and without duplicates.
    expect(res.body.data.requiredSkills).toEqual(['multimeter', 'soldering basics']);
  });

  it('is only for verified technicians', async () => {
    expect((await call('post', `${S}/opportunities`, null, payload())).status).toBe(401);
    expect((await call('post', `${S}/opportunities`, student, payload())).status).toBe(403);
    expect((await call('post', `${S}/opportunities`, admin, payload())).status).toBe(403);
    const pending = await makeTechnician({ profile: { verification: { status: 'pending' } } });
    const res = await call('post', `${S}/opportunities`, pending, payload());
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_VERIFIED');
  });

  it('checks the fields', async () => {
    const res = await call('post', `${S}/opportunities`, tech, payload({ title: 'Hi', deadline: days(-1).toISOString(), seats: 0, locationArea: '', supervisionAcknowledged: false }));
    expect(res.status).toBe(422);
    const fields = res.body.errors.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['body.title', 'body.deadline', 'body.seats', 'body.locationArea', 'body.supervisionAcknowledged']));
    expect((await call('post', `${S}/opportunities`, tech, payload({ deviceTypeId: undefined }))).status).toBe(422);
  });

  it('cannot be told to allow hazardous handling (BR-07)', async () => {
    const res = await call('post', `${S}/opportunities`, tech, payload({ hazardousExcluded: false }));
    expect(res.status).toBe(422);
    expect(await LearningOpportunity.countDocuments()).toBe(0);
    // The model refuses it too.
    await expect(LearningOpportunity.create({ postedBy: tech.id, title: 'x'.repeat(6), deadline: days(3), hazardousExcluded: false })).rejects.toThrow(/hazardous/i);
  });

  it('refuses hazardous device types (BR-07)', async () => {
    for (const slug of ['monitor', 'television', 'battery', 'circuit-boards']) {
      const res = await call('post', `${S}/opportunities`, tech, payload({ deviceTypeId: String(cats[slug]._id) }));
      expect(res.status).toBe(422);
      expect(res.body.errors[0].field).toBe('deviceTypeId');
      expect(res.body.errors[0].message).toMatch(/hazardous/i);
    }
    expect(await LearningOpportunity.countDocuments()).toBe(0);
  });
});

describe('the public feed', () => {
  it('is open to visitors and lists only open opportunities that are still taking applications', async () => {
    const open = await post(tech, { title: 'Open task for everyone' });
    const closed = await post(tech, { title: 'Closed task nobody sees' });
    await call('put', `${S}/opportunities/${closed._id}/status`, tech, { status: 'closed' });
    await LearningOpportunity.create({ postedBy: tech.id, title: 'Task whose deadline passed', deviceType: cats.laptop._id, deadline: days(-2), locationArea: 'Jayanagar' });
    const res = await call('get', `${S}/opportunities`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((o) => o._id)).toEqual([open._id]);
    expect(res.body.meta.total).toBe(1);
    expect(res.body.data[0].viewerRole).toBeNull();
    expect(res.body.data[0].counts).toBeUndefined();
  });

  it('filters by difficulty, device type, skill and text', async () => {
    await post(tech, { title: 'Phone screen swap', deviceTypeId: String(cats.smartphone._id), difficulty: 'intermediate', requiredSkills: ['screen repair'] });
    await post(tech, { title: 'Laptop power fault', difficulty: 'beginner', requiredSkills: ['multimeter'] });
    const ids = async (q) => (await call('get', `${S}/opportunities?${q}`)).body.data.map((o) => o.title);
    expect(await ids('difficulty=intermediate')).toEqual(['Phone screen swap']);
    expect(await ids('category=laptop')).toEqual(['Laptop power fault']);
    expect(await ids('category=no-such-slug')).toEqual([]);
    expect(await ids('skill=Multimeter')).toEqual(['Laptop power fault']);
    expect(await ids('q=screen')).toEqual(['Phone screen swap']);
    expect((await call('get', `${S}/opportunities?difficulty=expert`)).status).toBe(422);
  });

  it('shows a student their own application and whether they can apply', async () => {
    const unverified = await makeStudent({}, 'pending');
    const opp = await post();
    await apply(student, opp._id);
    const mine = (await call('get', `${S}/opportunities`, student)).body.data[0];
    expect(mine).toMatchObject({ viewerRole: 'student', myApplication: { status: 'applied' }, applyBlock: 'already_applied' });
    const other = (await call('get', `${S}/opportunities`, student2)).body.data[0];
    expect(other).toMatchObject({ myApplication: null, applyBlock: null });
    const waiting = (await call('get', `${S}/opportunities`, unverified)).body.data[0];
    expect(waiting.applyBlock).toBe('not_verified');
  });

  it('shows one opportunity to anyone, with the application counts only to its supervisor', async () => {
    const opp = await post();
    await apply(student, opp._id);
    const visitor = await call('get', `${S}/opportunities/${opp._id}`);
    expect(visitor.status).toBe(200);
    expect(visitor.body.data.counts).toBeUndefined();
    expect(JSON.stringify(visitor.body)).not.toMatch(/@test\.local/);
    const owner = await call('get', `${S}/opportunities/${opp._id}`, tech);
    expect(owner.body.data.counts).toEqual({ applied: 1 });
    expect((await call('get', `${S}/opportunities/000000000000000000000000`)).status).toBe(404);
    expect((await call('get', `${S}/opportunities/not-an-id`)).status).toBe(404);
  });
});

describe('managing my opportunities', () => {
  it('lists my own, including closed ones', async () => {
    const a = await post(tech, { title: 'First task here' });
    await post(tech2, { title: 'Someone else task' });
    await call('put', `${S}/opportunities/${a._id}/status`, tech, { status: 'closed' });
    const res = await call('get', `${S}/opportunities/mine`, tech);
    expect(res.body.data.map((o) => o.title)).toEqual(['First task here']);
    expect(res.body.data[0].status).toBe('closed');
    expect((await call('get', `${S}/opportunities/mine`, student)).status).toBe(403);
    expect((await call('get', `${S}/opportunities/mine?status=open`, tech)).body.data).toEqual([]);
  });

  it('can be edited only by the technician who posted it', async () => {
    const opp = await post();
    const res = await call('put', `${S}/opportunities/${opp._id}`, tech, { title: 'A better title for it', seats: 3, difficulty: 'advanced' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ title: 'A better title for it', seats: 3, seatsLeft: 3, difficulty: 'advanced' });
    expect((await call('put', `${S}/opportunities/${opp._id}`, tech2, { title: 'Hijacked title here' })).status).toBe(404);
    expect((await call('put', `${S}/opportunities/${opp._id}`, tech, {})).status).toBe(422);
    expect((await call('put', `${S}/opportunities/${opp._id}`, tech, { deviceTypeId: String(cats.battery._id) })).status).toBe(422);
  });

  it('will not cut the seats below the places already taken', async () => {
    const { opp, appId } = await applied({ seats: 2 });
    await decide(appId, 'accepted');
    const res = await call('put', `${S}/opportunities/${opp._id}`, tech, { seats: 0 });
    expect(res.status).toBe(422);
    const keep = await call('put', `${S}/opportunities/${opp._id}`, tech, { seats: 1 });
    expect(keep.status).toBe(200);
    expect(keep.body.data.status).toBe('filled');
  });

  it('closing turns pending applications down and tells the students; reopening needs a future deadline', async () => {
    const { opp, appId } = await applied();
    const closed = await call('put', `${S}/opportunities/${opp._id}/status`, tech, { status: 'closed' });
    expect(closed.body.data.status).toBe('closed');
    expect((await StudentApplication.findById(appId)).status).toBe('rejected');
    expect(await Notification.countDocuments({ user: student.id, type: 'learning.rejected' })).toBe(1);
    const reopened = await call('put', `${S}/opportunities/${opp._id}/status`, tech, { status: 'open' });
    expect(reopened.body.data.status).toBe('open');
    await call('put', `${S}/opportunities/${opp._id}/status`, tech, { status: 'closed' });
    await LearningOpportunity.updateOne({ _id: opp._id }, { $set: { deadline: days(-1) } });
    const late = await call('put', `${S}/opportunities/${opp._id}/status`, tech, { status: 'open' });
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('DEADLINE_PASSED');
    expect((await call('put', `${S}/opportunities/${opp._id}/status`, tech2, { status: 'closed' })).status).toBe(404);
  });
});

describe('applying', () => {
  it('lets a verified student apply and tells the supervisor', async () => {
    const opp = await post();
    const res = await apply(student, opp._id, 'I have fixed a few chargers before.');
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ status: 'applied', message: 'I have fixed a few chargers before.', viewerRole: 'student', actions: ['withdraw'], opportunity: { title: opp.title } });
    const note = await Notification.findOne({ user: tech.id, type: 'learning.applied' });
    expect(note.body).toMatch(/Meera Nair/);
  });

  it('is only for verified students (BR-01)', async () => {
    const opp = await post();
    expect((await apply(null, opp._id)).status).toBe(401);
    expect((await apply(tech, opp._id)).status).toBe(403);
    expect((await apply(admin, opp._id)).status).toBe(403);
    const pending = await makeStudent({}, 'pending');
    const res = await apply(pending, opp._id);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('NOT_VERIFIED');
    const rejected = await makeStudent({}, 'rejected');
    expect((await apply(rejected, opp._id)).body.code).toBe('NOT_VERIFIED');
    expect(await StudentApplication.countDocuments()).toBe(0);
  });

  it('checks the input', async () => {
    expect((await call('post', `${S}/applications`, student, { opportunityId: 'nope' })).status).toBe(422);
    expect((await call('post', `${S}/applications`, student, { opportunityId: '000000000000000000000000' })).status).toBe(404);
    const opp = await post();
    expect((await call('post', `${S}/applications`, student, { opportunityId: opp._id, message: 'x'.repeat(501) })).status).toBe(422);
  });

  it('refuses a second application, a closed opportunity, a full one and a late one', async () => {
    const opp = await post();
    await apply(student, opp._id);
    const twice = await apply(student, opp._id);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('ALREADY_APPLIED');

    const closed = await post(tech, { title: 'A closed task here' });
    await call('put', `${S}/opportunities/${closed._id}/status`, tech, { status: 'closed' });
    expect((await apply(student2, closed._id)).body.code).toBe('CLOSED');

    const late = await LearningOpportunity.create({ postedBy: tech.id, title: 'A late task here', deviceType: cats.laptop._id, deadline: days(-1), locationArea: 'X' });
    expect((await apply(student2, String(late._id))).body.code).toBe('DEADLINE_PASSED');

    const { opp: full, appId } = await applied({ title: 'A one seat task' });
    await decide(appId, 'accepted');
    const res = await apply(student2, full._id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('FILLED');
  });

  it('lets a student send the application again after withdrawing', async () => {
    const { opp, appId } = await applied();
    const w = await call('post', `${S}/applications/${appId}/withdraw`, student, { reason: 'Exam week' });
    expect(w.body.data.status).toBe('withdrawn');
    const again = await apply(student, opp._id, 'Back again, exams are over.');
    expect(again.status).toBe(201);
    expect(again.body.data).toMatchObject({ _id: appId, status: 'applied', message: 'Back again, exams are over.' });
    expect(await StudentApplication.countDocuments()).toBe(1);
    expect(again.body.data.history.map((h) => h.status)).toEqual(['applied', 'withdrawn', 'applied']);
  });
});

describe('the supervisor decides', () => {
  it('accepts and fills the places, then refuses to accept more', async () => {
    const opp = await post(tech, { seats: 1 });
    const a1 = (await apply(student, opp._id)).body.data._id;
    const a2 = (await apply(student2, opp._id)).body.data._id;
    const ok = await decide(a1, 'accepted', tech, 'Welcome aboard');
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ status: 'accepted', supervisorFeedback: 'Welcome aboard', viewerRole: 'supervisor', actions: ['start', 'reject'] });
    expect((await LearningOpportunity.findById(opp._id)).status).toBe('filled');
    const full = await decide(a2, 'accepted');
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('SEATS_FULL');
    expect((await StudentApplication.findById(a2)).status).toBe('applied');
    expect(await Notification.countDocuments({ user: student.id, type: 'learning.accepted' })).toBe(1);
  });

  it('can turn an application down, and releasing an accepted one frees the place', async () => {
    const opp = await post(tech, { seats: 1 });
    const a1 = (await apply(student, opp._id)).body.data._id;
    const a2 = (await apply(student2, opp._id)).body.data._id;
    const no = await decide(a2, 'rejected', tech, 'Needs more experience');
    expect(no.body.data).toMatchObject({ status: 'rejected', actions: [] });
    await decide(a1, 'accepted');
    expect((await LearningOpportunity.findById(opp._id)).status).toBe('filled');
    await decide(a1, 'rejected', tech, 'Clashing schedule');
    expect((await LearningOpportunity.findById(opp._id)).status).toBe('open');
  });

  it('keeps strangers and students out, and refuses moves that are not allowed', async () => {
    const { appId } = await applied();
    expect((await decide(appId, 'accepted', tech2)).status).toBe(404);
    expect((await decide(appId, 'accepted', student)).status).toBe(403);
    expect((await decide(appId, 'accepted', admin)).status).toBe(403);
    expect((await call('put', `${S}/applications/${appId}/decision`, tech, { decision: 'completed' })).status).toBe(422);
    await decide(appId, 'accepted');
    const again = await decide(appId, 'accepted');
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('INVALID_TRANSITION');
    const pending = await makeTechnician({ profile: { verification: { status: 'pending' } } });
    expect((await decide(appId, 'rejected', pending)).body.code).toBe('NOT_VERIFIED');
  });

  it('shows the supervisor their applicants with college and hours, never contact details', async () => {
    const opp = await post();
    await apply(student, opp._id, 'Keen to learn');
    await apply(student2, opp._id);
    const res = await call('get', `${S}/opportunities/${opp._id}/applications`, tech);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].student).toMatchObject({ college: 'Demo Institute', course: 'B.E. Electronics', yearOfStudy: 3, hoursCompleted: 0 });
    expect(JSON.stringify(res.body)).not.toMatch(/@test\.local/);
    expect((await call('get', `${S}/opportunities/${opp._id}/applications?status=accepted`, tech)).body.data).toEqual([]);
    expect((await call('get', `${S}/opportunities/${opp._id}/applications`, tech2)).status).toBe(404);
    expect((await call('get', `${S}/opportunities/${opp._id}/applications`, student)).status).toBe(403);
    expect((await call('get', `${S}/opportunities/${opp._id}/applications`, admin)).status).toBe(200);
  });
});

describe('supervised work and completion', () => {
  it('moves from accepted to in progress to completed, one step at a time', async () => {
    const { appId } = await applied();
    expect((await start(appId)).status).toBe(409); // not accepted yet
    expect((await complete(appId)).status).toBe(409);
    await decide(appId, 'accepted');
    expect((await complete(appId)).status).toBe(409); // must be started first
    const started = await start(appId);
    expect(started.body.data).toMatchObject({ status: 'in_progress', actions: ['complete'] });
    expect(started.body.data.startedAt).toBeTruthy();
    expect((await start(appId)).status).toBe(409);
    const done = await complete(appId, { hours: 5.5, feedback: 'Careful, methodical work' });
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'completed', hours: 5.5, supervisorFeedback: 'Careful, methodical work', actions: [] });
    expect(done.body.data.history.map((h) => h.status)).toEqual(['applied', 'accepted', 'in_progress', 'completed']);
    expect((await complete(appId)).status).toBe(409); // hours must not be counted twice
  });

  it('only the supervising technician can start and complete', async () => {
    const { appId } = await applied();
    await decide(appId, 'accepted');
    expect((await start(appId, tech2)).status).toBe(404);
    expect((await start(appId, student)).status).toBe(403);
    await start(appId);
    expect((await complete(appId, { hours: 2 }, student)).status).toBe(403);
    expect((await complete(appId, { hours: 2 }, tech2)).status).toBe(404);
  });

  it('checks the hours', async () => {
    const { appId } = await toInProgress();
    for (const hours of [0, 0.1, -3, 201, 'lots']) expect((await complete(appId, { hours })).status).toBe(422);
    expect((await call('put', `${S}/applications/${appId}/complete`, tech, {})).status).toBe(422);
    expect((await StudentApplication.findById(appId)).status).toBe('in_progress');
  });

  it('adds the hours, skills and portfolio entry to the student profile exactly once', async () => {
    const { appId } = await toInProgress({ requiredSkills: ['multimeter', 'soldering basics'] });
    await complete(appId, { hours: 4, feedback: 'Great job' });
    await complete(appId, { hours: 4 }); // refused, must not add again
    const profile = await StudentProfile.findOne({ user: student.id });
    expect(profile.hoursCompleted).toBe(4);
    expect(profile.skills).toEqual(['multimeter', 'soldering basics']);
    expect(profile.portfolio).toHaveLength(1);
    expect(profile.portfolio[0]).toMatchObject({ title: 'Diagnose a laptop that will not power on', description: 'Great job' });
    expect(await Notification.countDocuments({ user: student.id, type: 'learning.completed' })).toBe(1);
  });

  it('lets a student withdraw before completion, which frees the place, but not after', async () => {
    const { opp, appId } = await toInProgress();
    expect((await LearningOpportunity.findById(opp._id)).status).toBe('filled');
    expect((await call('post', `${S}/applications/${appId}/withdraw`, student2, {})).status).toBe(404);
    expect((await call('post', `${S}/applications/${appId}/withdraw`, tech, {})).status).toBe(403);
    const w = await call('post', `${S}/applications/${appId}/withdraw`, student, { reason: 'Family emergency' });
    expect(w.status).toBe(200);
    expect(w.body.data.status).toBe('withdrawn');
    expect((await LearningOpportunity.findById(opp._id)).status).toBe('open');
    expect(await Notification.countDocuments({ user: tech.id, type: 'learning.withdrawn' })).toBe(1);

    const second = await toInProgress({ title: 'Another supervised task' }, student2);
    await complete(second.appId);
    expect((await call('post', `${S}/applications/${second.appId}/withdraw`, student2, {})).status).toBe(409);
  });
});

describe('reading an application', () => {
  it('is visible to the student, the supervising technician and admin only', async () => {
    const { appId } = await applied();
    const asStudent = await call('get', `${S}/applications/${appId}`, student);
    expect(asStudent.body.data).toMatchObject({ viewerRole: 'student', actions: ['withdraw'] });
    const asTech = await call('get', `${S}/applications/${appId}`, tech);
    expect(asTech.body.data).toMatchObject({ viewerRole: 'supervisor', actions: ['accept', 'reject'] });
    expect((await call('get', `${S}/applications/${appId}`, admin)).body.data.viewerRole).toBe('admin');
    expect((await call('get', `${S}/applications/${appId}`, student2)).status).toBe(404);
    expect((await call('get', `${S}/applications/${appId}`, tech2)).status).toBe(404);
    expect((await call('get', `${S}/applications/${appId}`)).status).toBe(401);
    expect((await call('get', `${S}/applications/bad-id`, student)).status).toBe(404);
  });

  it('lists a student their own applications, newest first, with a status filter', async () => {
    const a = await applied({ title: 'First supervised task' });
    const b = await applied({ title: 'Second supervised task' });
    await applied({ title: 'Task for another student' }, student2);
    await decide(b.appId, 'accepted');
    const all = await call('get', `${S}/applications`, student);
    expect(all.body.data.map((x) => x.opportunity.title)).toEqual(['Second supervised task', 'First supervised task']);
    expect(all.body.meta.total).toBe(2);
    expect((await call('get', `${S}/applications?status=accepted`, student)).body.data.map((x) => x._id)).toEqual([b.appId]);
    expect(a.appId).toBeTruthy();
    expect((await call('get', `${S}/applications`, tech)).status).toBe(403);
    expect((await call('get', `${S}/applications?status=bogus`, student)).status).toBe(422);
  });
});

describe('experience and certificates', () => {
  it('builds the experience history from completed tasks only', async () => {
    const a = await toInProgress({ title: 'First finished task', requiredSkills: ['multimeter'] });
    await complete(a.appId, { hours: 3, feedback: 'Solid' });
    const b = await toInProgress({ title: 'Second finished task', requiredSkills: ['soldering basics'] });
    await complete(b.appId, { hours: 2.5 });
    await applied({ title: 'Still only applied' });
    const res = await call('get', `${S}/experience`, student);
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toMatchObject({ completedCount: 2, totalHours: 5.5, college: 'Demo Institute' });
    expect(res.body.data.summary.skills.sort()).toEqual(['multimeter', 'soldering basics']);
    expect(res.body.data.items.map((i) => i.opportunity.title)).toEqual(['Second finished task', 'First finished task']);
    expect(res.body.data.items[0].certificate).toBeNull();
    expect((await call('get', `${S}/experience`, tech)).status).toBe(403);
    expect((await call('get', `${S}/experience`)).status).toBe(401);
  });

  it('issues a certificate for a completed task once, and the student can list it', async () => {
    const { appId } = await toInProgress();
    await expect(learningService.issueCertificate(admin, appId)).rejects.toMatchObject({ code: 'NOT_COMPLETED' });
    await complete(appId, { hours: 6 });
    const cert = await learningService.issueCertificate(admin, appId);
    expect(cert.certNo).toMatch(/^CERT-\d{4}-[0-9A-F]{6}$/);
    await expect(learningService.issueCertificate(admin, appId)).rejects.toMatchObject({ code: 'ALREADY_ISSUED' });
    expect(await Certificate.countDocuments()).toBe(1);
    const list = await call('get', `${S}/certificates`, student);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({ certNo: cert.certNo, application: { hours: 6, opportunity: { title: 'Diagnose a laptop that will not power on' } } });
    expect((await call('get', `${S}/certificates`, student2)).body.data).toEqual([]);
    const exp = await call('get', `${S}/experience`, student);
    expect(exp.body.data.items[0].certificate).toBe(cert.certNo);
    expect(exp.body.data.items[0].certificateId).toBe(String(cert._id));
    expect(await Notification.countDocuments({ user: student.id, type: 'learning.certificate' })).toBe(1);
  });
});

describe('certificate PDF and verification', () => {
  const binary = (res, cb) => { res.setEncoding('binary'); let d = ''; res.on('data', (x) => { d += x; }); res.on('end', () => cb(null, Buffer.from(d, 'binary'))); };
  const issue = async (over = {}) => {
    const { appId } = await toInProgress(over);
    await complete(appId, { hours: 6 });
    return learningService.issueCertificate(admin, appId);
  };
  const pdf = (id, user) => { const r = request(app).get(`${S}/certificates/${id}/pdf`).buffer(true).parse(binary); if (user) r.set(authHeader(user)); return r; };

  it('gives the student a PDF with the certificate ID, the task, the hours and both signatories', async () => {
    const cert = await issue();
    const res = await pdf(cert._id, student);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe(`attachment; filename="certificate-${cert.certNo}.pdf"`);
    expect(res.headers['cache-control']).toContain('no-store');
    const text = res.body.toString('latin1');
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain(`Certificate ID: ${cert.certNo}`);
    expect(text).toContain('Diagnose a laptop that will not power on');
    expect(text).toContain('6 hours');
    expect(text).toContain('Ravi Kumar');
    expect(text).toContain('Meera Nair');
  });

  it('has a table of contents that points at every object', async () => {
    const cert = await issue();
    const text = (await pdf(cert._id, student)).body.toString('latin1');
    const start = Number(/startxref\n(\d+)\n%%EOF/.exec(text)[1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const rows = text.slice(start).split('\n').filter((l) => /^\d{10} 00000 n $/.test(l));
    expect(rows).toHaveLength(6);
    rows.forEach((row, i) => expect(text.slice(Number(row.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true));
    const length = Number(/\/Length (\d+)/.exec(text)[1]);
    const body = text.slice(text.indexOf('stream\n') + 7);
    expect(body.slice(length).startsWith('\nendstream')).toBe(true);
  });

  it('lets an administrator download it but nobody else, and says "not found" rather than "forbidden"', async () => {
    const cert = await issue();
    expect((await pdf(cert._id, admin)).status).toBe(200);
    expect((await pdf(cert._id, student2)).status).toBe(404);
    expect((await pdf(cert._id, tech)).status).toBe(403);
    expect((await pdf(cert._id)).status).toBe(401);
    expect((await pdf(new mongoose.Types.ObjectId(), student)).status).toBe(404);
    expect((await pdf('not-an-id', student)).status).toBe(404);
  });

  it('keeps brackets, backslashes and unusual characters from breaking the file', async () => {
    const { buildCertificatePdf } = require('../src/services/certificatePdf');
    const buf = buildCertificatePdf({ certNo: 'CERT-2026-ABC123', studentName: 'A (B) \\ Cé रा', title: 'Fix ) a ( thing', hours: 1, issuedAt: new Date() });
    const text = buf.toString('latin1');
    expect(text).toContain('A \\(B\\) \\\\ C\xe9 ??');
    expect(text).toContain('Fix \\) a \\( thing');
    expect(text).toContain('1 hour)');
  });

  it('cuts a very long task title to fit the page', async () => {
    const { buildCertificatePdf, textWidth } = require('../src/services/certificatePdf');
    const title = 'Repair and test '.repeat(40);
    const text = buildCertificatePdf({ certNo: 'CERT-2026-ABC123', studentName: 'Asha', title, hours: 2 }).toString('latin1');
    expect(text).toContain('...');
    expect(text).not.toContain(title);
    expect(textWidth('Hello', 10)).toBeGreaterThan(0);
  });

  it('verifies an ID in public, naming the student only by first name and last initial', async () => {
    const cert = await issue();
    const res = await call('get', `${S}/certificates/verify/${cert.certNo.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ valid: true, certNo: cert.certNo, title: 'Diagnose a laptop that will not power on', hours: 6, supervisorName: 'Ravi Kumar' });
    expect(res.body.data.studentName).toBe('Meera N.');
    expect(JSON.stringify(res.body)).not.toContain(student.doc.email);
    expect(res.body.data.studentName).toMatch(/^\S+( \S\.)?$/);
  });

  it('says the same "not found" for an ID that was never issued or is not an ID at all', async () => {
    await issue();
    expect((await call('get', `${S}/certificates/verify/CERT-2026-FFFFFF`)).status).toBe(404);
    expect((await call('get', `${S}/certificates/verify/nonsense`)).status).toBe(404);
    expect((await call('get', `${S}/certificates/verify/${encodeURIComponent('{"$ne":1}')}`)).status).toBe(404);
  });
});
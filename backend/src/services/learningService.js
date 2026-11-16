'use strict';
// Student learning (FR-STU-001..006). Verified technicians post supervised practical tasks; verified students apply; the
// technician accepts, starts and completes. Completed work feeds the student's experience history and portfolio.
// Rules live in services/workflow/learning.js; this file loads data, applies a rule, writes the change only if the status
// is still what we read, and runs the side effects. Hazardous device types are refused for student tasks (BR-07).
const crypto = require('crypto');
const mongoose = require('mongoose');
const LearningOpportunity = require('../models/LearningOpportunity');
const StudentApplication = require('../models/StudentApplication');
const StudentProfile = require('../models/StudentProfile');
const TechnicianProfile = require('../models/TechnicianProfile');
const Certificate = require('../models/Certificate');
const Category = require('../models/Category');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');
const { parsePagination, buildMeta } = require('../utils/pagination');
const { notify } = require('./notificationService');
const { serializeOpportunity, serializeApplication, serializeCertificate } = require('../serializers/learning');
const workflow = require('./workflow/learning');

const { ACTORS, SEAT_HOLDING, BLOCK_MESSAGE } = workflow;
const idOf = (v) => String(v && v._id ? v._id : v);
const oid = (v) => new mongoose.Types.ObjectId(idOf(v));
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const historyEntry = (status, by, note) => ({ status, at: new Date(), by, ...(note ? { note } : {}) });
const stale = () => ApiError.conflict('This application was just changed. Reload the page and try again.', 'STALE_STATE');
const oppLink = (id) => `/dashboard/learning-tasks/${id}`;
const appLink = (id) => `/dashboard/applications/${id}`;

const OPP_POPULATE = [
  { path: 'deviceType', select: 'name slug icon hazardous' },
  { path: 'postedBy', select: 'name' },
];
const APP_POPULATE = [{ path: 'student', select: 'name' }, { path: 'opportunity', populate: OPP_POPULATE }];

/* ---------- shared lookups ---------- */

/** { [opportunityId]: { applied, accepted, ... } } for many opportunities in one query. */
async function statusCounts(oppIds) {
  if (!oppIds.length) return {};
  const rows = await StudentApplication.aggregate([
    { $match: { opportunity: { $in: oppIds.map(oid) } } },
    { $group: { _id: { o: '$opportunity', s: '$status' }, n: { $sum: 1 } } },
  ]);
  const out = {};
  for (const r of rows) {
    const key = String(r._id.o);
    out[key] = out[key] || {};
    out[key][r._id.s] = r.n;
  }
  return out;
}
const seatsTakenIn = (counts = {}) => SEAT_HOLDING.reduce((t, s) => t + (counts[s] || 0), 0);
async function seatsTakenOf(oppId) {
  const counts = await statusCounts([oppId]);
  return seatsTakenIn(counts[String(oppId)]);
}

async function studentIsVerified(userId) {
  const p = await StudentProfile.findOne({ user: userId }).select('verification.status').lean();
  return p?.verification?.status === 'approved';
}

async function profileMap(Model, userIds) {
  const list = await Model.find({ user: { $in: userIds.map(oid) } }).lean();
  return Object.fromEntries(list.map((p) => [String(p.user), p]));
}

const viewerRoleFor = (opp, user) => {
  if (!user) return null;
  if (user.role === 'admin') return 'admin';
  if (idOf(opp.postedBy) === user.id) return 'supervisor';
  if (user.role === 'student') return 'student';
  return null;
};

/** Serialises opportunities with seat counts, the supervisor's rating and, for the viewer, their own application. */
async function presentOpportunities(list, user) {
  if (!list.length) return [];
  const ids = list.map((o) => o._id);
  const [counts, supervisors] = await Promise.all([statusCounts(ids), profileMap(TechnicianProfile, list.map((o) => idOf(o.postedBy)))]);
  let mine = {};
  let verified = false;
  if (user?.role === 'student') {
    const apps = await StudentApplication.find({ student: user.id, opportunity: { $in: ids } }).select('opportunity status').lean();
    mine = Object.fromEntries(apps.map((a) => [String(a.opportunity), a]));
    verified = await studentIsVerified(user.id);
  }
  return list.map((o) => serializeOpportunity(o, {
    seatsTaken: seatsTakenIn(counts[String(o._id)]),
    counts: counts[String(o._id)],
    supervisorProfile: supervisors[idOf(o.postedBy)],
    viewerRole: viewerRoleFor(o, user),
    myApplication: mine[String(o._id)],
    studentVerified: verified,
  }));
}

async function loadOpportunity(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Opportunity not found');
  const o = await LearningOpportunity.findById(id).populate(OPP_POPULATE);
  if (!o) throw ApiError.notFound('Opportunity not found');
  return o;
}

/** Only the technician who posted it may change it. Everyone else gets 404 so ids cannot be probed. */
async function loadOwnOpportunity(id, user) {
  const o = await loadOpportunity(id);
  if (idOf(o.postedBy) !== user.id) throw ApiError.notFound('Opportunity not found');
  return o;
}

async function viewOpportunity(id, user) {
  return (await presentOpportunities([await loadOpportunity(id)], user))[0];
}

/** BR-07: a student task may not involve a device type flagged hazardous. */
async function assertSuitableCategory(id) {
  const cat = await Category.findOne({ _id: id, active: { $ne: false } }).select('name hazardous');
  if (!cat) throw ApiError.validation([{ field: 'deviceTypeId', message: 'Choose a device type from the list' }]);
  if (cat.hazardous) {
    throw ApiError.validation([{ field: 'deviceTypeId', message: `${cat.name} is a hazardous device type, so it cannot be used for student tasks` }], 'Student tasks cannot involve hazardous handling');
  }
  return cat;
}

/* ---------- opportunities ---------- */

async function createOpportunity(user, input) {
  const cat = await assertSuitableCategory(input.deviceTypeId);
  const o = await LearningOpportunity.create({
    postedBy: user.id,
    title: input.title,
    description: input.description,
    deviceType: cat._id,
    requiredSkills: input.requiredSkills || [],
    difficulty: input.difficulty,
    locationArea: input.locationArea,
    deadline: input.deadline,
    seats: input.seats || 1,
    expectedHours: input.expectedHours,
  });
  return viewOpportunity(o._id, user);
}

/** The public feed: open opportunities whose deadline has not passed. */
async function listOpportunities(user, query) {
  const pg = parsePagination(query, { defaultLimit: 12 });
  const filter = { status: 'open', deadline: { $gt: new Date() } };
  if (query.difficulty) filter.difficulty = query.difficulty;
  if (query.skill) filter.requiredSkills = String(query.skill).toLowerCase();
  if (query.q) {
    const re = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: re }, { description: re }];
  }
  if (query.category) {
    const cat = await Category.findOne({ slug: query.category }).select('_id').lean();
    filter.deviceType = cat ? cat._id : null;
  }
  const [rows, total] = await Promise.all([
    LearningOpportunity.find(filter).sort({ deadline: 1, _id: 1 }).skip(pg.skip).limit(pg.limit).populate(OPP_POPULATE),
    LearningOpportunity.countDocuments(filter),
  ]);
  return { items: await presentOpportunities(rows, user), meta: buildMeta(pg, total) };
}

async function myOpportunities(user, query) {
  const pg = parsePagination(query, { defaultLimit: 12 });
  const filter = { postedBy: user.id };
  if (query.status) filter.status = query.status;
  const [rows, total] = await Promise.all([
    LearningOpportunity.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate(OPP_POPULATE),
    LearningOpportunity.countDocuments(filter),
  ]);
  return { items: await presentOpportunities(rows, user), meta: buildMeta(pg, total) };
}

const getOpportunity = (id, user) => viewOpportunity(id, user);

const EDITABLE = ['title', 'description', 'requiredSkills', 'difficulty', 'locationArea', 'deadline', 'seats', 'expectedHours'];

async function updateOpportunity(id, user, input) {
  const o = await loadOwnOpportunity(id, user);
  const taken = await seatsTakenOf(o._id);
  if (input.deviceTypeId) o.deviceType = (await assertSuitableCategory(input.deviceTypeId))._id;
  if (input.seats !== undefined && input.seats < taken) {
    throw ApiError.validation([{ field: 'seats', message: `${taken} ${taken === 1 ? 'place is' : 'places are'} already taken` }]);
  }
  for (const key of EDITABLE) if (input[key] !== undefined) o[key] = input[key];
  // Seats and deadline can change whether it is full; a closed opportunity stays closed until the technician reopens it.
  if (o.status !== 'closed') o.status = taken >= o.seats ? 'filled' : 'open';
  await o.save();
  return viewOpportunity(o._id, user);
}

async function rejectPending(opp, reason) {
  const pending = await StudentApplication.find({ opportunity: opp._id, status: 'applied' }).select('_id student').lean();
  if (!pending.length) return;
  await StudentApplication.updateMany(
    { _id: { $in: pending.map((p) => p._id) }, status: 'applied' },
    { $set: { status: 'rejected', supervisorFeedback: reason }, $push: { history: historyEntry('rejected', opp.postedBy && idOf(opp.postedBy), reason) } },
  );
  await notify(pending.map((p) => p.student), { type: 'learning.rejected', title: 'An opportunity you applied to was closed', body: opp.title, data: { opportunityId: opp._id, deepLink: `/opportunities/${opp._id}` } });
}

async function setOpportunityStatus(id, user, status) {
  const o = await loadOwnOpportunity(id, user);
  if (status === 'closed') {
    if (o.status !== 'closed') {
      o.status = 'closed';
      await o.save();
      await rejectPending(o, 'The opportunity was closed');
    }
  } else if (o.status === 'closed') {
    if (o.deadline.getTime() <= Date.now()) throw ApiError.conflict('The deadline has passed. Set a new deadline before reopening.', 'DEADLINE_PASSED');
    const taken = await seatsTakenOf(o._id);
    o.status = taken >= o.seats ? 'filled' : 'open';
    await o.save();
  }
  return viewOpportunity(o._id, user);
}

async function reopenIfRoom(oppId) {
  const o = await LearningOpportunity.findOne({ _id: oppId, status: 'filled' });
  if (!o || o.deadline.getTime() <= Date.now()) return;
  if ((await seatsTakenOf(o._id)) < o.seats) await LearningOpportunity.updateOne({ _id: o._id, status: 'filled' }, { $set: { status: 'open' } });
}

/* ---------- applications: loading and presenting ---------- */

async function loadApplication(id) {
  if (!mongoose.isValidObjectId(id)) throw ApiError.notFound('Application not found');
  const a = await StudentApplication.findById(id).populate(APP_POPULATE);
  if (!a || !a.opportunity) throw ApiError.notFound('Application not found');
  return a;
}

function roleOnApplication(a, user) {
  if (user.role === 'admin') return ACTORS.ADMIN;
  if (idOf(a.student) === user.id) return ACTORS.STUDENT;
  if (idOf(a.opportunity.postedBy) === user.id) return ACTORS.SUPERVISOR;
  return null;
}

/** Loads an application for someone who takes part in it. Strangers get 404. */
async function loadParticipant(id, user, { roles } = {}) {
  const application = await loadApplication(id);
  const role = roleOnApplication(application, user);
  if (!role) throw ApiError.notFound('Application not found');
  if (roles && !roles.includes(role)) throw ApiError.forbidden('You cannot do this on this application');
  return { application, role };
}

async function presentApplications(list, role) {
  if (!list.length) return [];
  const [profiles, certs] = await Promise.all([
    profileMap(StudentProfile, list.map((a) => idOf(a.student))),
    Certificate.find({ application: { $in: list.map((a) => a._id) } }).select('application certNo').lean(),
  ]);
  const certByApp = Object.fromEntries(certs.map((c) => [String(c.application), c.certNo]));
  return list.map((a) => serializeApplication(a, { role: typeof role === 'function' ? role(a) : role, studentProfile: profiles[idOf(a.student)], certNo: certByApp[String(a._id)] || null }));
}

async function viewApplication(id, user) {
  const { application, role } = await loadParticipant(id, user);
  return (await presentApplications([application], role))[0];
}

/* ---------- applications: student side ---------- */

async function apply(user, input) {
  const opp = await loadOpportunity(input.opportunityId);
  const [verified, existing, taken] = await Promise.all([
    studentIsVerified(user.id),
    StudentApplication.findOne({ opportunity: opp._id, student: user.id }),
    seatsTakenOf(opp._id),
  ]);
  const block = workflow.applyBlock(opp, { studentVerified: verified, existing, seatsTaken: taken });
  if (block === 'not_verified') throw ApiError.forbidden(BLOCK_MESSAGE[block], 'NOT_VERIFIED');
  if (block) throw ApiError.conflict(BLOCK_MESSAGE[block], block.toUpperCase());

  let app;
  if (existing) {
    // A withdrawn application can be sent again.
    app = await StudentApplication.findOneAndUpdate(
      { _id: existing._id, status: 'withdrawn' },
      {
        $set: { status: 'applied', hours: 0, ...(input.message ? { message: input.message } : {}) },
        $unset: { supervisorFeedback: '', startedAt: '', completedAt: '', ...(input.message ? {} : { message: '' }) },
        $push: { history: historyEntry('applied', user.id) },
      },
      { new: true },
    );
    if (!app) throw stale();
  } else {
    try {
      app = await StudentApplication.create({ opportunity: opp._id, student: user.id, message: input.message, history: [historyEntry('applied', user.id)] });
    } catch (err) {
      if (err.code === 11000) throw ApiError.conflict(BLOCK_MESSAGE.already_applied, 'ALREADY_APPLIED');
      throw err;
    }
  }
  await notify(idOf(opp.postedBy), { type: 'learning.applied', title: 'New student application', body: `${user.name} applied to “${opp.title}”`, data: { id: app._id, opportunityId: opp._id, deepLink: oppLink(opp._id) } });
  return viewApplication(app._id, user);
}

async function listMine(user, query) {
  const pg = parsePagination(query, { defaultLimit: 10 });
  const filter = { student: user.id };
  if (query.status) filter.status = query.status;
  const [rows, total] = await Promise.all([
    StudentApplication.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate(APP_POPULATE),
    StudentApplication.countDocuments(filter),
  ]);
  return { items: await presentApplications(rows.filter((a) => a.opportunity), ACTORS.STUDENT), meta: buildMeta(pg, total) };
}

const getApplication = (id, user) => viewApplication(id, user);

async function withdraw(id, user, { reason } = {}) {
  const { application: a } = await loadParticipant(id, user, { roles: [ACTORS.STUDENT] });
  workflow.assertTransition(a.status, 'withdrawn', ACTORS.STUDENT);
  const heldSeat = a.status !== 'applied';
  const done = await StudentApplication.findOneAndUpdate(
    { _id: a._id, status: a.status },
    { $set: { status: 'withdrawn' }, $push: { history: historyEntry('withdrawn', user.id, reason) } },
    { new: true },
  );
  if (!done) throw stale();
  if (heldSeat) await reopenIfRoom(a.opportunity._id);
  await notify(idOf(a.opportunity.postedBy), { type: 'learning.withdrawn', title: 'A student withdrew', body: `${user.name} withdrew from “${a.opportunity.title}”`, data: { id: a._id, opportunityId: a.opportunity._id, deepLink: oppLink(a.opportunity._id) } });
  return viewApplication(a._id, user);
}

/* ---------- applications: supervisor side ---------- */

async function listApplicants(oppId, user, query) {
  const opp = await loadOpportunity(oppId);
  const role = viewerRoleFor(opp, user);
  if (role !== 'supervisor' && role !== 'admin') throw ApiError.notFound('Opportunity not found');
  const pg = parsePagination(query, { defaultLimit: 20 });
  const filter = { opportunity: opp._id };
  if (query.status) filter.status = query.status;
  const [rows, total] = await Promise.all([
    StudentApplication.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).populate(APP_POPULATE),
    StudentApplication.countDocuments(filter),
  ]);
  return { items: await presentApplications(rows, role), meta: buildMeta(pg, total) };
}

async function decide(id, user, { decision, feedback }) {
  const { application: a } = await loadParticipant(id, user, { roles: [ACTORS.SUPERVISOR] });
  workflow.assertTransition(a.status, decision, ACTORS.SUPERVISOR);
  const opp = a.opportunity;
  const from = a.status;
  const feedbackSet = feedback ? { supervisorFeedback: feedback } : {};

  if (decision === 'accepted') {
    if ((await seatsTakenOf(opp._id)) >= opp.seats) throw ApiError.conflict(BLOCK_MESSAGE.filled, 'SEATS_FULL');
    const done = await StudentApplication.findOneAndUpdate(
      { _id: a._id, status: 'applied' },
      { $set: { status: 'accepted', ...feedbackSet }, $push: { history: historyEntry('accepted', user.id, feedback) } },
    );
    if (!done) throw stale();
    // Two accepts at the same moment could overfill the opportunity; the later one is put back.
    const taken = await seatsTakenOf(opp._id);
    if (taken > opp.seats) {
      await StudentApplication.updateOne({ _id: a._id, status: 'accepted' }, { $set: { status: 'applied' }, $push: { history: historyEntry('applied', user.id, 'All places were taken at the same moment') } });
      throw ApiError.conflict(BLOCK_MESSAGE.filled, 'SEATS_FULL');
    }
    if (taken >= opp.seats) await LearningOpportunity.updateOne({ _id: opp._id, status: 'open' }, { $set: { status: 'filled' } });
    await notify(idOf(a.student), { type: 'learning.accepted', title: 'You were accepted', body: opp.title, data: { id: a._id, deepLink: appLink(a._id) } });
  } else {
    const done = await StudentApplication.findOneAndUpdate(
      { _id: a._id, status: from },
      { $set: { status: 'rejected', ...feedbackSet }, $push: { history: historyEntry('rejected', user.id, feedback) } },
    );
    if (!done) throw stale();
    if (from === 'accepted') await reopenIfRoom(opp._id);
    await notify(idOf(a.student), { type: 'learning.rejected', title: from === 'accepted' ? 'Your place was withdrawn' : 'Your application was not accepted', body: feedback || opp.title, data: { id: a._id, deepLink: appLink(a._id) } });
  }
  return viewApplication(a._id, user);
}

async function start(id, user) {
  const { application: a } = await loadParticipant(id, user, { roles: [ACTORS.SUPERVISOR] });
  workflow.assertTransition(a.status, 'in_progress', ACTORS.SUPERVISOR);
  const done = await StudentApplication.findOneAndUpdate(
    { _id: a._id, status: 'accepted' },
    { $set: { status: 'in_progress', startedAt: new Date() }, $push: { history: historyEntry('in_progress', user.id) } },
  );
  if (!done) throw stale();
  await notify(idOf(a.student), { type: 'learning.started', title: 'Your task has started', body: a.opportunity.title, data: { id: a._id, deepLink: appLink(a._id) } });
  return viewApplication(a._id, user);
}

/** The supervisor confirms the work was done under supervision and records the hours. They flow into the student's profile once. */
async function complete(id, user, { hours, feedback }) {
  const { application: a } = await loadParticipant(id, user, { roles: [ACTORS.SUPERVISOR] });
  workflow.assertTransition(a.status, 'completed', ACTORS.SUPERVISOR);
  const rounded = Math.round(hours * 100) / 100;
  const done = await StudentApplication.findOneAndUpdate(
    { _id: a._id, status: 'in_progress' },
    { $set: { status: 'completed', hours: rounded, completedAt: new Date(), ...(feedback ? { supervisorFeedback: feedback } : {}) }, $push: { history: historyEntry('completed', user.id, feedback) } },
  );
  if (!done) throw stale();
  try {
    await StudentProfile.updateOne(
      { user: idOf(a.student) },
      {
        $inc: { hoursCompleted: rounded },
        $addToSet: { skills: { $each: a.opportunity.requiredSkills || [] } },
        $push: { portfolio: { title: a.opportunity.title, description: feedback, application: a._id, at: new Date() } },
      },
    );
  } catch (err) {
    logger.error({ err: err.message, applicationId: String(a._id) }, 'student profile update failed after completion');
  }
  await notify(idOf(a.student), { type: 'learning.completed', title: 'Your task was completed', body: `${rounded} hours recorded for “${a.opportunity.title}”`, data: { id: a._id, deepLink: appLink(a._id) } });
  return viewApplication(a._id, user);
}

/* ---------- experience and certificates ---------- */

async function experience(user) {
  const rows = await StudentApplication.find({ student: user.id, status: 'completed' }).sort({ completedAt: -1 }).populate(APP_POPULATE);
  const items = await presentApplications(rows.filter((a) => a.opportunity), ACTORS.STUDENT);
  const profile = await StudentProfile.findOne({ user: user.id }).select('skills college course yearOfStudy').lean();
  const totalHours = Math.round(items.reduce((t, i) => t + (i.hours || 0), 0) * 100) / 100;
  return {
    summary: { completedCount: items.length, totalHours, skills: profile?.skills || [], college: profile?.college, course: profile?.course, yearOfStudy: profile?.yearOfStudy },
    items,
  };
}

async function listCertificates(user) {
  const rows = await Certificate.find({ student: user.id }).sort({ issuedAt: -1 }).populate({ path: 'application', populate: { path: 'opportunity', select: 'title' } });
  return rows.map((c) => serializeCertificate(c, c.application));
}

const newCertNo = () => `CERT-${new Date().getUTCFullYear()}-${crypto.randomBytes(4).toString('hex').slice(0, 6).toUpperCase()}`;

/** Admin approval of a participation certificate (FR-STU-006). The admin route arrives with Phase 6; the rule lives here. */
async function issueCertificate(admin, applicationId) {
  const a = await loadApplication(applicationId);
  if (a.status !== 'completed') throw ApiError.conflict('A certificate can only be issued for a completed task', 'NOT_COMPLETED');
  let cert;
  try {
    cert = await Certificate.create({ student: idOf(a.student), application: a._id, certNo: newCertNo(), issuedBy: admin.id });
  } catch (err) {
    if (err.code === 11000) throw ApiError.conflict('A certificate was already issued for this task', 'ALREADY_ISSUED');
    throw err;
  }
  await notify(idOf(a.student), { type: 'learning.certificate', title: 'Your participation certificate is ready', body: cert.certNo, data: { id: a._id, deepLink: appLink(a._id) } });
  return serializeCertificate(cert, a);
}

module.exports = {
  createOpportunity, listOpportunities, myOpportunities, getOpportunity, updateOpportunity, setOpportunityStatus,
  apply, listMine, getApplication, withdraw, listApplicants, decide, start, complete,
  experience, listCertificates, issueCertificate,
};

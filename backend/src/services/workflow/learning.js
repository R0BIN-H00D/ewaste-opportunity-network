'use strict';
// Student learning rules (FR-STU-003..005, BR-07) as data + pure functions, so they can be tested without a database.
//   applied -> accepted -> in_progress -> completed        (the supervising technician decides, starts and completes)
//   applied/accepted -> rejected (supervisor) · applied/accepted/in_progress -> withdrawn (student)
// A student only ever works on a task a verified technician posted and supervises (BR-07); opportunities cannot be created
// for hazardous device types, and `hazardousExcluded` on the opportunity is always true.
const ApiError = require('../../utils/ApiError');

const STUDENT = 'student';
const SUPERVISOR = 'supervisor';
const ADMIN = 'admin';

const TRANSITIONS = [
  { from: 'applied', to: 'accepted', actors: [SUPERVISOR] },
  { from: 'applied', to: 'rejected', actors: [SUPERVISOR] },
  { from: 'applied', to: 'withdrawn', actors: [STUDENT] },
  { from: 'accepted', to: 'in_progress', actors: [SUPERVISOR] },
  { from: 'accepted', to: 'rejected', actors: [SUPERVISOR] },
  { from: 'accepted', to: 'withdrawn', actors: [STUDENT] },
  { from: 'in_progress', to: 'completed', actors: [SUPERVISOR] },
  { from: 'in_progress', to: 'withdrawn', actors: [STUDENT] },
];

/** Statuses that occupy one of the opportunity's seats. */
const SEAT_HOLDING = ['accepted', 'in_progress', 'completed'];
/** Statuses where the application is still alive. */
const ACTIVE = ['applied', 'accepted', 'in_progress'];

const canTransition = (from, to, actor) => TRANSITIONS.some((t) => t.from === from && t.to === to && t.actors.includes(actor));

function assertTransition(from, to, actor) {
  if (!canTransition(from, to, actor)) {
    throw ApiError.conflict(`This application cannot move from "${from}" to "${to}"`, 'INVALID_TRANSITION');
  }
}

/** What the viewer can do next. Clients draw their buttons from this list so the rules are never copied into the browser. */
function availableActions(application, role) {
  const a = [];
  const { status } = application;
  if (role === SUPERVISOR) {
    if (status === 'applied') a.push('accept', 'reject');
    if (status === 'accepted') a.push('start', 'reject');
    if (status === 'in_progress') a.push('complete');
  }
  if (role === STUDENT && ACTIVE.includes(status)) a.push('withdraw');
  return a;
}

/**
 * Why a student cannot apply right now, or null when they can. First match wins.
 * ctx = { studentVerified, existing (the student's own application or null), seatsTaken, now }
 */
function applyBlock(opportunity, ctx) {
  const now = ctx.now || new Date();
  if (!ctx.studentVerified) return 'not_verified';
  if (ctx.existing && ctx.existing.status !== 'withdrawn') return 'already_applied';
  if (opportunity.status === 'closed') return 'closed';
  if (opportunity.status === 'filled' || ctx.seatsTaken >= opportunity.seats) return 'filled';
  if (new Date(opportunity.deadline) <= now) return 'deadline_passed';
  return null;
}

const BLOCK_MESSAGE = {
  not_verified: 'Your student account must be verified by an administrator first',
  already_applied: 'You have already applied to this opportunity',
  closed: 'This opportunity is closed',
  filled: 'All places on this opportunity are taken',
  deadline_passed: 'The application deadline has passed',
};

module.exports = {
  ACTORS: { STUDENT, SUPERVISOR, ADMIN },
  TRANSITIONS, SEAT_HOLDING, ACTIVE, BLOCK_MESSAGE,
  canTransition, assertTransition, availableActions, applyBlock,
};

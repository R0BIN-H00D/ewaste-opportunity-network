'use strict';
// Refurbishment job rules (FR-MKT-001..003) as data + pure functions, so they can be tested without a database.
//   offered -> accepted -> collected -> assessment -> in_progress -> testing -> ready_to_list -> listed
// The owner accepts one offer; both sides confirm the handover (collected). The refurbisher then moves the job forward,
// adding before/after photos. `listed` is set by the marketplace when the product is published.
const ApiError = require('../../utils/ApiError');

const OWNER = 'owner';
const REFURBISHER = 'refurbisher';
const ADMIN = 'admin';
const SYSTEM = 'system';

// The refurbisher's forward steps after collection.
const NEXT = { collected: 'assessment', assessment: 'in_progress', in_progress: 'testing', testing: 'ready_to_list' };
const BEFORE_PHOTO_STATUSES = ['collected', 'assessment', 'in_progress'];
const AFTER_PHOTO_STATUSES = ['in_progress', 'testing', 'ready_to_list'];
const CANCELLABLE = ['offered', 'accepted'];

const TRANSITIONS = [
  { from: 'offered', to: 'accepted', actors: [OWNER] },
  { from: 'offered', to: 'cancelled', actors: [OWNER, REFURBISHER, SYSTEM, ADMIN] }, // declined, withdrawn, or another offer chosen
  { from: 'accepted', to: 'collected', actors: [SYSTEM] }, // both sides confirmed the handover
  { from: 'accepted', to: 'cancelled', actors: [OWNER, REFURBISHER, ADMIN] },
  ...Object.entries(NEXT).map(([from, to]) => ({ from, to, actors: [REFURBISHER] })),
  { from: 'ready_to_list', to: 'listed', actors: [SYSTEM] }, // the product was published
];

const canTransition = (from, to, actor) => TRANSITIONS.some((t) => t.from === from && t.to === to && t.actors.includes(actor));

function assertTransition(from, to, actor) {
  if (!canTransition(from, to, actor)) {
    throw ApiError.conflict(`This job cannot move from "${from}" to "${to}"`, 'INVALID_TRANSITION');
  }
}

/**
 * What the viewer can do next. `ctx` = { hasPickup, handoverStarted, confirmedByMe }.
 * Clients draw buttons from this list so the rules are never copied into the browser.
 */
function availableActions(job, role, ctx = {}) {
  const a = [];
  const { status } = job;
  const isOwner = role === OWNER;
  const isRefurbisher = role === REFURBISHER;
  if (status === 'offered') {
    if (isOwner) a.push('decide');
    if (isRefurbisher) a.push('withdraw');
    if (isOwner || role === ADMIN) a.push('cancel');
  }
  if (status === 'accepted') {
    if ((isOwner || isRefurbisher) && !ctx.handoverStarted) a.push('schedule_handover');
    if ((isOwner || isRefurbisher) && ctx.hasPickup && !ctx.confirmedByMe) a.push('confirm_handover');
    if ((isOwner || isRefurbisher || role === ADMIN) && !ctx.handoverStarted) a.push('cancel');
  }
  if (isRefurbisher && NEXT[status]) a.push('advance');
  if (isRefurbisher && status === 'ready_to_list') a.push('list_product'); // opens the marketplace form for this job
  if (isRefurbisher && (BEFORE_PHOTO_STATUSES.includes(status) || AFTER_PHOTO_STATUSES.includes(status))) a.push('add_photos');
  return a;
}

/** Which photo sets can be added while the job is in this status. */
const photoStagesFor = (status) => [
  ...(BEFORE_PHOTO_STATUSES.includes(status) ? ['before'] : []),
  ...(AFTER_PHOTO_STATUSES.includes(status) ? ['after'] : []),
];

module.exports = {
  photoStagesFor,
  ACTORS: { OWNER, REFURBISHER, ADMIN, SYSTEM },
  NEXT, BEFORE_PHOTO_STATUSES, AFTER_PHOTO_STATUSES, CANCELLABLE, TRANSITIONS,
  canTransition, assertTransition, availableActions,
};

'use strict';
// Donation rules (FR-DON-*) as data + pure functions, so they can be tested without a database.
//   open -> requested -> accepted -> handover_scheduled -> completed
// A donation can be cancelled by the donor until it is completed. Closing the last pending request reopens it.
const ApiError = require('../../utils/ApiError');

const DONOR = 'donor';
const RECIPIENT = 'recipient';
const ADMIN = 'admin';
const SYSTEM = 'system';

const CANCELLABLE = ['open', 'requested', 'accepted', 'handover_scheduled'];

const TRANSITIONS = [
  { from: 'open', to: 'requested', actors: [SYSTEM] }, // first request arrives
  { from: 'requested', to: 'open', actors: [SYSTEM] }, // last pending request rejected or withdrawn
  { from: 'requested', to: 'accepted', actors: [DONOR] },
  { from: 'accepted', to: 'handover_scheduled', actors: [DONOR, RECIPIENT] },
  { from: 'handover_scheduled', to: 'completed', actors: [SYSTEM] }, // both sides confirmed
  ...CANCELLABLE.map((from) => ({ from, to: 'cancelled', actors: [DONOR, ADMIN] })),
];

const canTransition = (from, to, actor) => TRANSITIONS.some((t) => t.from === from && t.to === to && t.actors.includes(actor));

function assertTransition(from, to, actor) {
  if (!canTransition(from, to, actor)) {
    throw ApiError.conflict(`This donation cannot move from "${from}" to "${to}"`, 'INVALID_TRANSITION');
  }
}

/**
 * What the viewer can do next. `ctx` = { canRequest, myRequestStatus, confirmedByMe }.
 * Clients render buttons from this list so the rules are never copied into the browser.
 */
function availableActions(donation, role, ctx = {}) {
  const a = [];
  const { status } = donation;
  if (role === DONOR || role === ADMIN) {
    if (status === 'requested') a.push('decide');
    if (['accepted', 'handover_scheduled'].includes(status) && role === DONOR && !ctx.handoverStarted) a.push('schedule_handover');
    if (CANCELLABLE.includes(status)) a.push('cancel');
  }
  if (role === RECIPIENT && ['accepted', 'handover_scheduled'].includes(status) && !ctx.handoverStarted) a.push('schedule_handover');
  if ((role === DONOR || role === RECIPIENT) && status === 'handover_scheduled' && !ctx.confirmedByMe) a.push('confirm_handover');
  if (['open', 'requested'].includes(status) && ctx.canRequest && (!ctx.myRequestStatus || ctx.myRequestStatus === 'withdrawn')) a.push('request');
  if (ctx.myRequestStatus === 'pending' && ['open', 'requested'].includes(status)) a.push('withdraw');
  if ((role === DONOR || role === RECIPIENT || role === ADMIN) && status === 'completed') a.push('view_confirmation');
  return a;
}

module.exports = { ACTORS: { DONOR, RECIPIENT, ADMIN, SYSTEM }, TRANSITIONS, CANCELLABLE, canTransition, assertTransition, availableActions };

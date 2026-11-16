'use strict';
// Recycling request rules (FR-REC-003, FR-REC-004) as data + pure functions, so they can be tested without a database.
//   requested -> accepted -> pickup_scheduled -> collected -> received_at_center -> processed -> completed
//   requested -> rejected (centre) · requested/accepted/pickup_scheduled -> cancelled
// `collected` is set by the system once the requester AND the centre have both confirmed the handover.
const ApiError = require('../../utils/ApiError');

const REQUESTER = 'requester';
const CENTER = 'center';
const ADMIN = 'admin';
const SYSTEM = 'system';

const TRANSITIONS = [
  { from: 'requested', to: 'accepted', actors: [CENTER] },
  { from: 'requested', to: 'rejected', actors: [CENTER] },
  { from: 'requested', to: 'cancelled', actors: [REQUESTER, ADMIN] },
  { from: 'accepted', to: 'pickup_scheduled', actors: [CENTER] },
  { from: 'accepted', to: 'cancelled', actors: [REQUESTER, CENTER, ADMIN] },
  { from: 'pickup_scheduled', to: 'collected', actors: [SYSTEM] },
  { from: 'pickup_scheduled', to: 'cancelled', actors: [REQUESTER, CENTER, ADMIN] },
  { from: 'collected', to: 'received_at_center', actors: [CENTER] },
  { from: 'received_at_center', to: 'processed', actors: [CENTER] },
  { from: 'processed', to: 'completed', actors: [CENTER] },
];

// Statuses a client may ask for through PUT /status. `pickup_scheduled` and `collected` have their own endpoints.
const SETTABLE = ['accepted', 'rejected', 'received_at_center', 'processed', 'completed', 'cancelled'];
const OPEN = ['requested', 'accepted', 'pickup_scheduled', 'collected', 'received_at_center', 'processed'];
const MATERIAL_EDITABLE = ['received_at_center', 'processed'];
// The exact pickup address is visible to the centre while the request is accepted and until the goods are collected (BR-08).
const ADDRESS_VISIBLE_TO_CENTER = ['accepted', 'pickup_scheduled'];

const ACTION_TARGET = { accept: 'accepted', reject: 'rejected', mark_received: 'received_at_center', process: 'processed', complete: 'completed', cancel: 'cancelled' };

const canTransition = (from, to, actor) => TRANSITIONS.some((t) => t.from === from && t.to === to && t.actors.includes(actor));

function assertTransition(from, to, actor) {
  if (!canTransition(from, to, actor)) {
    throw ApiError.conflict(`This request cannot move from "${from}" to "${to}"`, 'INVALID_TRANSITION');
  }
}

/**
 * What the viewer can do next. `ctx` = { handoverStarted, confirmedByMe, hasMaterials }.
 * Clients draw buttons from this list so the rules are never copied into the browser.
 */
function availableActions(request, role, ctx = {}) {
  const a = [];
  const { status } = request;
  const isCenter = role === CENTER;
  const isRequester = role === REQUESTER;
  const canCancel = (r) => canTransition(status, 'cancelled', r);

  if (status === 'requested' && isCenter) a.push('accept', 'reject');
  if (status === 'accepted' && isCenter) a.push('schedule_pickup');
  if (status === 'pickup_scheduled') {
    if (isCenter && !ctx.handoverStarted) a.push('schedule_pickup'); // reschedule
    if ((isCenter || isRequester) && !ctx.confirmedByMe) a.push('confirm_handover');
  }
  if (status === 'collected' && isCenter) a.push('mark_received');
  if (MATERIAL_EDITABLE.includes(status) && isCenter) a.push('record_materials');
  if (status === 'received_at_center' && isCenter && ctx.hasMaterials) a.push('process');
  if (status === 'processed' && isCenter) a.push('complete');
  // Once a handover confirmation exists the request can no longer be cancelled.
  if (OPEN.includes(status) && canCancel(role) && !ctx.handoverStarted) a.push('cancel');
  return a;
}

module.exports = {
  ACTORS: { REQUESTER, CENTER, ADMIN, SYSTEM },
  TRANSITIONS, SETTABLE, OPEN, MATERIAL_EDITABLE, ADDRESS_VISIBLE_TO_CENTER, ACTION_TARGET,
  canTransition, assertTransition, availableActions,
};

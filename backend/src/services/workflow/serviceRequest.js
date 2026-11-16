'use strict';
// Repair workflow rules (design.md A.4.1) as data + pure functions. No database access here, so the whole table is unit-testable.
// Every status change in the service layer goes through assertTransition().
const ApiError = require('../../utils/ApiError');

const CUSTOMER = 'customer';
const TECHNICIAN = 'technician';
const ADMIN = 'admin';
const SYSTEM = 'system';

const CANCELLABLE = [
  'request_submitted', 'technician_assigned', 'device_collection_pending', 'device_collected',
  'diagnosis_in_progress', 'quotation_submitted', 'customer_approval_pending',
];
const FINAL = ['service_completed', 'rejected', 'cancelled'];
const ACTIVE = (status) => !FINAL.includes(status);

// from, to, who may do it, optional condition on the request. onSite repairs skip collection and delivery.
const TRANSITIONS = [
  { from: 'request_submitted', to: 'technician_assigned', actors: [TECHNICIAN] },
  { from: 'request_submitted', to: 'rejected', actors: [TECHNICIAN] },
  { from: 'technician_assigned', to: 'device_collection_pending', actors: [TECHNICIAN, CUSTOMER], when: (r) => !r.onSite },
  { from: 'technician_assigned', to: 'diagnosis_in_progress', actors: [TECHNICIAN], when: (r) => r.onSite },
  { from: 'device_collection_pending', to: 'device_collected', actors: [SYSTEM] },
  { from: 'device_collected', to: 'diagnosis_in_progress', actors: [TECHNICIAN] },
  { from: 'diagnosis_in_progress', to: 'quotation_submitted', actors: [TECHNICIAN] },
  { from: 'quotation_submitted', to: 'customer_approval_pending', actors: [SYSTEM] },
  { from: 'customer_approval_pending', to: 'repair_in_progress', actors: [CUSTOMER] },
  { from: 'customer_approval_pending', to: 'diagnosis_in_progress', actors: [CUSTOMER] }, // customer rejects the quote: diagnose again
  { from: 'repair_in_progress', to: 'quotation_submitted', actors: [TECHNICIAN] }, // revised quotation pauses the work
  { from: 'repair_in_progress', to: 'repair_completed', actors: [TECHNICIAN] },
  { from: 'repair_completed', to: 'device_delivery_pending', actors: [TECHNICIAN], when: (r) => !r.onSite },
  { from: 'repair_completed', to: 'service_completed', actors: [CUSTOMER], when: (r) => r.onSite },
  { from: 'device_delivery_pending', to: 'device_delivered', actors: [SYSTEM] },
  { from: 'device_delivered', to: 'service_completed', actors: [CUSTOMER] },
  ...CANCELLABLE.map((from) => ({ from, to: 'cancelled', actors: [CUSTOMER, ADMIN] })),
];

/** { ok: true } or { ok: false, status: 403|409, message, code }. */
function checkTransition(request, to, actor) {
  const candidates = TRANSITIONS.filter((t) => t.from === request.status && t.to === to && (!t.when || t.when(request)));
  if (candidates.length === 0) {
    return { ok: false, status: 409, code: 'INVALID_TRANSITION', message: `A request that is "${label(request.status)}" cannot move to "${label(to)}"` };
  }
  if (!candidates.some((t) => t.actors.includes(actor))) {
    return { ok: false, status: 403, code: 'FORBIDDEN', message: 'You are not allowed to make this change' };
  }
  return { ok: true };
}

function assertTransition(request, to, actor) {
  const result = checkTransition(request, to, actor);
  if (!result.ok) throw new ApiError(result.status, result.message, result.code);
}

const label = (status) => String(status).replace(/_/g, ' ');

/**
 * What the viewer can do next, so clients show the right buttons without duplicating the rules.
 * role: 'customer' | 'technician' | 'admin'. `invited` is true for a technician who was asked (or may claim) but is not assigned yet.
 */
function availableActions(request, role, { invited = false } = {}) {
  const s = request.status;
  const out = [];
  const handover = request.handover || {};
  if (role === TECHNICIAN) {
    if (s === 'request_submitted' && invited) out.push('accept', ...(request.mode === 'targeted' ? ['reject'] : []));
    if (s === 'technician_assigned') out.push(request.onSite ? 'start_diagnosis' : 'schedule_pickup');
    if (s === 'device_collection_pending') {
      out.push('schedule_pickup');
      if (!handover.collect?.byProvider) out.push('confirm_handover');
    }
    if (s === 'device_collected') out.push('start_diagnosis');
    if (s === 'diagnosis_in_progress') out.push('add_progress', 'submit_quotation');
    if (s === 'repair_in_progress') out.push('add_progress', 'revise_quotation', 'complete_repair');
    if (s === 'repair_completed' && !request.onSite) out.push('start_delivery');
    if (s === 'device_delivery_pending' && !handover.delivery?.byProvider) out.push('confirm_handover');
  }
  if (role === CUSTOMER) {
    if (s === 'technician_assigned' && !request.onSite) out.push('schedule_pickup');
    if (s === 'device_collection_pending') {
      out.push('schedule_pickup');
      if (!handover.collect?.byOwner) out.push('confirm_handover');
    }
    if (s === 'customer_approval_pending') out.push('approve_quotation', 'reject_quotation');
    if (s === 'device_delivery_pending' && !handover.delivery?.byOwner) out.push('confirm_handover');
    if (s === 'device_delivered' || (s === 'repair_completed' && request.onSite)) out.push('confirm_completion');
    if (CANCELLABLE.includes(s)) out.push('cancel');
    if (s === 'service_completed' && !request.reviewed) out.push('review');
  }
  if (role === ADMIN && CANCELLABLE.includes(s)) out.push('cancel');
  return out;
}

module.exports = { TRANSITIONS, CANCELLABLE, FINAL, ACTIVE, ACTORS: { CUSTOMER, TECHNICIAN, ADMIN, SYSTEM }, checkTransition, assertTransition, availableActions, label };

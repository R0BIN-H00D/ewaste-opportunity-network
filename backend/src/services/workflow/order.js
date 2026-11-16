'use strict';
// Marketplace order rules (FR-MKT-009/010) as data + pure functions, so they can be tested without a database.
//   placed -> confirmed -> ready -> delivered -> completed        (cancelled from placed / confirmed / ready)
// The seller moves the order forward; the buyer's confirmation of receipt completes it. Stock is taken when the
// seller confirms (not when the order is placed), and given back if a confirmed order is cancelled.
const ApiError = require('../../utils/ApiError');

const BUYER = 'buyer';
const SELLER = 'seller';
const ADMIN = 'admin';
const SYSTEM = 'system';

const TRANSITIONS = [
  { from: 'placed', to: 'confirmed', actors: [SELLER] },
  { from: 'confirmed', to: 'ready', actors: [SELLER] },
  { from: 'ready', to: 'delivered', actors: [SELLER] },
  { from: 'delivered', to: 'completed', actors: [BUYER, ADMIN] },
  { from: 'placed', to: 'cancelled', actors: [BUYER, SELLER, ADMIN, SYSTEM] }, // SYSTEM: the last item was sold to someone else
  { from: 'confirmed', to: 'cancelled', actors: [BUYER, SELLER, ADMIN] },
  { from: 'ready', to: 'cancelled', actors: [SELLER, ADMIN] },
];
const OPEN = ['placed', 'confirmed', 'ready', 'delivered']; // not finished yet
const STOCK_TAKEN = ['confirmed', 'ready', 'delivered', 'completed']; // statuses after the seller confirmed

const canTransition = (from, to, actor) => TRANSITIONS.some((t) => t.from === from && t.to === to && t.actors.includes(actor));

function assertTransition(from, to, actor) {
  if (!canTransition(from, to, actor)) {
    throw ApiError.conflict(`This order cannot move from "${from}" to "${to}"`, 'INVALID_TRANSITION');
  }
}

/** The status each action leads to. Clients draw buttons from `availableActions` and never copy these rules. */
const ACTION_TARGET = { confirm: 'confirmed', mark_ready: 'ready', mark_delivered: 'delivered', complete: 'completed', cancel: 'cancelled' };

function availableActions(order, role) {
  return Object.entries(ACTION_TARGET)
    .filter(([, to]) => canTransition(order.status, to, role))
    .map(([action]) => action);
}

module.exports = {
  ACTORS: { BUYER, SELLER, ADMIN, SYSTEM },
  TRANSITIONS, OPEN, STOCK_TAKEN, ACTION_TARGET,
  canTransition, assertTransition, availableActions,
};

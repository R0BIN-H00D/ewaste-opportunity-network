'use strict';
// Rules every pickup, collection and handover shares (P5-26): at most 3 reschedules, none within 2 hours of the start.
// Repairs, donations, refurbishment and recycling all call this instead of keeping their own copy.
const ApiError = require('../utils/ApiError');

const MAX_RESCHEDULES = 3;
const RESCHEDULE_CUTOFF_MS = 2 * 60 * 60 * 1000;

/** Throws 409 RESCHEDULE_LIMIT or RESCHEDULE_TOO_LATE. `noun` is how the message names it: 'pickup' or 'handover'. */
function assertCanReschedule(pickup, noun = 'pickup', now = Date.now()) {
  if (pickup.rescheduleCount >= MAX_RESCHEDULES) throw ApiError.conflict(`A ${noun} can be rescheduled at most ${MAX_RESCHEDULES} times`, 'RESCHEDULE_LIMIT');
  if (pickup.date.getTime() - now < RESCHEDULE_CUTOFF_MS) throw ApiError.conflict(`A ${noun} cannot be changed less than 2 hours before it starts`, 'RESCHEDULE_TOO_LATE');
}

/** Checks the rules, then moves the pickup to the new time and counts the change. */
async function reschedule(pickup, input, noun = 'pickup', actorId) {
  assertCanReschedule(pickup, noun);
  // A change is a proposal: the other side confirms it (POST /api/pickups/:id/confirm) or answers with a new time.
  pickup.set({ date: input.date, timeSlot: input.timeSlot, notes: input.notes, status: 'rescheduled', timeSetAt: new Date(), reminders: {}, ...(actorId ? { proposedBy: actorId } : {}) });
  pickup.rescheduleCount += 1;
  await pickup.save();
  return pickup;
}

module.exports = { MAX_RESCHEDULES, RESCHEDULE_CUTOFF_MS, assertCanReschedule, reschedule };

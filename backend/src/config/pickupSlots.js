'use strict';
// The collection windows people choose from (P9-08, FR-PICK-001). Fixed windows keep both sides' plans simple and let the
// app show which are still open. Times are Indian Standard Time (UTC+05:30), the only zone the service runs in.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const SLOTS = [
  { key: '08:00-10:00', label: 'Morning', start: 8, end: 10 },
  { key: '10:00-12:00', label: 'Late morning', start: 10, end: 12 },
  { key: '12:00-14:00', label: 'Midday', start: 12, end: 14 },
  { key: '14:00-16:00', label: 'Afternoon', start: 14, end: 16 },
  { key: '16:00-18:00', label: 'Evening', start: 16, end: 18 },
];
const SLOT_DAYS = 14; // how far ahead a slot can be booked

/** The instant a slot starts on the given IST calendar day (`y`, `m` 1-12, `d`). */
function slotStart(y, m, d, slot) {
  return new Date(Date.UTC(y, m - 1, d, slot.start, 0, 0) - IST_OFFSET_MS);
}

/** Today's IST calendar date as { y, m, d } for an instant. */
function istDay(instant) {
  const t = new Date(instant.getTime() + IST_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
}

module.exports = { SLOTS, SLOT_DAYS, IST_OFFSET_MS, slotStart, istDay };
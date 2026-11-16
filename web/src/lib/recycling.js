// Labels for recycling requests. Statuses mirror backend/src/config/constants.js (RECYCLING_STATUS).
export const RECYCLING_STATUS = {
  requested: ['Requested', 'amber'],
  accepted: ['Accepted', 'blue'],
  pickup_scheduled: ['Pickup scheduled', 'blue'],
  collected: ['Collected', 'blue'],
  received_at_center: ['Received at the centre', 'blue'],
  processed: ['Processed', 'blue'],
  completed: ['Completed', 'green'],
  rejected: ['Declined', 'red'],
  cancelled: ['Cancelled', 'neutral'],
};
export const recyclingLabel = (s) => RECYCLING_STATUS[s]?.[0] || String(s).replace(/_/g, ' ');
export const recyclingTone = (s) => RECYCLING_STATUS[s]?.[1] || 'neutral';

export const RECYCLING_FILTERS = ['requested', 'accepted', 'pickup_scheduled', 'collected', 'received_at_center', 'processed', 'completed', 'rejected', 'cancelled'];

// Materials a centre can record (FR-REC-005). Mirrors MATERIAL_TYPES on the server.
export const MATERIALS = [
  ['copper', 'Copper'],
  ['aluminium', 'Aluminium'],
  ['iron', 'Iron'],
  ['plastics', 'Plastics'],
  ['glass', 'Glass'],
  ['other', 'Other'],
];
export const materialLabel = (t) => MATERIALS.find(([v]) => v === t)?.[1] || t;

const STEPS = [
  ['requested', 'Requested'],
  ['accepted', 'Accepted'],
  ['pickup_scheduled', 'Pickup'],
  ['collected', 'Collected'],
  ['received_at_center', 'At the centre'],
  ['processed', 'Processed'],
  ['completed', 'Completed'],
];

/** [{ key, label, state: 'done' | 'current' | 'todo' }]. A declined or cancelled request shows how far it got. */
export function recyclingSteps(request) {
  let status = request.status;
  const stopped = status === 'cancelled' || status === 'rejected';
  if (stopped) {
    const last = [...(request.history || [])].reverse().find((h) => STEPS.some(([k]) => k === h.status));
    status = last?.status || 'requested';
  }
  const at = STEPS.findIndex(([k]) => k === status);
  return STEPS.map(([key, label], i) => ({
    key,
    label,
    state: status === 'completed' || i < at ? 'done' : i === at ? (stopped ? 'done' : 'current') : 'todo',
  }));
}

/** Kilograms for display; a missing value is shown as a dash, never as zero. */
export const formatKg = (v) => (v === null || v === undefined ? '–' : `${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 3 })} kg`);

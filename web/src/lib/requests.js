// Labels and helpers for repair requests. Statuses mirror backend/src/config/constants.js (SERVICE_REQUEST_STATUS).
export const REQUEST_STATUS = {
  request_submitted: ['Waiting for technician', 'amber'],
  technician_assigned: ['Technician assigned', 'blue'],
  device_collection_pending: ['Pickup arranged', 'blue'],
  device_collected: ['Device collected', 'blue'],
  diagnosis_in_progress: ['Diagnosis in progress', 'blue'],
  quotation_submitted: ['Quotation sent', 'amber'],
  customer_approval_pending: ['Waiting for approval', 'amber'],
  repair_in_progress: ['Repair in progress', 'blue'],
  repair_completed: ['Repair completed', 'green'],
  device_delivery_pending: ['Delivery arranged', 'blue'],
  device_delivered: ['Device returned', 'green'],
  service_completed: ['Completed', 'green'],
  rejected: ['Declined', 'red'],
  cancelled: ['Cancelled', 'neutral'],
};

export const statusLabel = (s) => REQUEST_STATUS[s]?.[0] || String(s).replace(/_/g, ' ');
export const statusTone = (s) => REQUEST_STATUS[s]?.[1] || 'neutral';

// The visible journey, in order. On-site repairs skip the collection and delivery steps.
const JOURNEY = [
  ['request_submitted', 'Request sent'],
  ['technician_assigned', 'Technician accepted'],
  ['device_collected', 'Device collected'],
  ['diagnosis_in_progress', 'Diagnosis'],
  ['customer_approval_pending', 'Quotation approval'],
  ['repair_in_progress', 'Repair'],
  ['repair_completed', 'Repair done'],
  ['device_delivered', 'Device returned'],
  ['service_completed', 'Completed'],
];

// Which journey step each status belongs to.
const STEP_OF = {
  request_submitted: 'request_submitted',
  technician_assigned: 'technician_assigned',
  device_collection_pending: 'technician_assigned',
  device_collected: 'device_collected',
  diagnosis_in_progress: 'diagnosis_in_progress',
  quotation_submitted: 'customer_approval_pending',
  customer_approval_pending: 'customer_approval_pending',
  repair_in_progress: 'repair_in_progress',
  repair_completed: 'repair_completed',
  device_delivery_pending: 'repair_completed',
  device_delivered: 'device_delivered',
  service_completed: 'service_completed',
};

/** [{ key, label, state: 'done' | 'current' | 'todo' }] for the progress tracker. */
export function journeySteps(request) {
  const steps = JOURNEY.filter(([key]) => !request.onSite || !['device_collected', 'device_delivered'].includes(key));
  const keys = steps.map(([key]) => key);
  let status = request.status;
  const stopped = status === 'rejected' || status === 'cancelled';
  if (stopped) {
    // show how far it got before it stopped
    const last = [...(request.statusHistory || [])].reverse().find((h) => STEP_OF[h.status]);
    status = last?.status || 'request_submitted';
  }
  const finished = request.status === 'service_completed';
  // on-site requests have no collected/delivered step: fall forward to the next visible one
  let at = keys.indexOf(STEP_OF[status]);
  if (at === -1) at = keys.indexOf('diagnosis_in_progress');
  return steps.map(([key, label], i) => ({
    key,
    label,
    state: finished || i < at ? 'done' : i === at ? (stopped ? 'done' : 'current') : 'todo',
  }));
}

export const isFinal = (s) => ['service_completed', 'rejected', 'cancelled'].includes(s);

export const formatDate = (value) => (value ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '');
export const formatMoney = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);

export const AVAILABILITY = [
  ['available', 'Available'],
  ['limited', 'Limited availability'],
  ['unavailable', 'Not taking jobs'],
];

// Labels for donations. Statuses mirror backend/src/config/constants.js (DONATION_STATUS, DONATION_REQUEST_STATUS).
export const DONATION_STATUS = {
  open: ['Available', 'green'],
  requested: ['Requests received', 'amber'],
  accepted: ['Recipient chosen', 'blue'],
  handover_scheduled: ['Handover scheduled', 'blue'],
  completed: ['Completed', 'green'],
  cancelled: ['Cancelled', 'neutral'],
};
export const donationLabel = (s) => DONATION_STATUS[s]?.[0] || String(s).replace(/_/g, ' ');
export const donationTone = (s) => DONATION_STATUS[s]?.[1] || 'neutral';

export const REQUEST_STATUS = {
  pending: ['Waiting for the donor', 'amber'],
  accepted: ['Accepted', 'green'],
  rejected: ['Not chosen', 'neutral'],
  withdrawn: ['Withdrawn', 'neutral'],
};

export const ORG_TYPES = [
  ['school', 'School'],
  ['college', 'College or university'],
  ['ngo', 'NGO'],
  ['trust', 'Charitable trust'],
  ['company', 'Company'],
  ['other', 'Other organisation'],
];

export const VERIFICATION = {
  not_submitted: ['Not registered', 'neutral'],
  pending: ['Waiting for review', 'amber'],
  approved: ['Verified', 'green'],
  rejected: ['Not approved', 'red'],
  resubmission_required: ['Please update and resubmit', 'amber'],
};

const STEPS = [
  ['open', 'Offered'],
  ['requested', 'Requests received'],
  ['accepted', 'Recipient chosen'],
  ['handover_scheduled', 'Handover scheduled'],
  ['completed', 'Completed'],
];

/** [{ key, label, state: 'done' | 'current' | 'todo' }] for the progress tracker. A cancelled donation shows how far it got. */
export function donationSteps(donation) {
  let status = donation.status;
  const stopped = status === 'cancelled';
  if (stopped) {
    const last = [...(donation.history || [])].reverse().find((h) => STEPS.some(([k]) => k === h.status) && h.status !== 'open');
    status = last?.status || 'open';
  }
  const at = STEPS.findIndex(([k]) => k === status);
  return STEPS.map(([key, label], i) => ({
    key,
    label,
    state: status === 'completed' || i < at ? 'done' : i === at ? (stopped ? 'done' : 'current') : 'todo',
  }));
}

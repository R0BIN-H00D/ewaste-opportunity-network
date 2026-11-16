// Labels for refurbishment jobs. Statuses mirror backend/src/config/constants.js (REFURB_JOB_STATUS).
export const JOB_STATUS = {
  offered: ['Offer sent', 'amber'],
  accepted: ['Offer accepted', 'blue'],
  collected: ['Collected', 'blue'],
  assessment: ['Assessment', 'blue'],
  in_progress: ['Being refurbished', 'blue'],
  testing: ['Testing', 'blue'],
  ready_to_list: ['Ready to list', 'green'],
  listed: ['Listed for sale', 'green'],
  cancelled: ['Cancelled', 'neutral'],
};
// The first step reads differently for the two sides: the refurbisher sent an offer, the owner received it.
export const jobLabel = (s, role) => (s === 'offered' && role === 'owner' ? 'Offer received' : JOB_STATUS[s]?.[0] || String(s).replace(/_/g, ' '));
export const jobTone = (s) => JOB_STATUS[s]?.[1] || 'neutral';

// What the button that moves a job to this status says. The server decides whether the move is allowed.
export const ADVANCE_LABEL = {
  assessment: 'Start assessment',
  in_progress: 'Start refurbishing',
  testing: 'Start testing',
  ready_to_list: 'Mark ready to list',
};

const STEPS = [
  ['offered', 'Offer'],
  ['accepted', 'Accepted'],
  ['collected', 'Collected'],
  ['assessment', 'Assessment'],
  ['in_progress', 'Refurbishing'],
  ['testing', 'Testing'],
  ['ready_to_list', 'Ready to list'],
  ['listed', 'Listed'],
];

/** [{ key, label, state: 'done' | 'current' | 'todo' }] for the progress tracker. A cancelled job shows how far it got. */
export function jobSteps(job) {
  let status = job.status;
  const stopped = status === 'cancelled';
  if (stopped) {
    const last = [...(job.history || [])].reverse().find((h) => STEPS.some(([k]) => k === h.status));
    status = last?.status || 'offered';
  }
  const at = STEPS.findIndex(([k]) => k === status);
  return STEPS.map(([key, label], i) => ({
    key,
    label,
    state: status === 'listed' || i < at ? 'done' : i === at ? (stopped ? 'done' : 'current') : 'todo',
  }));
}

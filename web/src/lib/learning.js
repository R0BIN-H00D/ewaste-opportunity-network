// Labels and helpers for student learning. Statuses mirror backend/src/config/constants.js (APPLICATION_STATUS).
export const APPLICATION_STATUS = {
  applied: ['Applied', 'amber'],
  accepted: ['Accepted', 'blue'],
  in_progress: ['In progress', 'blue'],
  completed: ['Completed', 'green'],
  rejected: ['Not accepted', 'red'],
  withdrawn: ['Withdrawn', 'neutral'],
};
export const applicationLabel = (s) => APPLICATION_STATUS[s]?.[0] || String(s).replace(/_/g, ' ');
export const applicationTone = (s) => APPLICATION_STATUS[s]?.[1] || 'neutral';
export const APPLICATION_FILTERS = ['applied', 'accepted', 'in_progress', 'completed', 'rejected', 'withdrawn'];

export const DIFFICULTIES = [
  ['beginner', 'Beginner', 'green'],
  ['intermediate', 'Intermediate', 'amber'],
  ['advanced', 'Advanced', 'red'],
];
export const difficultyLabel = (d) => DIFFICULTIES.find(([v]) => v === d)?.[1] || d;
export const difficultyTone = (d) => DIFFICULTIES.find(([v]) => v === d)?.[2] || 'neutral';

export const OPPORTUNITY_STATUS = { open: ['Open', 'green'], filled: ['Full', 'amber'], closed: ['Closed', 'neutral'] };
export const opportunityLabel = (s) => OPPORTUNITY_STATUS[s]?.[0] || s;
export const opportunityTone = (s) => OPPORTUNITY_STATUS[s]?.[1] || 'neutral';

/** Why a student cannot apply, as the server reports it in `applyBlock`. */
export const APPLY_BLOCK = {
  not_verified: 'Your student account has to be approved by an administrator before you can apply. You can browse opportunities in the meantime.',
  already_applied: 'You have already applied to this opportunity.',
  closed: 'This opportunity is closed.',
  filled: 'All places on this opportunity are taken.',
  deadline_passed: 'The application deadline has passed.',
};

const STEPS = [
  ['applied', 'Applied'],
  ['accepted', 'Accepted'],
  ['in_progress', 'In progress'],
  ['completed', 'Completed'],
];

/** [{ key, label, state: 'done' | 'current' | 'todo' }]. A turned-down or withdrawn application shows how far it got. */
export function applicationSteps(application) {
  let status = application.status;
  const stopped = status === 'rejected' || status === 'withdrawn';
  if (stopped) {
    const last = [...(application.history || [])].reverse().find((h) => STEPS.some(([k]) => k === h.status));
    status = last?.status || 'applied';
  }
  const at = STEPS.findIndex(([k]) => k === status);
  return STEPS.map(([key, label], i) => ({
    key,
    label,
    state: status === 'completed' || i < at ? 'done' : i === at ? (stopped ? 'done' : 'current') : 'todo',
  }));
}

export const formatHours = (h) => `${Number(h || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} ${Number(h) === 1 ? 'hour' : 'hours'}`;

/** "multimeter, soldering basics" -> ['multimeter', 'soldering basics'] (trimmed, lower case, no duplicates, empty parts dropped). */
export const parseSkills = (text) => [...new Set(String(text || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))];
export const skillsToText = (list) => (list || []).join(', ');

/** The calendar day of an ISO instant as YYYY-MM-DD in the viewer's time zone (for <input type="date">). */
export const toDateInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
/** Applications close at the end of the chosen day. */
export const endOfDayIso = (day) => new Date(`${day}T23:59:59`).toISOString();

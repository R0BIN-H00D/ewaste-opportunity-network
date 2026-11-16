// Shared pieces of the pickup and handover steps used by repairs, donations, refurbishment and recycling (P5-26).

export const FUTURE_DATE_MESSAGE = 'Choose a date and time in the future.';
export const CHECKLIST_MESSAGE = 'Please confirm the data-protection checklist first.';

/** The Date for a datetime-local value, or null when it is empty, invalid or not in the future. */
export function futureDate(value, now = Date.now()) {
  if (!value) return null;
  const when = new Date(value);
  return Number.isNaN(when.getTime()) || when.getTime() <= now ? null : when;
}

/** What the person handing over a device must have done (BR-12). The same wording is used everywhere except for repairs, where the technician may need access. */
export const HANDOVER_CHECKLIST = [
  'Back up anything you want to keep.',
  'Erase personal data and sign out of every account.',
  'Remove your SIM and memory cards.',
];

export const REPAIR_HANDOVER_CHECKLIST = [
  'Back up anything you want to keep.',
  'Sign out of your accounts and remove your SIM and memory cards.',
  'Switch off screen locks, “Find my device” and similar protections if the technician needs access.',
  'Remove personal data you do not want anyone to see.',
];

// Words and times for conversations. Mirrors the mobile app so both say the same things.

export const CONTEXT_LABELS = {
  service: 'Repair',
  order: 'Order',
  recycling: 'Recycling',
  donation: 'Donation',
  offer: 'Refurbishment offer',
  enquiry: 'Question about a device',
};

export const contextLabel = (type) => CONTEXT_LABELS[type] || 'Conversation';

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const sameDay = (a, b) => startOfDay(new Date(a)).getTime() === startOfDay(new Date(b)).getTime();

const time = (d) => d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
const day = (d, withYear) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) });

/** "3:05 PM" today, "Yesterday", "16 Nov" this year, otherwise "16 Nov 2025". `now` is for tests. */
export function chatTime(value, now = new Date()) {
  if (!value) return '';
  const d = new Date(value);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (daysAgo <= 0) return time(d);
  if (daysAgo === 1) return 'Yesterday';
  return day(d, d.getFullYear() !== now.getFullYear());
}

/** The label above a run of messages from one day: "Today", "Yesterday" or the date. */
export function dayLabel(value, now = new Date()) {
  const d = new Date(value);
  const daysAgo = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (daysAgo <= 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return day(d, true);
}

export const clockTime = (value) => (value ? time(new Date(value)) : '');

/** Orders messages oldest first without changing the input. */
export const byTime = (list) => [...list].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

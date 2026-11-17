import { chatApi, notificationApi } from './chatApi';

// How many notifications and messages are waiting, for the badges in the sidebar. One shared value so a page that reads
// something (or a live event) updates every badge at once.
let counts = { notifications: 0, messages: 0 };
const subscribers = new Set();

export const getCounts = () => counts;

export function subscribeCounts(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

export function setCounts(patch) {
  counts = { ...counts, ...patch };
  subscribers.forEach((fn) => fn());
}

export function resetCounts() {
  setCounts({ notifications: 0, messages: 0 });
}

/** Asks the server for both numbers. A failure leaves the old ones; the badges are never worth an error message. */
export async function refreshCounts() {
  const [notifications, messages] = await Promise.allSettled([notificationApi.unreadCount(), chatApi.unreadCount()]);
  setCounts({
    ...(notifications.status === 'fulfilled' ? { notifications: notifications.value } : {}),
    ...(messages.status === 'fulfilled' ? { messages: messages.value } : {}),
  });
}

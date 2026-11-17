import { useEffect, useRef, useSyncExternalStore } from 'react';
import { connectRealtime, disconnectRealtime, onRealtime, onRealtimeStatus } from '../services/realtime';
import { getCounts, refreshCounts, resetCounts, setCounts, subscribeCounts } from '../services/unread';

/** Runs `handler(payload)` whenever the server pushes `event`. The latest handler is always used; no need to memoise it. */
export function useRealtimeEvent(event, handler) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => onRealtime(event, (payload) => latest.current(payload)), [event]);
}

/** Runs `handler(true)` each time the live connection comes up (including after a gap), so a page can catch up. */
export function useRealtimeReconnect(handler) {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => onRealtimeStatus((up) => up && latest.current()), []);
}

/** The unread badge numbers: { notifications, messages }. */
export function useUnreadCounts() {
  return useSyncExternalStore(subscribeCounts, getCounts);
}

/**
 * Keeps the live connection and the badges for the signed-in person. Mount once, in the dashboard shell.
 * Connects when `userId` is set and disconnects when it clears or the shell goes away.
 */
export function useLiveSession(userId) {
  useEffect(() => {
    if (!userId) return undefined;
    connectRealtime();
    refreshCounts();
    const offMessage = onRealtime('message:new', () => refreshCounts());
    const offNotification = onRealtime('notification:new', (push) => {
      if (typeof push?.unread === 'number') setCounts({ notifications: push.unread });
      else refreshCounts();
    });
    const offStatus = onRealtimeStatus((up) => up && refreshCounts());
    return () => {
      offMessage();
      offNotification();
      offStatus();
      disconnectRealtime();
      resetCounts();
    };
  }, [userId]);
}

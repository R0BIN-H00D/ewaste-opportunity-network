import { useCallback, useEffect, useRef, useState } from 'react';
import { onRealtime, onRealtimeStatus } from '../services/realtime';
import { toApiError } from '../utils/errors';

/** How long to gather a burst of changes before fetching again, so ten quick changes cause one fetch, not ten. */
export const LIVE_DELAY_MS = 800;

/**
 * Runs `fetcher(signal)` whenever `deps` change; cancels the previous request.
 * Returns { data, error, loading, reload }. `error` is the plain object from toApiError.
 * Pass `{ enabled: false }` to wait (e.g. until the session check has finished) before the first request.
 *
 * Live: when the server says something this person can see has changed (the `data:changed` event), or the live connection
 * comes back after a gap, the data is fetched again quietly: what is on screen stays until the new answer arrives, and a
 * failed quiet fetch is ignored rather than replacing good data with an error. Pass `{ live: false }` to switch that off, for
 * a page that holds half-typed input.
 */
export function useFetch(fetcher, deps, { enabled = true, live = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const quiet = useRef(false);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const wasQuiet = quiet.current;
    quiet.current = false;
    if (!wasQuiet) setState((s) => ({ data: s.data, error: null, loading: true }));
    fetcher(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        if (wasQuiet) return; // keep what is on screen; the next real change or a reload will try again
        setState({ data: null, error: toApiError(err), loading: false });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  useEffect(() => {
    if (!enabled || !live) return undefined;
    let timer = null;
    let waiting = false; // a change arrived while the tab was in the background
    const refresh = () => {
      timer = null;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') { waiting = true; return; }
      quiet.current = true;
      setTick((t) => t + 1);
    };
    const schedule = () => { if (!timer) timer = setTimeout(refresh, LIVE_DELAY_MS); };
    const offChange = onRealtime('data:changed', schedule);
    const offStatus = onRealtimeStatus((up, { again } = {}) => { if (up && again) schedule(); }); // catch up on anything missed while disconnected (not on the first connection, which the page's own fetch already covers)
    const onVisible = () => { if (waiting && document.visibilityState === 'visible') { waiting = false; schedule(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      offChange();
      offStatus();
      document.removeEventListener('visibilitychange', onVisible);
      if (timer) clearTimeout(timer);
    };
  }, [enabled, live]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}
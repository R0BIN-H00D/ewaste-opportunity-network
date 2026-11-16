import { useCallback, useEffect, useState } from 'react';
import { toApiError } from '../utils/errors';

/**
 * Runs `fetcher(signal)` whenever `deps` change; cancels the previous request.
 * Returns { data, error, loading, reload }. `error` is the plain object from toApiError.
 * Pass `{ enabled: false }` to wait (e.g. until the session check has finished) before the first request.
 */
export function useFetch(fetcher, deps, { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    setState((s) => ({ data: s.data, error: null, loading: true }));
    fetcher(controller.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err) => {
        if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
        setState({ data: null, error: toApiError(err), loading: false });
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick, enabled]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

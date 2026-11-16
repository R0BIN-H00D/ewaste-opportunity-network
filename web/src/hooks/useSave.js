import { useCallback, useState } from 'react';
import { toApiError } from '../utils/errors';

/** Tracks one save action: { status: idle|saving|saved|error, message, error }. run() never throws. */
export function useSave() {
  const [state, setState] = useState({ status: 'idle', message: '', error: null });
  const run = useCallback(async (action, successMessage = 'Saved') => {
    setState({ status: 'saving', message: '', error: null });
    try {
      const result = await action();
      setState({ status: 'saved', message: successMessage, error: null });
      return { ok: true, result };
    } catch (err) {
      const error = toApiError(err);
      setState({ status: 'error', message: error.message, error });
      return { ok: false, error };
    }
  }, []);
  const reset = useCallback(() => setState({ status: 'idle', message: '', error: null }), []);
  return { ...state, saving: state.status === 'saving', run, reset };
}

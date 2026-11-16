/** Turns any thrown value into a plain, serialisable error the UI can show: { message, code, status, fieldErrors }. */
export function toApiError(err) {
  const data = err?.response?.data;
  const fieldErrors = {};
  for (const e of data?.errors || []) {
    const key = String(e.field || '').replace(/^body\./, '');
    if (key && !fieldErrors[key]) fieldErrors[key] = e.message;
  }
  let message = data?.message;
  if (!message) message = err?.request && !err?.response ? 'Cannot reach the server. Check your connection and try again.' : err?.message || 'Something went wrong';
  return { message, code: data?.code, status: err?.response?.status, fieldErrors };
}

/** Copies server-side field errors onto a react-hook-form instance. Returns true if any field was matched. */
export function applyFieldErrors(apiError, setError, knownFields) {
  let applied = false;
  for (const [field, message] of Object.entries(apiError.fieldErrors || {})) {
    if (!knownFields || knownFields.includes(field)) {
      setError(field, { type: 'server', message });
      applied = true;
    }
  }
  return applied;
}

/** A one-line message for banners: the first field problem when the server only says "Validation failed". */
export function friendlyMessage(apiError) {
  const first = Object.values(apiError?.fieldErrors || {})[0];
  return apiError?.code === 'VALIDATION_ERROR' && first ? first : apiError?.message;
}

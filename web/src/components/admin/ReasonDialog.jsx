import { useState } from 'react';
import Alert from '../ui/Alert';
import Modal from '../ui/Modal';
import TextField from '../ui/TextField';
import { useSave } from '../../hooks/useSave';
import { friendlyMessage } from '../../utils/errors';

/**
 * A confirmation that can ask for a written reason. The person who is affected reads the reason, so it is required where
 * the rules say so and is checked here before anything is sent. `submit(reason)` returns the promise of the API call.
 */
export default function ReasonDialog({ title, intro, confirmLabel, danger = false, field = 'Reason', hint, required = false, minLength = 1, maxLength = 500, submit, onClose, onDone }) {
  const save = useSave();
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const confirm = async () => {
    const text = reason.trim();
    if (required && text.length < minLength) {
      setError(minLength > 1 ? `Give a reason of at least ${minLength} characters.` : 'Write a reason first.');
      return;
    }
    setError('');
    const res = await save.run(() => submit(text), 'Done');
    if (res.ok) onDone(res.result);
    else if (res.error.fieldErrors?.reason) setError(res.error.fieldErrors.reason);
  };

  const serverError = save.status === 'error' && !error ? friendlyMessage(save.error) : '';
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={(
        <>
          <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
          <button type="button" className={danger ? 'btn bg-danger text-white hover:brightness-110' : 'btn btn-primary'} onClick={confirm} disabled={save.saving}>{save.saving ? 'Working…' : confirmLabel}</button>
        </>
      )}
    >
      <div className="space-y-3">
        {intro && <p className="text-sm text-ink dark:text-[#E8F1EB]">{intro}</p>}
        {(required || hint) && (
          <TextField as="textarea" rows={3} label={required ? field : `${field} (optional)`} value={reason} maxLength={maxLength} hint={hint} error={error}
            onChange={(e) => { setReason(e.target.value); setError(''); }} />
        )}
        <Alert variant="error">{serverError}</Alert>
      </div>
    </Modal>
  );
}

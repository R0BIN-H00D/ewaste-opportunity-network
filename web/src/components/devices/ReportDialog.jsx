import { useState } from 'react';
import Modal from '../ui/Modal';
import Alert from '../ui/Alert';
import TextField from '../ui/TextField';
import { REPORT_REASONS } from '../../lib/devices';
import { reportApi } from '../../services/deviceApi';
import { friendlyMessage, toApiError } from '../../utils/errors';

export default function ReportDialog({ open, onClose, listingId }) {
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => {
    onClose();
    setTimeout(() => {
      setReason('');
      setDetails('');
      setError('');
      setDone(false);
    }, 200);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!reason) return setError('Choose a reason.');
    setBusy(true);
    setError('');
    try {
      await reportApi.create({ targetType: 'listing', targetId: listingId, reason, ...(details.trim() ? { details: details.trim() } : {}) });
      setDone(true);
    } catch (err) {
      setError(friendlyMessage(toApiError(err)));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Report this listing">
      {done ? (
        <div className="space-y-4">
          <Alert variant="success">Thank you. Our moderators will review this listing.</Alert>
          <button type="button" className="btn btn-primary w-full" onClick={close}>Close</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-4">
          <TextField as="select" label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Select a reason…</option>
            {REPORT_REASONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </TextField>
          <TextField as="textarea" label="Details (optional)" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} />
          <Alert variant="error">{error}</Alert>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-glass" onClick={close}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

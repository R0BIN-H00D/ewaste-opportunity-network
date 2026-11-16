import { useEffect, useState } from 'react';
import Alert from '../ui/Alert';
import Modal from '../ui/Modal';
import StarInput from '../ui/StarInput';
import TextField from '../ui/TextField';

/** Review form shown after a completed service. Only the overall rating is required; sub-ratings and the comment are optional. */
export default function ReviewDialog({ open, providerName, busy, error, onSubmit, onCancel }) {
  const [rating, setRating] = useState(0);
  const [quality, setQuality] = useState(0);
  const [communication, setCommunication] = useState(0);
  const [timeliness, setTimeliness] = useState(0);
  const [comment, setComment] = useState('');
  const [problem, setProblem] = useState('');

  // A fresh form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setRating(0); setQuality(0); setCommunication(0); setTimeliness(0); setComment(''); setProblem('');
  }, [open]);

  const submit = () => {
    if (!rating) return setProblem('Choose a star rating.');
    setProblem('');
    return onSubmit({
      rating,
      ...(quality ? { quality } : {}),
      ...(communication ? { communication } : {}),
      ...(timeliness ? { timeliness } : {}),
      ...(comment.trim() ? { comment: comment.trim() } : {}),
    });
  };

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`Review ${providerName || 'the technician'}`}
      footer={
        <>
          <button type="button" className="btn btn-glass" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Submit review'}</button>
        </>
      }
    >
      <div className="space-y-4">
        <StarInput name="overall" label="Overall rating" required value={rating} onChange={(n) => { setRating(n); setProblem(''); }} error={problem} />
        <div className="space-y-2">
          <StarInput name="quality" label="Quality of work" size={22} value={quality} onChange={setQuality} />
          <StarInput name="communication" label="Communication" size={22} value={communication} onChange={setCommunication} />
          <StarInput name="timeliness" label="Timeliness" size={22} value={timeliness} onChange={setTimeliness} />
        </div>
        <TextField as="textarea" rows={3} label="Your review (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} hint="Only your first name and last initial are shown." />
        <Alert variant="error">{error}</Alert>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import Alert from '../ui/Alert';
import Modal from '../ui/Modal';
import TextField from '../ui/TextField';
import { useSave } from '../../hooks/useSave';
import { applicationApi } from '../../services/learningApi';
import { applyFieldErrors, friendlyMessage } from '../../utils/errors';

// What each server-decided action looks like. The page never decides what is allowed: it only draws `application.actions`.
const ACTIONS = {
  accept: { label: 'Accept', title: 'Accept this student?', confirm: 'Accept student', primary: true, field: 'note', fieldLabel: 'Note to the student (optional)', hint: 'For example: where to meet and what to bring.' },
  reject: { label: 'Decline', title: 'Decline this application?', confirm: 'Decline application', danger: true, field: 'note', fieldLabel: 'Reason (optional)', hint: 'The student sees this note.' },
  start: { label: 'Start task', title: 'Mark this task as started?', confirm: 'Start task', primary: true },
  complete: { label: 'Complete task', title: 'Complete this task', confirm: 'Complete task', primary: true, hours: true, field: 'note', fieldLabel: 'Feedback for the student (optional)', hint: 'What went well and what to practise next.' },
  withdraw: { label: 'Withdraw', title: 'Withdraw your application?', confirm: 'Withdraw', danger: true, field: 'note', fieldLabel: 'Reason (optional)' },
};

function run(action, id, { note, hours }) {
  const text = note?.trim() || undefined;
  if (action === 'accept') return applicationApi.decide(id, 'accepted', text);
  if (action === 'reject') return applicationApi.decide(id, 'rejected', text);
  if (action === 'start') return applicationApi.start(id);
  if (action === 'complete') return applicationApi.complete(id, { hours: Number(hours), ...(text ? { feedback: text } : {}) });
  return applicationApi.withdraw(id, text);
}

function ActionDialog({ action, application, onClose, onDone }) {
  const spec = ACTIONS[action];
  const save = useSave();
  const [note, setNote] = useState('');
  const [hours, setHours] = useState('');
  const [errors, setErrors] = useState({});

  const submit = async () => {
    if (spec.hours) {
      const n = Number(hours);
      if (hours.trim() === '' || Number.isNaN(n) || n < 0.5 || n > 200) return setErrors({ hours: 'Enter the hours worked, from 0.5 to 200.' });
    }
    setErrors({});
    const res = await save.run(() => run(action, application._id, { note, hours }), 'Done');
    if (res.ok) onDone(res.result, action);
    else applyFieldErrors(res.error, (name, { message }) => setErrors((er) => ({ ...er, [name === 'feedback' ? 'note' : name]: message })), ['hours', 'feedback', 'reason']);
    return res;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={spec.title}
      footer={(
        <>
          <button type="button" className="btn btn-glass" onClick={onClose} disabled={save.saving}>Cancel</button>
          <button type="button" className={spec.danger ? 'btn bg-danger text-white hover:brightness-110' : 'btn btn-primary'} onClick={submit} disabled={save.saving}>{save.saving ? 'Working…' : spec.confirm}</button>
        </>
      )}
    >
      <div className="space-y-3">
        {action === 'accept' && <p className="text-sm text-ink dark:text-[#E8F1EB]">{application.student?.name} will be told they have a place and that you will supervise the task.</p>}
        {action === 'start' && <p className="text-sm text-ink dark:text-[#E8F1EB]">Use this when the student has arrived and the supervised work begins.</p>}
        {action === 'complete' && <p className="text-sm text-ink dark:text-[#E8F1EB]">Record the hours the student actually worked under your supervision. They are added to the student’s experience.</p>}
        {action === 'withdraw' && <p className="text-sm text-ink dark:text-[#E8F1EB]">Your place is released. You can apply again later if the task is still open.</p>}
        {spec.hours && <TextField label="Hours worked" type="number" inputMode="decimal" min="0.5" max="200" step="0.5" value={hours} onChange={(e) => { setHours(e.target.value); setErrors((er) => ({ ...er, hours: undefined })); }} error={errors.hours} />}
        {spec.field && <TextField as="textarea" rows={3} label={spec.fieldLabel} value={note} onChange={(e) => { setNote(e.target.value); setErrors((er) => ({ ...er, note: undefined })); }} error={errors.note} maxLength={action === 'withdraw' ? 500 : 1000} hint={spec.hint} />}
        <Alert variant="error">{save.status === 'error' && !Object.keys(errors).length ? friendlyMessage(save.error) : ''}</Alert>
      </div>
    </Modal>
  );
}

/** Buttons for the actions the server allows right now, each opening its own dialog. onDone(updatedApplication, action) runs after success. */
export default function ApplicationActions({ application, onDone, size = 'md' }) {
  const [open, setOpen] = useState(null);
  const actions = (application.actions || []).filter((a) => ACTIONS[a]);
  if (!actions.length) return null;
  const small = size === 'sm' ? '!px-3 !py-1.5 text-sm' : '';
  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Application actions">
        {actions.map((a) => (
          <button key={a} type="button" className={`btn ${ACTIONS[a].primary ? 'btn-primary' : 'btn-glass'} ${small}`} onClick={() => setOpen(a)}>{ACTIONS[a].label}</button>
        ))}
      </div>
      {open && <ActionDialog action={open} application={application} onClose={() => setOpen(null)} onDone={(result, action) => { setOpen(null); onDone?.(result, action); }} />}
    </>
  );
}

import { useState } from 'react';
import ReasonDialog from './ReasonDialog';
import { adminVerificationApi } from '../../services/adminApi';

// What each server-offered action looks like. The page only draws `submission.actions`; it never decides what is allowed.
const ACTIONS = {
  approve: { label: 'Approve', decision: 'approved', primary: true, title: 'Approve this submission?', confirm: 'Approve', recipientIntro: 'The organisation will be able to request donated devices.', providerIntro: 'The documents are marked approved and the person can start offering services.' },
  reject: { label: 'Refuse', decision: 'rejected', danger: true, title: 'Refuse this submission?', confirm: 'Refuse', required: true, field: 'Reason', hint: 'The applicant reads this. Say what was wrong.', intro: 'The applicant is told it was not approved and why. They can send new documents afterwards.' },
  request_resubmission: { label: 'Ask for new documents', decision: 'resubmission_required', title: 'Ask for new documents?', confirm: 'Send request', required: true, field: 'What should they send', hint: 'For example: a clearer photo of the front and back.', intro: 'The documents sent so far are set aside and the applicant is asked to upload again.' },
};

/** Approve, refuse or ask for new documents. */
export default function DecisionActions({ submission, onDone }) {
  const [open, setOpen] = useState(null);
  if (!submission.actions?.length) return null;
  const spec = open ? ACTIONS[open] : null;
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {submission.actions.filter((a) => ACTIONS[a]).map((a) => (
          <button key={a} type="button" className={ACTIONS[a].primary ? 'btn btn-primary' : ACTIONS[a].danger ? 'btn btn-glass text-danger' : 'btn btn-glass'} onClick={() => setOpen(a)}>{ACTIONS[a].label}</button>
        ))}
      </div>
      {spec && (
        <ReasonDialog
          title={spec.title}
          intro={spec.intro || (submission.type === 'recipient' ? spec.recipientIntro : spec.providerIntro)}
          confirmLabel={spec.confirm}
          danger={spec.danger}
          required={spec.required}
          field={spec.field}
          hint={spec.hint}
          submit={(reason) => adminVerificationApi.decide(submission.userId, { type: submission.type, decision: spec.decision, ...(reason ? { reason } : {}) })}
          onClose={() => setOpen(null)}
          onDone={(updated) => { setOpen(null); onDone(updated); }}
        />
      )}
    </>
  );
}

import { useState } from 'react';
import { PackageCheck } from 'lucide-react';
import ActionBox from './ActionBox';
import { CHECKLIST_MESSAGE, HANDOVER_CHECKLIST } from '../../lib/handover';

/**
 * One side confirms that the device changed hands. The person handing the device over (`needsChecklist`) must first tick
 * the data-protection checklist (BR-12); the server refuses the confirmation without it. `status` says who has confirmed.
 * `onConfirm(payload)` performs the request.
 */
export default function ConfirmHandover({ title, icon = PackageCheck, status, needsChecklist, checklist = HANDOVER_CHECKLIST, legend = 'Before you hand over your device', submitLabel, busy, onConfirm }) {
  const [ack, setAck] = useState(false);
  const [error, setError] = useState('');

  const submit = (e) => {
    e.preventDefault();
    if (needsChecklist && !ack) return setError(CHECKLIST_MESSAGE);
    setError('');
    return onConfirm(needsChecklist ? { acknowledgeChecklist: true } : {});
  };

  return (
    <ActionBox title={title} icon={icon}>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{status}</p>
      <form onSubmit={submit} noValidate className="space-y-3">
        {needsChecklist && (
          <fieldset className="rounded-xl bg-primary/5 p-3">
            <legend className="px-1 text-sm font-semibold text-ink dark:text-white">{legend}</legend>
            <ul className="list-disc pl-5 text-sm text-ink dark:text-[#E8F1EB]">
              {checklist.map((line) => <li key={line}>{line}</li>)}
            </ul>
            <label className="mt-3 flex items-start gap-3 text-sm text-ink dark:text-white">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1E8449]" />
              <span>I have completed this checklist</span>
            </label>
            {error && <p role="alert" className="mt-2 text-xs font-medium text-danger dark:text-red-300">{error}</p>}
          </fieldset>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>{submitLabel}</button>
      </form>
    </ActionBox>
  );
}

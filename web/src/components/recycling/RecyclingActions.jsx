import { useState } from 'react';
import { CalendarClock, CheckCircle2, Inbox, PackageCheck, Scale, Truck, XCircle } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import Alert from '../ui/Alert';
import ConfirmDialog from '../ui/ConfirmDialog';
import TextField from '../ui/TextField';
import { useSave } from '../../hooks/useSave';
import { recyclingApi } from '../../services/recyclingApi';
import { MATERIALS } from '../../lib/recycling';
import { formatDate } from '../../lib/requests';
import { friendlyMessage } from '../../utils/errors';
import ActionBox from '../handover/ActionBox';
import ConfirmHandover from '../handover/ConfirmHandover';
import SchedulePickup from '../handover/SchedulePickup';

const Box = ActionBox;

function PickupForm({ request: r, run, busy }) {
  const rescheduling = Boolean(r.pickup);
  return (
    <SchedulePickup
      title={rescheduling ? 'Change the pickup time' : 'Schedule the pickup'}
      notesLabel="Notes for the requester (optional)"
      submitLabel={rescheduling ? 'Reschedule' : 'Schedule pickup'}
      busy={busy}
      onSubmit={(payload) => run(() => recyclingApi.pickup(r._id, payload), rescheduling ? 'Pickup rescheduled' : 'Pickup scheduled')}
    >
      {r.pickup && <p className="text-sm text-ink dark:text-[#E8F1EB]">Currently: {formatDate(r.pickup.date)}{r.pickup.timeSlot ? ` (${r.pickup.timeSlot})` : ''}</p>}
      {r.preferredDate && !r.pickup && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">The requester would like a pickup around {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(r.preferredDate))}.</p>}
    </SchedulePickup>
  );
}

function ConfirmBox({ request: r, run, busy }) {
  const requester = r.viewerRole === 'requester';
  const c = r.confirmations || {};
  return (
    <ConfirmHandover
      title={requester ? 'Confirm you handed over the devices' : 'Confirm you collected the devices'}
      status={`Both sides confirm when the devices change hands. Requester: ${c.requester ? 'confirmed' : 'not yet'}. Centre: ${c.center ? 'confirmed' : 'not yet'}.`}
      needsChecklist={requester}
      legend="Before you hand over your devices"
      submitLabel={requester ? 'Confirm handover' : 'I collected the devices'}
      busy={busy}
      onConfirm={(payload) => run(() => recyclingApi.confirmHandover(r._id, payload), 'Handover confirmed')}
    />
  );
}

/** Weighed (actual) and estimated amounts are separate inputs and stay separate everywhere (BR-06). */
function MaterialsForm({ request: r, run, busy }) {
  const initial = Object.fromEntries(MATERIALS.map(([t]) => {
    const m = (r.materials || []).find((x) => x.type === t);
    return [t, { actual: m?.actualKg ?? '', estimated: m?.estimatedKg ?? '' }];
  }));
  const [rows, setRows] = useState(initial);
  const [notes, setNotes] = useState(r.reportNotes || '');
  const [error, setError] = useState('');

  const set = (type, field) => (e) => { setRows((v) => ({ ...v, [type]: { ...v[type], [field]: e.target.value } })); setError(''); };
  const submit = (e) => {
    e.preventDefault();
    const materials = [];
    for (const [type] of MATERIALS) {
      const { actual, estimated } = rows[type];
      const a = String(actual).trim();
      const s = String(estimated).trim();
      if (a === '' && s === '') continue;
      const entry = { type };
      if (a !== '') entry.actualKg = Number(a);
      if (s !== '') entry.estimatedKg = Number(s);
      if ((entry.actualKg !== undefined && (Number.isNaN(entry.actualKg) || entry.actualKg < 0)) || (entry.estimatedKg !== undefined && (Number.isNaN(entry.estimatedKg) || entry.estimatedKg < 0))) {
        return setError('Weights must be numbers of 0 or more.');
      }
      materials.push(entry);
    }
    if (materials.length === 0) return setError('Enter at least one weight.');
    setError('');
    return run(() => recyclingApi.materials(r._id, { materials, ...(notes.trim() ? { reportNotes: notes.trim() } : {}) }), 'Materials saved');
  };

  return (
    <Box title="Record the recovered materials" icon={Scale}>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Enter what you weighed in the first column. Use the second column only for estimates. The two are stored and shown separately, and only weighed amounts count towards verified impact.</p>
      <form onSubmit={submit} noValidate className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[320px] text-sm">
            <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]"><th scope="col" className="py-1 pr-2">Material</th><th scope="col" className="py-1 pr-2">Weighed (kg)</th><th scope="col" className="py-1">Estimated (kg)</th></tr></thead>
            <tbody>
              {MATERIALS.map(([type, label]) => (
                <tr key={type}>
                  <th scope="row" className="py-1 pr-2 text-left font-semibold text-ink dark:text-white">{label}</th>
                  <td className="py-1 pr-2"><input className="input" type="number" inputMode="decimal" min="0" step="any" aria-label={`${label} weighed (kg)`} value={rows[type].actual} onChange={set(type, 'actual')} /></td>
                  <td className="py-1"><input className="input" type="number" inputMode="decimal" min="0" step="any" aria-label={`${label} estimated (kg)`} value={rows[type].estimated} onChange={set(type, 'estimated')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && <p role="alert" className="text-xs font-medium text-danger dark:text-red-300">{error}</p>}
        <TextField as="textarea" rows={2} label="Notes for the report (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
        <button type="submit" className="btn btn-primary" disabled={busy}>Save materials</button>
      </form>
    </Box>
  );
}

/**
 * Everything the viewer can do next. The server decides which actions are allowed (`request.actions`); this component
 * only renders the matching controls, so the rules are never duplicated in the browser.
 */
export default function RecyclingActions({ request: r, onChanged }) {
  const save = useSave();
  const [dialog, setDialog] = useState('');
  const [reason, setReason] = useState('');
  const has = (a) => (r.actions || []).includes(a);
  const busy = save.saving;
  const close = () => { setDialog(''); setReason(''); save.reset(); };
  const run = async (action, message) => {
    const res = await save.run(action, message);
    if (res.ok) { onChanged(res.result, message); setDialog(''); setReason(''); }
    return res;
  };
  const setStatus = (status, message, why) => run(() => recyclingApi.setStatus(r._id, status, why), message);
  const mine = r.viewerRole === 'requester' ? r.confirmations?.requester : r.confirmations?.center;
  const other = r.viewerRole === 'requester' ? 'centre' : 'requester';

  const panels = [];
  if (has('accept')) {
    panels.push(
      <Box key="decide" title="Decide on this request" icon={Inbox}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">{r.requester?.name} wants to send {r.deviceCount} {r.deviceCount === 1 ? 'device' : 'devices'} from {r.pickupAddressArea}. The exact address is shared once you accept.</p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus('accepted', 'Request accepted')}>Accept request</button>
          <button type="button" className="btn btn-glass" disabled={busy} onClick={() => { save.reset(); setDialog('reject'); }}>Decline request</button>
        </div>
      </Box>,
    );
  }
  if (has('schedule_pickup')) panels.push(<PickupForm key="pickup" request={r} run={run} busy={busy} />);
  if (has('confirm_handover')) panels.push(<ConfirmBox key="confirm" request={r} run={run} busy={busy} />);
  else if (r.status === 'pickup_scheduled' && mine && ['requester', 'center'].includes(r.viewerRole)) {
    panels.push(<Alert key="waiting" variant="info">You have confirmed the handover. Waiting for the {other} to confirm; the request moves on as soon as they do.</Alert>);
  }
  if (has('mark_received')) {
    panels.push(
      <Box key="received" title="Devices arrived" icon={Truck}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Mark the request as received once the devices are at your centre.</p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus('received_at_center', 'Marked as received')}>Mark as received at the centre</button>
      </Box>,
    );
  }
  if (has('record_materials')) panels.push(<MaterialsForm key={`materials-${(r.materials || []).length}`} request={r} run={run} busy={busy} />);
  if (has('process')) {
    panels.push(
      <Box key="process" title="Finish processing" icon={CheckCircle2}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Materials are recorded. Mark the request as processed when the devices have been dismantled.</p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => setStatus('processed', 'Marked as processed')}>Mark as processed</button>
      </Box>,
    );
  }
  if (has('complete')) {
    panels.push(
      <Box key="complete" title="Complete the request" icon={CheckCircle2}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">You can still correct the materials above until you complete it.</p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { save.reset(); setDialog('complete'); }}>Complete recycling</button>
      </Box>,
    );
  }
  if (has('cancel')) {
    panels.push(
      <div key="cancel">
        <button type="button" className="btn btn-glass" disabled={busy} onClick={() => { save.reset(); setDialog('cancel'); }}><XCircle size={16} aria-hidden /> Cancel this request</button>
      </div>,
    );
  }

  return (
    <>
      {(panels.length > 0 || save.status === 'error') && (
        <GlassCard className="space-y-4" aria-label="What you can do now" as="section">
          <h2 className="text-lg font-bold text-ink dark:text-white">What to do next</h2>
          <Alert variant="error">{save.status === 'error' && !dialog ? friendlyMessage(save.error) : ''}</Alert>
          {panels}
        </GlassCard>
      )}

      <ConfirmDialog open={dialog === 'reject'} title="Decline this request?" confirmLabel="Decline request" danger busy={busy} onConfirm={() => setStatus('rejected', 'Request declined', reason.trim())} onCancel={close}>
        <p className="mb-3 text-sm text-ink dark:text-[#E8F1EB]">The requester is told, and their device is released.</p>
        <TextField as="textarea" rows={2} label="Reason (shared with the requester)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <Alert variant="error" className="mt-3">{save.status === 'error' && dialog === 'reject' ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'complete'} title="Complete this request?" confirmLabel="Complete recycling" busy={busy} onConfirm={() => setStatus('completed', 'Recycling completed')} onCancel={close}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">The weighed amounts are added to your centre totals and recorded as verified impact for the requester. Estimates are never counted as verified.</p>
        <Alert variant="error" className="mt-3">{save.status === 'error' && dialog === 'complete' ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'cancel'} title="Cancel this request?" confirmLabel="Cancel request" danger busy={busy} onConfirm={() => run(() => recyclingApi.cancel(r._id, reason.trim()), 'Request cancelled')} onCancel={close}>
        <p className="mb-3 text-sm text-ink dark:text-[#E8F1EB]">The other side is told, and any device held for this request is released.</p>
        <TextField as="textarea" rows={2} label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <Alert variant="error" className="mt-3">{save.status === 'error' && dialog === 'cancel' ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>
    </>
  );
}

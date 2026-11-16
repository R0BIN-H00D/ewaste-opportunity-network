import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Camera, HandCoins, PackageCheck, Store, Wrench, XCircle } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import Alert from '../ui/Alert';
import ConfirmDialog from '../ui/ConfirmDialog';
import TextField from '../ui/TextField';
import PhotoPicker from '../devices/PhotoPicker';
import { useSave } from '../../hooks/useSave';
import { refurbApi } from '../../services/refurbishmentApi';
import { ADVANCE_LABEL } from '../../lib/refurbishment';
import { formatDate, formatMoney } from '../../lib/requests';
import { friendlyMessage } from '../../utils/errors';
import ActionBox from '../handover/ActionBox';
import ConfirmHandover from '../handover/ConfirmHandover';
import SchedulePickup from '../handover/SchedulePickup';

const Box = ActionBox;

function HandoverForm({ job: j, run, busy }) {
  const rescheduling = Boolean(j.pickup);
  return (
    <SchedulePickup
      title={rescheduling ? 'Change the collection time' : 'Arrange the collection'}
      submitLabel={rescheduling ? 'Reschedule' : 'Schedule collection'}
      busy={busy}
      onSubmit={(payload) => run(() => refurbApi.handover(j._id, payload), rescheduling ? 'Collection rescheduled' : 'Collection scheduled')}
    >
      {j.pickup && <p className="text-sm text-ink dark:text-[#E8F1EB]">Currently: {formatDate(j.pickup.date)}{j.pickup.timeSlot ? ` (${j.pickup.timeSlot})` : ''}</p>}
    </SchedulePickup>
  );
}

function ConfirmBox({ job: j, run, busy }) {
  const owner = j.viewerRole === 'owner';
  const c = j.confirmations || {};
  return (
    <ConfirmHandover
      title={owner ? 'Confirm you handed over the device' : 'Confirm you collected the device'}
      status={`Both sides confirm when the device changes hands. Owner: ${c.owner ? 'confirmed' : 'not yet'}. Refurbisher: ${c.refurbisher ? 'confirmed' : 'not yet'}.`}
      needsChecklist={owner}
      submitLabel={owner ? 'Confirm handover' : 'I collected the device'}
      busy={busy}
      onConfirm={(payload) => run(() => refurbApi.confirmHandover(j._id, payload), 'Handover confirmed')}
    />
  );
}

function AdvanceBox({ job: j, run, busy }) {
  const [note, setNote] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    const res = await run(() => refurbApi.advance(j._id, j.nextStatus, note.trim()), 'Job updated');
    if (res.ok) setNote('');
  };
  return (
    <Box title="Move the job forward" icon={Wrench}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <TextField as="textarea" rows={2} label="Note for the work log (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{ADVANCE_LABEL[j.nextStatus] || 'Next step'}</button>
      </form>
    </Box>
  );
}

function PhotosBox({ job: j, run, busy }) {
  const stages = j.photoStages || [];
  const [picked, setPicked] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const stage = stages.includes(picked) ? picked : stages[0];
  const submit = async (e) => {
    e.preventDefault();
    if (files.length === 0) return setError('Choose at least one photo.');
    setError('');
    const res = await run(() => refurbApi.addPhotos(j._id, stage, files), 'Photos added');
    if (res.ok) setFiles([]);
    return res;
  };
  if (!stage) return null;
  return (
    <Box title="Before and after photos" icon={Camera}>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Add clear photos from before the work started and after it finished. At least one of each is needed before the device can be listed.</p>
      <form onSubmit={submit} noValidate className="space-y-3">
        {stages.length > 1 && (
          <fieldset className="flex flex-wrap gap-4">
            <legend className="sr-only">Which photos are these?</legend>
            {stages.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm text-ink dark:text-white">
                <input type="radio" name="stage" value={s} checked={stage === s} onChange={() => setPicked(s)} className="h-4 w-4 accent-[#1E8449]" />
                {s === 'before' ? 'Before the work' : 'After the work'}
              </label>
            ))}
          </fieldset>
        )}
        {stages.length === 1 && <p className="text-sm font-semibold text-ink dark:text-white">{stage === 'before' ? 'Before the work' : 'After the work'}</p>}
        <PhotoPicker files={files} onFiles={setFiles} existing={[]} removed={[]} onRemoved={() => {}} error={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>Upload photos</button>
      </form>
    </Box>
  );
}

/**
 * Everything the viewer can do next. The server decides which actions are allowed (`job.actions`); this component only
 * renders the matching controls, so the rules are never duplicated in the browser.
 */
export default function JobActions({ job: j, onChanged }) {
  const save = useSave();
  const [dialog, setDialog] = useState('');
  const [reason, setReason] = useState('');
  const has = (a) => (j.actions || []).includes(a);
  const busy = save.saving;
  const close = () => { setDialog(''); setReason(''); save.reset(); };

  const run = async (action, message) => {
    const res = await save.run(action, message);
    if (res.ok) { onChanged(res.result, message); setDialog(''); setReason(''); }
    return res;
  };

  const who = j.refurbisher?.businessName || j.refurbisher?.name;
  const mine = j.viewerRole === 'owner' ? j.confirmations?.owner : j.confirmations?.refurbisher;
  const other = j.viewerRole === 'owner' ? 'refurbisher' : 'owner';

  const panels = [];
  if (has('decide')) {
    panels.push(
      <Box key="decide" title="Decide on this offer" icon={HandCoins}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">
          {who} offers {j.offer.amount > 0 ? formatMoney(j.offer.amount) : 'to collect it free of charge'}.
          {j.offer.amount > 0 && ' You are paid directly by them; the platform never handles money.'}
        </p>
        {j.offer.message && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">“{j.offer.message}”</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { save.reset(); setDialog('accept'); }}>Accept offer</button>
          <button type="button" className="btn btn-glass" disabled={busy} onClick={() => run(() => refurbApi.decide(j._id, 'reject'), 'Offer declined')}>Decline offer</button>
        </div>
      </Box>,
    );
  }
  if (has('withdraw')) {
    panels.push(
      <Box key="withdraw" title="Your offer is with the owner" icon={HandCoins}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">You will be notified when the owner decides.</p>
        <button type="button" className="btn btn-glass" disabled={busy} onClick={() => run(() => refurbApi.withdraw(j._id), 'Offer withdrawn')}>Withdraw my offer</button>
      </Box>,
    );
  }
  if (has('schedule_handover')) panels.push(<HandoverForm key="handover" job={j} run={run} busy={busy} />);
  if (has('confirm_handover')) panels.push(<ConfirmBox key="confirm" job={j} run={run} busy={busy} />);
  else if (j.status === 'accepted' && mine && ['owner', 'refurbisher'].includes(j.viewerRole)) {
    panels.push(<Alert key="waiting" variant="info">You have confirmed the handover. Waiting for the {other} to confirm; the job moves on as soon as they do.</Alert>);
  }
  if (has('advance') && j.nextStatus) panels.push(<AdvanceBox key="advance" job={j} run={run} busy={busy} />);
  if (has('list_product')) {
    panels.push(
      <Box key="list" title="Put it on the marketplace" icon={Store}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">The work is done and photographed. List the device as a refurbished product with its condition, a price and what you did to it.</p>
        <Link to={`/dashboard/products/new?job=${j._id}`} className="btn btn-primary">List as a product</Link>
      </Box>,
    );
  }
  if (has('add_photos')) panels.push(<PhotosBox key="photos" job={j} run={run} busy={busy} />);
  if (has('cancel')) {
    panels.push(
      <div key="cancel">
        <button type="button" className="btn btn-glass" disabled={busy} onClick={() => { save.reset(); setDialog('cancel'); }}><XCircle size={16} aria-hidden /> Cancel this job</button>
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

      <ConfirmDialog open={dialog === 'accept'} title="Choose this refurbisher?" confirmLabel="Choose this refurbisher" busy={busy} onConfirm={() => run(() => refurbApi.decide(j._id, 'accept'), 'Offer accepted')} onCancel={close}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">{who} will collect the device. Your device is reserved for them and other offers on it are declined.</p>
        <Alert variant="error" className="mt-3">{save.status === 'error' && dialog === 'accept' ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === 'cancel'} title="Cancel this job?" confirmLabel="Cancel job" danger busy={busy} onConfirm={() => run(() => refurbApi.cancel(j._id, reason.trim()), 'Job cancelled')} onCancel={close}>
        <p className="mb-3 text-sm text-ink dark:text-[#E8F1EB]">The device becomes available to other refurbishers again.</p>
        <TextField as="textarea" rows={2} label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <Alert variant="error" className="mt-3">{save.status === 'error' && dialog === 'cancel' ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>
    </>
  );
}

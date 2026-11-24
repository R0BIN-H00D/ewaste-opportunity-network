import { useState } from 'react';
import { CalendarClock, CheckCircle2, CreditCard, ClipboardCheck, PackageCheck, Plus, Star, Trash2, Wrench, XCircle } from 'lucide-react';
import Alert from '../ui/Alert';
import ConfirmDialog from '../ui/ConfirmDialog';
import TextField from '../ui/TextField';
import PhotoPicker from '../devices/PhotoPicker';
import ReviewDialog from './ReviewDialog';
import GlassCard from '../glass/GlassCard';
import { useSave } from '../../hooks/useSave';
import { requestApi, reviewApi } from '../../services/repairApi';
import { friendlyMessage } from '../../utils/errors';
import { openCheckout } from '../../lib/razorpay';
import { useAuth } from '../../hooks/useAuth';
import { formatMoney } from '../../lib/requests';
import ActionBox from '../handover/ActionBox';
import ConfirmHandover from '../handover/ConfirmHandover';
import SchedulePickup from '../handover/SchedulePickup';
import { REPAIR_HANDOVER_CHECKLIST } from '../../lib/handover';

// ---- small forms, each one a single action the viewer can take ----

const Box = ActionBox;

function PickupForm({ request, run, busy }) {
  const rescheduling = request.status === 'device_collection_pending';
  return (
    <SchedulePickup
      title={rescheduling ? 'Reschedule the pickup' : 'Schedule the pickup'}
      dateLabel="Pickup date and time"
      notesAs="input"
      submitLabel={rescheduling ? 'Reschedule' : 'Confirm pickup'}
      hint={rescheduling ? 'A pickup can be rescheduled up to 3 times, and not less than 2 hours before it starts.' : undefined}
      busy={busy}
      onSubmit={(payload) => run(() => requestApi.pickup(request._id, payload), rescheduling ? 'Pickup rescheduled' : 'Pickup scheduled')}
    />
  );
}

function HandoverForm({ request, role, run, busy }) {
  const collecting = request.status === 'device_collection_pending';
  const needsChecklist = collecting && role === 'customer';
  const side = request.handover?.[collecting ? 'collect' : 'delivery'] || {};
  return (
    <ConfirmHandover
      title={collecting ? 'Confirm the device handover' : 'Confirm the device was returned'}
      status={`Both of you confirm when the device changes hands. Customer: ${side.owner ? 'confirmed' : 'not yet'}. Technician: ${side.provider ? 'confirmed' : 'not yet'}.`}
      needsChecklist={needsChecklist}
      checklist={REPAIR_HANDOVER_CHECKLIST}
      submitLabel="Confirm handover"
      busy={busy}
      onConfirm={(payload) => run(() => requestApi.handover(request._id, payload), 'Handover confirmed')}
    />
  );
}

const EMPTY_LINE = { label: '', amount: '' };
function QuotationForm({ request, run, busy, revising }) {
  const [amount, setAmount] = useState('');
  const [lines, setLines] = useState([]);
  const [days, setDays] = useState('');
  const [valid, setValid] = useState('7');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState({});

  const lineTotal = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const setLine = (i, patch) => setLines((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const submit = (e) => {
    e.preventDefault();
    const next = {};
    const total = Number(amount);
    if (amount === '' || Number.isNaN(total) || total < 0) next.amount = 'Enter the total charge (0 or more).';
    if (lines.some((l) => !l.label.trim() || l.amount === '' || Number(l.amount) < 0)) next.lines = 'Give every line a name and an amount, or remove the line.';
    else if (lines.length && Math.abs(lineTotal - total) > 0.01) next.amount = `The total must equal the lines (${formatMoney(lineTotal)}).`;
    if (days !== '' && (!Number.isInteger(Number(days)) || Number(days) < 0 || Number(days) > 365)) next.days = 'Enter whole days, between 0 and 365.';
    const validDays = Number(valid);
    if (!Number.isInteger(validDays) || validDays < 1 || validDays > 90) next.valid = 'Offer validity must be between 1 and 90 days.';
    setErrors(next);
    if (Object.keys(next).length) return;
    run(
      () => requestApi.quote(request._id, {
        amount: total,
        ...(lines.length ? { breakdown: lines.map((l) => ({ label: l.label.trim(), amount: Number(l.amount) })) } : {}),
        ...(days !== '' ? { etaDays: Number(days) } : {}),
        validUntil: new Date(Date.now() + validDays * 86400000).toISOString(),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      }),
      'Quotation sent',
    );
  };

  return (
    <Box title={revising ? 'Send a revised quotation' : 'Send your quotation'} icon={ClipboardCheck}>
      {revising && <Alert variant="info">Sending a revised quotation pauses the repair until the customer approves it again.</Alert>}
      <form onSubmit={submit} noValidate className="space-y-3">
        <TextField label="Total charge (₹)" type="number" inputMode="decimal" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} error={errors.amount} />
        <div>
          <p className="mb-1 text-sm font-medium text-ink dark:text-white">Breakdown (optional)</p>
          {lines.map((l, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input className="input" aria-label={`Line ${i + 1} name`} placeholder="e.g. Screen" value={l.label} maxLength={80} onChange={(e) => setLine(i, { label: e.target.value })} />
              <input className="input w-32" aria-label={`Line ${i + 1} amount`} type="number" min="0" placeholder="₹" value={l.amount} onChange={(e) => setLine(i, { amount: e.target.value })} />
              <button type="button" className="btn btn-glass !px-3" aria-label={`Remove line ${i + 1}`} onClick={() => setLines((all) => all.filter((_, j) => j !== i))}><Trash2 size={16} aria-hidden /></button>
            </div>
          ))}
          {errors.lines && <p role="alert" className="mb-2 text-xs font-medium text-danger dark:text-red-300">{errors.lines}</p>}
          {lines.length < 20 && <button type="button" className="btn btn-glass" onClick={() => setLines((all) => [...all, { ...EMPTY_LINE }])}><Plus size={16} aria-hidden /> Add a line</button>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label="Days needed (optional)" type="number" min="0" value={days} onChange={(e) => setDays(e.target.value)} error={errors.days} />
          <TextField label="Offer valid for (days)" type="number" min="1" max="90" value={valid} onChange={(e) => setValid(e.target.value)} error={errors.valid} />
        </div>
        <TextField as="textarea" rows={3} label="Notes for the customer (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        <button type="submit" className="btn btn-primary" disabled={busy}>Send quotation</button>
      </form>
    </Box>
  );
}

function ApproveBox({ request, run, busy, onReject }) {
  const q = request.activeQuotation;
  if (!q) return null;
  return (
    <Box title={`Approve the quotation (${formatMoney(q.amount)})?`} icon={CheckCircle2}>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">The technician starts the repair only after you approve. You pay the technician directly, outside this site.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(() => requestApi.decide(request._id, q._id, { decision: 'accept' }), 'Quotation approved')}>Approve quotation</button>
        <button type="button" className="btn btn-glass" disabled={busy} onClick={onReject}><XCircle size={16} aria-hidden /> Decline</button>
      </div>
    </Box>
  );
}

function ProgressForm({ request, run, busy, completing }) {
  const [note, setNote] = useState('');
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    if (completing && files.length === 0) return setError('Add at least one photo of the repaired device.');
    if (!completing && !note.trim() && files.length === 0) return setError('Add a note or at least one photo.');
    setError('');
    const res = await run(
      () => (completing ? requestApi.setStatus(request._id, 'repair_completed', { note: note.trim(), photos: files }) : requestApi.progress(request._id, { note: note.trim(), photos: files })),
      completing ? 'Repair marked as completed' : 'Update added',
    );
    if (res?.ok) {
      setNote('');
      setFiles([]);
    }
  };
  return (
    <Box title={completing ? 'Mark the repair as completed' : 'Add a progress update'} icon={Wrench}>
      <form onSubmit={submit} noValidate className="space-y-3">
        <TextField as="textarea" rows={3} label={completing ? 'What was done? (optional)' : 'Update for the customer'} value={note} onChange={(e) => setNote(e.target.value)} maxLength={completing ? 500 : 1000} />
        <PhotoPicker files={files} onFiles={setFiles} existing={[]} removed={[]} onRemoved={() => {}} error={error} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{completing ? 'Mark as completed' : 'Post update'}</button>
      </form>
    </Box>
  );
}

function ReasonDialog({ open, title, label, required, extra, confirmLabel, busy, onConfirm, onCancel }) {
  const [reason, setReason] = useState('');
  const [flag, setFlag] = useState(false);
  const [error, setError] = useState('');
  const confirm = () => {
    if (required && reason.trim().length < 3) return setError('Please give a short reason.');
    setError('');
    onConfirm(reason.trim(), flag);
  };
  return (
    <ConfirmDialog open={open} danger title={title} confirmLabel={confirmLabel} busy={busy} onConfirm={confirm} onCancel={onCancel}>
      <TextField as="textarea" rows={3} label={label} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} error={error} />
      {extra && (
        <label className="mt-3 flex items-start gap-3 text-sm text-ink dark:text-white">
          <input type="checkbox" checked={flag} onChange={(e) => setFlag(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1E8449]" />
          <span>{extra}</span>
        </label>
      )}
    </ConfirmDialog>
  );
}

/**
 * Everything the viewer can do next. The server decides which actions are allowed (`request.actions`); this component
 * only renders the matching controls, so the rules are never duplicated in the browser.
 */
export default function ActionPanel({ request, onChanged }) {
  const save = useSave();
  const [dialog, setDialog] = useState('');
  const actions = request.actions || [];
  const role = request.viewerRole;
  const has = (a) => actions.includes(a);

  const run = async (action, message) => {
    const res = await save.run(action, message);
    if (res.ok) onChanged(res.result, message);
    return res;
  };
  const busy = save.saving;
  const { user } = useAuth();
  const pay = () => run(async () => {
    const session = await requestApi.startPayment(request._id);
    let response;
    try {
      response = await openCheckout(session, { name: user?.name, email: user?.email });
    } catch (err) {
      if (err.cancelled) return request; // closed the window: nothing changes
      throw err;
    }
    return requestApi.verifyPayment(request._id, response);
  }, 'Payment received');
  const close = () => setDialog('');
  const simple = (label, action, message, { primary = true } = {}) => (
    <button type="button" className={`btn ${primary ? 'btn-primary' : 'btn-glass'}`} disabled={busy} onClick={() => run(action, message)}>{label}</button>
  );

  const onlyCancel = actions.length === 1 && has('cancel');
  if (actions.length === 0) return null;

  return (
    <GlassCard className="space-y-4" aria-label="What you can do now" as="section">
      <h2 className="text-lg font-bold text-ink dark:text-white">{onlyCancel ? 'Manage this request' : 'What to do next'}</h2>
      <Alert variant="error">{save.status === 'error' && dialog !== 'review' ? friendlyMessage(save.error) : ''}</Alert>

      {has('accept') && (
        <Box title="A customer needs your help" icon={Wrench}>
          <div className="flex flex-wrap gap-2">
            {simple('Accept this job', () => requestApi.setStatus(request._id, 'technician_assigned'), 'You accepted the job')}
            {has('reject') && <button type="button" className="btn btn-glass" disabled={busy} onClick={() => setDialog('decline')}>Decline</button>}
          </div>
        </Box>
      )}
      {has('schedule_pickup') && <PickupForm request={request} run={run} busy={busy} />}
      {has('confirm_handover') && <HandoverForm request={request} role={role} run={run} busy={busy} />}
      {has('start_diagnosis') && (
        <Box title="Ready to look at the device?" icon={ClipboardCheck}>
          {simple('Start diagnosis', () => requestApi.setStatus(request._id, 'diagnosis_in_progress'), 'Diagnosis started')}
        </Box>
      )}
      {(has('submit_quotation') || has('revise_quotation')) && <QuotationForm request={request} run={run} busy={busy} revising={has('revise_quotation')} />}
      {has('approve_quotation') && <ApproveBox request={request} run={run} busy={busy} onReject={() => setDialog('quote')} />}
      {has('add_progress') && <ProgressForm request={request} run={run} busy={busy} />}
      {has('complete_repair') && <ProgressForm request={request} run={run} busy={busy} completing />}
      {has('start_delivery') && (
        <SchedulePickup
          title="Repair done: arrange the return"
          icon={PackageCheck}
          dateLabel="When will you bring it back?"
          notesLabel="Note for the customer (optional)"
          notesAs="input"
          submitLabel="Arrange delivery"
          hint="The customer sees this time and confirms the handover when they have the device."
          busy={busy}
          onSubmit={({ date, timeSlot, notes }) => run(
            () => requestApi.setStatus(request._id, 'device_delivery_pending', { returnDate: date, returnSlot: timeSlot, note: notes }),
            'Delivery arranged',
          )}
        />
      )}
      {has('pay') && (
        <Box title="Pay for the repair online" icon={CreditCard}>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Optional. Pay the approved quote of {formatMoney(request.activeQuotation?.amount)} here, or pay the technician directly instead.</p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={pay}>{busy ? 'Opening payment…' : `Pay ${formatMoney(request.activeQuotation?.amount)}`}</button>
        </Box>
      )}
      {has('confirm_completion') && (
        <Box title="Happy with the repair?" icon={CheckCircle2}>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Confirming records the job as complete and adds it to the environmental impact numbers. Pay the technician directly.</p>
          {simple('Confirm the repair is complete', () => requestApi.confirmCompletion(request._id), 'Service completed')}
        </Box>
      )}
      {has('review') && (
        <Box title="How did it go?" icon={Star}>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Your review helps other people choose a technician.</p>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { save.reset(); setDialog('review'); }}>Review the technician</button>
        </Box>
      )}
      {has('cancel') && (
        <div>
          <button type="button" className="btn btn-glass" disabled={busy} onClick={() => setDialog('cancel')}>Cancel this request</button>
        </div>
      )}

      <ReviewDialog
        open={dialog === 'review'}
        providerName={request.technician?.name}
        busy={busy}
        error={save.status === 'error' ? friendlyMessage(save.error) : ''}
        onCancel={close}
        onSubmit={async (values) => {
          const res = await run(async () => {
            await reviewApi.create({ contextType: 'service', contextId: request._id, ...values });
            return requestApi.get(request._id);
          }, 'Thank you for your review');
          if (res.ok) close();
        }}
      />
      <ReasonDialog open={dialog === 'decline'} title="Decline this job?" label="Reason (shown to the customer)" required confirmLabel="Decline job" busy={busy} onCancel={close}
        onConfirm={(reason) => { close(); run(() => requestApi.setStatus(request._id, 'rejected', { note: reason }), 'Job declined'); }} />
      <ReasonDialog open={dialog === 'quote'} title="Decline this quotation?" label="Tell the technician why" required extra="Cancel the whole request instead of asking for a new quotation" confirmLabel="Decline quotation" busy={busy} onCancel={close}
        onConfirm={(reason, cancel) => { close(); run(() => requestApi.decide(request._id, request.activeQuotation._id, { decision: 'reject', reason, ...(cancel ? { cancel: true } : {}) }), 'Quotation declined'); }} />
      <ReasonDialog open={dialog === 'cancel'} title="Cancel this request?" label="Reason (optional)" confirmLabel="Cancel request" busy={busy} onCancel={close}
        onConfirm={(reason) => { close(); run(() => requestApi.cancel(request._id, reason), 'Request cancelled'); }} />
    </GlassCard>
  );
}

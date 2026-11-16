import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, CalendarClock, HandHeart, PackageCheck, XCircle } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import Alert from '../ui/Alert';
import Badge from '../ui/Badge';
import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';
import TextField from '../ui/TextField';
import { useSave } from '../../hooks/useSave';
import { donationApi } from '../../services/donationApi';
import { formatDate } from '../../lib/requests';
import { ORG_TYPES, REQUEST_STATUS } from '../../lib/donations';
import { friendlyMessage } from '../../utils/errors';
import ActionBox from '../handover/ActionBox';
import ConfirmHandover from '../handover/ConfirmHandover';
import SchedulePickup from '../handover/SchedulePickup';

const Box = ActionBox;

const orgLabel = (type) => ORG_TYPES.find(([k]) => k === type)?.[1] || type;

/** Asks the donor for a reason (organisation requests need a real justification). */
function RequestDialog({ open, title, busy, error, onSubmit, onCancel }) {
  const [justification, setJustification] = useState('');
  const [intendedUse, setIntendedUse] = useState('');
  const [problem, setProblem] = useState('');
  const submit = () => {
    if (justification.trim().length < 10) return setProblem('Tell the donor why you need this device (at least a sentence).');
    setProblem('');
    return onSubmit({ justification: justification.trim(), ...(intendedUse.trim() ? { intendedUse: intendedUse.trim() } : {}) });
  };
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="Request this device"
      footer={<>
        <button type="button" className="btn btn-glass" onClick={onCancel} disabled={busy}>Cancel</button>
        <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button>
      </>}
    >
      <div className="space-y-3">
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{title}. The donor sees your organisation name and chooses one recipient.</p>
        <TextField as="textarea" rows={4} label="Why does your organisation need it?" value={justification} onChange={(e) => setJustification(e.target.value)} maxLength={1000} error={problem} />
        <TextField label="How will it be used? (optional)" value={intendedUse} onChange={(e) => setIntendedUse(e.target.value)} maxLength={500} />
        <Alert variant="error">{error}</Alert>
      </div>
    </Modal>
  );
}

function HandoverForm({ donation: d, run, busy }) {
  const rescheduling = d.status === 'handover_scheduled';
  return (
    <SchedulePickup
      title={rescheduling ? 'Change the handover time' : 'Arrange the handover'}
      submitLabel={rescheduling ? 'Reschedule' : 'Schedule handover'}
      busy={busy}
      onSubmit={(payload) => run(() => donationApi.handover(d._id, payload), rescheduling ? 'Handover rescheduled' : 'Handover scheduled')}
    >
      {d.pickup && <p className="text-sm text-ink dark:text-[#E8F1EB]">Currently: {formatDate(d.pickup.date)}{d.pickup.timeSlot ? ` (${d.pickup.timeSlot})` : ''}</p>}
    </SchedulePickup>
  );
}

function ConfirmBox({ donation: d, run, busy }) {
  const donor = d.viewerRole === 'donor';
  const c = d.confirmations || {};
  return (
    <ConfirmHandover
      title={donor ? 'Confirm you handed over the device' : 'Confirm you received the device'}
      status={`Both sides confirm when the device changes hands. Donor: ${c.donor ? 'confirmed' : 'not yet'}. Recipient: ${c.recipient ? 'confirmed' : 'not yet'}.`}
      needsChecklist={donor}
      submitLabel={donor ? 'Confirm handover' : 'I received the device'}
      busy={busy}
      onConfirm={(payload) => run(() => donationApi.confirmHandover(d._id, payload), 'Handover confirmed')}
    />
  );
}

/** Requests the donor has received, with accept and decline. */
function RequestList({ donation: d, run, busy, onChoose }) {
  const items = d.requests || [];
  return (
    <GlassCard as="section" aria-label="Requests" className="space-y-3">
      <h2 className="text-lg font-bold text-ink dark:text-white">Requests ({items.length})</h2>
      {items.length === 0 ? (
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">No one has asked for this device yet. Verified schools and organisations can request it from the marketplace.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((r) => {
            const [label, tone] = REQUEST_STATUS[r.status] || [r.status, 'neutral'];
            return (
              <li key={r._id} className="rounded-2xl bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-ink dark:text-white">{r.requester.orgName || r.requester.name}{r.requester.orgType && <span className="font-normal text-ink-muted dark:text-[#9FB2A7]"> · {orgLabel(r.requester.orgType)}</span>}</p>
                  <Badge tone={tone}>{label}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink dark:text-[#E8F1EB]">{r.justification}</p>
                {r.intendedUse && <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">Intended use: {r.intendedUse}</p>}
                <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">Asked on {formatDate(r.createdAt)}</p>
                {r.status === 'pending' && d.actions.includes('decide') && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" className="btn btn-primary" disabled={busy} onClick={() => onChoose(r)} aria-label={`Accept request from ${r.requester.orgName || r.requester.name}`}>Accept</button>
                    <button type="button" className="btn btn-glass" disabled={busy} onClick={() => run(() => donationApi.decide(d._id, r._id, 'reject'), 'Request declined')} aria-label={`Decline request from ${r.requester.orgName || r.requester.name}`}>Decline</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}

/**
 * Everything the viewer can do next. The server decides which actions are allowed (`donation.actions`); this component
 * only renders the matching controls, so the rules are never duplicated in the browser.
 */
export default function DonationActions({ donation: d, signedIn, onChanged }) {
  const save = useSave();
  const [dialog, setDialog] = useState('');
  const [choosing, setChoosing] = useState(null);
  const [reason, setReason] = useState('');
  const actions = d.actions || [];
  const has = (a) => actions.includes(a);
  const busy = save.saving;
  const close = () => { setDialog(''); setChoosing(null); setReason(''); save.reset(); };

  const run = async (action, message) => {
    const res = await save.run(action, message);
    if (res.ok) onChanged(res.result, message);
    return res;
  };
  const inDialog = dialog !== '' || Boolean(choosing);
  const open = ['open', 'requested'].includes(d.status);
  const notEligible = open && !has('request') && d.viewerRole === 'visitor';
  const mine = d.myRequest;

  const panels = [];
  if (has('request')) {
    panels.push(
      <Box key="request" title="Ask for this device" icon={HandHeart}>
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Your verified organisation can ask the donor for this device. The donor chooses one recipient.</p>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => { save.reset(); setDialog('request'); }}>Request this device</button>
      </Box>,
    );
  }
  if (notEligible) {
    panels.push(
      <Box key="eligible" title="Who can request this device" icon={HandHeart}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Only verified schools, colleges and other organisations can request donated devices.</p>
        {signedIn
          ? <Link to="/dashboard/recipient" className="btn btn-glass">Register or check your organisation</Link>
          : <Link to="/login" className="btn btn-glass">Log in to request</Link>}
      </Box>,
    );
  }
  if (mine && mine.status === 'pending' && open) {
    panels.push(
      <Box key="mine" title="Your request is with the donor" icon={HandHeart}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">You will be notified when the donor decides.</p>
        {has('withdraw') && <button type="button" className="btn btn-glass" disabled={busy} onClick={() => run(() => donationApi.withdraw(d._id), 'Request withdrawn')}>Withdraw my request</button>}
      </Box>,
    );
  }
  if (mine && mine.status === 'rejected' && d.viewerRole === 'requester') {
    panels.push(<Alert key="rejected" variant="info">The donor did not choose your request for this device.</Alert>);
  }
  if (has('schedule_handover')) panels.push(<HandoverForm key="handover" donation={d} run={run} busy={busy} />);
  if (has('confirm_handover')) panels.push(<ConfirmBox key="confirm" donation={d} run={run} busy={busy} />);
  else if (d.status === 'handover_scheduled' && ['donor', 'recipient'].includes(d.viewerRole)) {
    const other = d.viewerRole === 'donor' ? 'recipient' : 'donor';
    panels.push(<Alert key="waiting" variant="info">You have confirmed the handover. Waiting for the {other} to confirm; the donation completes as soon as they do.</Alert>);
  }
  if (has('view_confirmation')) {
    panels.push(
      <Box key="doc" title="Donation complete" icon={Award}>
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Reference <strong className="font-numeric">{d.confirmation?.refNo}</strong></p>
        <Link to={`/dashboard/donations/${d._id}/confirmation`} className="btn btn-primary">View confirmation</Link>
      </Box>,
    );
  }
  if (has('cancel')) {
    panels.push(
      <div key="cancel">
        <button type="button" className="btn btn-glass" disabled={busy} onClick={() => { save.reset(); setDialog('cancel'); }}><XCircle size={16} aria-hidden /> Withdraw this donation</button>
      </div>,
    );
  }

  return (
    <>
      {(panels.length > 0 || save.status === 'error') && (
        <GlassCard className="space-y-4" aria-label="What you can do now" as="section">
          <h2 className="text-lg font-bold text-ink dark:text-white">{has('request') || notEligible ? 'Request this device' : 'What to do next'}</h2>
          <Alert variant="error">{save.status === 'error' && !inDialog ? friendlyMessage(save.error) : ''}</Alert>
          {panels}
        </GlassCard>
      )}
      {d.requests && <RequestList donation={d} run={run} busy={busy} onChoose={(r) => { save.reset(); setChoosing(r); }} />}

      <RequestDialog
        open={dialog === 'request'}
        title={d.listing?.title}
        busy={busy}
        error={save.status === 'error' && dialog === 'request' ? friendlyMessage(save.error) : ''}
        onCancel={close}
        onSubmit={async (values) => {
          const res = await run(() => donationApi.request(d._id, values), 'Request sent to the donor');
          if (res.ok) close();
        }}
      />
      <ConfirmDialog
        open={Boolean(choosing)}
        title={`Choose ${choosing?.requester?.orgName || choosing?.requester?.name || 'this recipient'}?`}
        confirmLabel="Choose this recipient"
        busy={busy}
        onCancel={close}
        onConfirm={async () => {
          const res = await run(() => donationApi.decide(d._id, choosing._id, 'accept'), 'Recipient chosen');
          if (res.ok) close();
        }}
      >
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Every other pending request will be declined. You and the recipient can then arrange the handover.</p>
        <Alert variant="error" className="mt-3">{save.status === 'error' && choosing ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === 'cancel'}
        danger
        title="Withdraw this donation?"
        confirmLabel="Withdraw donation"
        busy={busy}
        onCancel={close}
        onConfirm={async () => {
          const res = await run(() => donationApi.cancel(d._id, reason.trim()), 'Donation withdrawn');
          if (res.ok) close();
        }}
      >
        <p className="mb-3 text-sm text-ink dark:text-[#E8F1EB]">Anyone who asked for it will be told. The device goes back to your listings.</p>
        <TextField as="textarea" rows={2} label="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        <Alert variant="error" className="mt-3">{save.status === 'error' && dialog === 'cancel' ? friendlyMessage(save.error) : ''}</Alert>
      </ConfirmDialog>
    </>
  );
}

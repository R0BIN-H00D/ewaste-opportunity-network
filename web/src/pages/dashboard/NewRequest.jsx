import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Send, Users, Wrench } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import TechnicianCard from '../../components/requests/TechnicianCard';
import { Thumb } from '../../components/devices/DeviceCard';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { deviceApi } from '../../services/deviceApi';
import { requestApi, technicianApi } from '../../services/repairApi';
import { friendlyMessage } from '../../utils/errors';

const OPEN = 'open';

/** Step 1: pick which listing needs repair. Only published repair listings can be sent to a technician. */
function ChooseListing({ onPick }) {
  const { data, error, loading, reload } = useFetch(
    (signal) => deviceApi.list({ mine: 'true', status: 'listed', service: 'repair', limit: 50 }, signal),
    [],
  );
  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load your devices" />;
  if (loading && !data) return <div aria-busy className="space-y-3"><Skeleton className="h-24 w-full !rounded-3xl" /><Skeleton className="h-24 w-full !rounded-3xl" /></div>;
  const items = data?.items || [];
  if (items.length === 0) {
    return (
      <EmptyState icon={Wrench} title="You have no devices waiting for repair" action={<Link to="/list-device" className="btn btn-primary">List a device</Link>}>
        List a device and choose “Repair” as the service. Then you can ask a technician to look at it.
      </EmptyState>
    );
  }
  return (
    <section aria-labelledby="pick-device">
      <h2 id="pick-device" className="mb-3 text-lg font-bold text-ink dark:text-white">Which device needs repair?</h2>
      <ul className="space-y-3">
        {items.map((l) => (
          <li key={l._id}>
            <button type="button" onClick={() => onPick(l._id)} aria-label={`Choose ${l.title}`} className="glass flex w-full items-center gap-4 !p-3 text-left transition hover:shadow-e2">
              <Thumb listing={l} className="h-16 w-20 shrink-0 rounded-xl" />
              <span className="font-semibold text-ink dark:text-white">{l.title}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function NewRequest() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const listingId = params.get('listing') || '';
  const preselected = params.get('technician') || '';
  const [choice, setChoice] = useState(preselected || OPEN);
  const [issue, setIssue] = useState('');
  const [onSite, setOnSite] = useState(false);
  const [problem, setProblem] = useState('');
  const save = useSave();

  const listing = useFetch((signal) => deviceApi.get(listingId, signal), [listingId], { enabled: Boolean(listingId) });
  const recs = useFetch((signal) => technicianApi.recommendations(listingId, signal), [listingId], { enabled: Boolean(listingId) });
  // A technician picked from the directory may not be in the top matches; still show them first.
  const picked = useFetch((signal) => technicianApi.get(preselected, signal), [preselected], { enabled: Boolean(preselected) });

  const setListing = (id) => setParams({ listing: id, ...(preselected ? { technician: preselected } : {}) });

  const submit = async (e) => {
    e.preventDefault();
    setProblem('');
    if (issue.trim().length < 3) return setProblem('Describe the problem in a few words so the technician knows what to expect.');
    const res = await save.run(
      () => requestApi.create({ listingId, issueDescription: issue.trim(), onSite, ...(choice !== OPEN ? { technicianId: choice } : {}) }),
      'Request sent',
    );
    if (res.ok) navigate(`/dashboard/requests/${res.result._id}`, { replace: true, state: { flash: 'Your request was sent. We will notify you when a technician responds.' } });
    else setProblem(friendlyMessage(res.error));
  };

  const matches = recs.data || [];
  const hasPicked = picked.data && !matches.some((m) => m.technician._id === picked.data._id);

  return (
    <div className="space-y-5">
      <Link to="/dashboard/requests" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> My requests</Link>
      <h1 className="text-2xl font-bold text-ink dark:text-white">Request a repair</h1>

      {!listingId ? (
        <ChooseListing onPick={setListing} />
      ) : listing.error ? (
        <ErrorState error={listing.error} onRetry={listing.reload} title="Could not load this device" />
      ) : (
        <form onSubmit={submit} noValidate className="space-y-5">
          {listing.data && (
            <GlassCard className="flex items-center gap-4 !p-4">
              <Thumb listing={listing.data} className="h-16 w-20 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink dark:text-white">{listing.data.title}</p>
                <button type="button" className="text-xs font-semibold text-primary underline dark:text-primary-tint" onClick={() => setParams({})}>Choose a different device</button>
              </div>
            </GlassCard>
          )}

          <fieldset className="space-y-3">
            <legend className="mb-1 text-lg font-bold text-ink dark:text-white">Who should look at it?</legend>
            <label className={`glass flex cursor-pointer gap-4 !p-4 ${choice === OPEN ? 'ring-2 ring-secondary-strong' : ''}`}>
              <input type="radio" name="technician" checked={choice === OPEN} onChange={() => setChoice(OPEN)} className="mt-1 h-5 w-5 accent-[#1E8449]" aria-label="Let any suitable technician accept" />
              <span className="flex gap-3"><Users size={22} aria-hidden className="shrink-0 text-primary dark:text-primary-tint" />
                <span><span className="block font-bold text-ink dark:text-white">Let any suitable technician accept</span>
                  <span className="text-sm text-ink-muted dark:text-[#9FB2A7]">Verified technicians nearby who handle this device can see your request. The first to accept gets the job.</span></span>
              </span>
            </label>
            {hasPicked && <TechnicianCard technician={picked.data} selected={choice === picked.data._id} onSelect={setChoice} />}
            {recs.loading && !recs.data ? (
              <div aria-busy><Skeleton className="h-24 w-full !rounded-3xl" /></div>
            ) : recs.error ? (
              <Alert variant="error">{recs.error.message}</Alert>
            ) : matches.length === 0 ? (
              <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">No verified technician near you handles this device yet. You can still post an open request and the first suitable technician to join can accept it.</p>
            ) : (
              <>
                <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Best matches first, based on device type, distance, rating, availability and experience.</p>
                {matches.map((m) => <TechnicianCard key={m.technician._id} technician={m.technician} match={m} selected={choice === m.technician._id} onSelect={setChoice} />)}
              </>
            )}
          </fieldset>

          <GlassCard className="space-y-4">
            <TextField as="textarea" rows={4} label="What is wrong with the device?" value={issue} onChange={(e) => setIssue(e.target.value)} maxLength={2000} hint="For example: the screen is cracked and the laptop will not charge." />
            <label className="flex items-start gap-3 text-sm text-ink dark:text-white">
              <input type="checkbox" checked={onSite} onChange={(e) => setOnSite(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#1E8449]" />
              <span>I would like the repair done at my place (no pickup or delivery)</span>
            </label>
            <Alert variant="info">You and the technician agree on the price after the diagnosis. You pay the technician directly; nothing is charged through this site.</Alert>
            <Alert variant="error">{problem}</Alert>
            <button type="submit" className="btn btn-primary" disabled={save.saving}><Send size={16} aria-hidden /> {save.saving ? 'Sending…' : choice === OPEN ? 'Post request' : 'Send request'}</button>
          </GlassCard>
        </form>
      )}
    </div>
  );
}

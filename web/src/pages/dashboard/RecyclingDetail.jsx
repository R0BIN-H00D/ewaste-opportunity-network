import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Check, MapPin, User } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import MessageButton from '../../components/chat/MessageButton';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import RecyclingActions from '../../components/recycling/RecyclingActions';
import { PhotoGrid } from '../../components/requests/RequestTimeline';
import { useFetch } from '../../hooks/useFetch';
import { recyclingApi } from '../../services/recyclingApi';
import { formatKg, materialLabel, recyclingLabel, recyclingSteps, recyclingTone } from '../../lib/recycling';
import { formatDate } from '../../lib/requests';

function Tracker({ request }) {
  const steps = recyclingSteps(request);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-3" aria-label="Recycling progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2" aria-current={s.state === 'current' ? 'step' : undefined}>
          <span aria-hidden className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${s.state === 'done' ? 'bg-success text-white' : s.state === 'current' ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted'}`}>
            {s.state === 'done' ? <Check size={14} /> : i + 1}
          </span>
          <span className={`text-sm ${s.state === 'todo' ? 'text-ink-muted dark:text-[#9FB2A7]' : 'font-semibold text-ink dark:text-white'}`}>
            {s.label}
            <span className="sr-only">{s.state === 'done' ? ' (done)' : s.state === 'current' ? ' (current step)' : ' (not yet)'}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Weighed and estimated amounts side by side. They are never summed into one figure (BR-06). */
function Materials({ request: r }) {
  if (!r.materials?.length) return null;
  return (
    <GlassCard as="section" aria-label="Recovered materials" className="space-y-3">
      <h2 className="text-lg font-bold text-ink dark:text-white">Recovered materials</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[320px] text-sm text-ink dark:text-[#E8F1EB]">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]"><th scope="col" className="py-1 pr-3">Material</th><th scope="col" className="py-1 pr-3">Weighed</th><th scope="col" className="py-1">Estimated</th></tr></thead>
          <tbody>
            {r.materials.map((m) => (
              <tr key={m.type} className="border-t border-black/5 dark:border-white/10">
                <th scope="row" className="py-1.5 pr-3 text-left font-semibold">{materialLabel(m.type)}</th>
                <td className="py-1.5 pr-3 font-numeric">{formatKg(m.actualKg)}</td>
                <td className="py-1.5 font-numeric">{formatKg(m.estimatedKg)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-black/10 font-bold dark:border-white/20"><th scope="row" className="py-1.5 pr-3 text-left">Total</th><td className="py-1.5 pr-3 font-numeric">{formatKg(r.totals?.actualKg)}</td><td className="py-1.5 font-numeric">{formatKg(r.totals?.estimatedKg)}</td></tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Only weighed amounts count as verified. Estimates are shown for information.</p>
      {r.reportNotes && <p className="text-sm text-ink dark:text-[#E8F1EB]">Notes: {r.reportNotes}</p>}
    </GlassCard>
  );
}

/** One page for both sides: what you see and can do depends on `viewerRole` and `actions` from the server. */
export default function RecyclingDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data, error, loading, reload } = useFetch((signal) => recyclingApi.get(id, signal), [id]);
  const [fresh, setFresh] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const r = fresh?._id === id ? fresh : data;

  if (loading && !r) return <div className="space-y-5" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48 w-full !rounded-3xl" /></div>;
  if (error && !r) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="space-y-5">
        <ErrorState error={missing ? { message: 'This request does not exist or is not yours.' } : error} title={missing ? 'Request not found' : 'Could not load this request'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to="/dashboard/recycling" className="font-semibold text-primary underline dark:text-primary-tint">Back to recycling</Link></p>
      </div>
    );
  }

  const asCenter = r.viewerRole === 'center';
  const names = (r.categories || []).map((c) => c.name).join(', ');
  return (
    <div className="space-y-5">
      <Link to="/dashboard/recycling" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Recycling</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Recycling request {r.refNo}</h1>
        <Badge tone={recyclingTone(r.status)}>{recyclingLabel(r.status)}</Badge>
      </div>
      <Alert variant="success">{flash}</Alert>
      {r.status === 'rejected' && <Alert variant="error">{asCenter ? 'You declined this request' : 'The centre declined this request'}{r.cancelReason ? `: ${r.cancelReason}` : '.'}</Alert>}
      {r.status === 'cancelled' && <Alert variant="info">This request was cancelled{r.cancelReason ? `: ${r.cancelReason}` : '.'}</Alert>}
      <GlassCard><Tracker request={r} /></GlassCard>
      <RecyclingActions request={r} onChanged={(updated, message) => { setFresh(updated); setFlash(message || ''); }} />
      <div><MessageButton contextType="recycling" contextId={r._id} label={asCenter ? 'Message the sender' : 'Message the centre'} /></div>

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard as="section" aria-label="Request details" className="space-y-3">
          <h2 className="text-lg font-bold text-ink dark:text-white">Details</h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm text-ink dark:text-[#E8F1EB]">
            <dt className="font-semibold">Devices</dt><dd>{r.deviceCount}</dd>
            <dt className="font-semibold">Categories</dt><dd>{names || '–'}</dd>
            {r.preferredDate && <><dt className="font-semibold">Preferred date</dt><dd>{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(r.preferredDate))}</dd></>}
            {r.receivedAt && <><dt className="font-semibold">Received</dt><dd>{formatDate(r.receivedAt)}</dd></>}
            {r.completedAt && <><dt className="font-semibold">Completed</dt><dd>{formatDate(r.completedAt)}</dd></>}
          </dl>
          <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><User size={16} aria-hidden />{asCenter ? `Requester: ${r.requester?.name}` : <>Centre: <Link to={`/recycling-centers/${r.center?._id}`} className="font-semibold underline">{r.center?.name}</Link></>}</p>
          <p className="flex items-start gap-2 text-sm text-ink dark:text-[#E8F1EB]"><MapPin size={16} aria-hidden className="mt-0.5 shrink-0" /><span>{r.pickupAddress || r.pickupAddressArea}{r.pickupAddress && r.pickupAddressArea ? ` (${r.pickupAddressArea})` : ''}</span></p>
          {asCenter && !r.pickupAddress && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{['requested', 'rejected', 'cancelled'].includes(r.status) ? 'The exact address is shared once you accept the request, and only until the devices are collected.' : 'The exact address is hidden now that the devices have been collected.'}</p>}
          {r.listing && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Listed device: {r.listing.title}</p>}
          {r.notes && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Note: “{r.notes}”</p>}
          {r.pickup && (
            <div className="rounded-xl bg-primary/5 p-3 text-sm text-ink dark:text-[#E8F1EB]">
              <p className="font-semibold">Pickup: {formatDate(r.pickup.date)}{r.pickup.timeSlot ? ` (${r.pickup.timeSlot})` : ''}</p>
              {r.pickup.notes && <p className="mt-1">{r.pickup.notes}</p>}
            </div>
          )}
          <PhotoGrid photos={r.photos} label="Photo of the devices" />
        </GlassCard>

        <GlassCard as="section" aria-label="Activity">
          <h2 className="mb-3 text-lg font-bold text-ink dark:text-white">Activity</h2>
          <ol className="space-y-3" aria-label="History">
            {[...(r.history || [])].reverse().map((h, i) => (
              <li key={`${h.status}-${h.at}-${i}`} className="border-l-2 border-primary/30 pl-3 text-sm">
                <p className="font-semibold text-ink dark:text-white">{recyclingLabel(h.status)}</p>
                <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(h.at)}</p>
                {h.note && <p className="mt-1 text-ink dark:text-[#E8F1EB]">{h.note}</p>}
              </li>
            ))}
          </ol>
        </GlassCard>
      </div>

      <Materials request={r} />
    </div>
  );
}

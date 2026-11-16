import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Check, MapPin, User } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import JobActions from '../../components/refurbishment/JobActions';
import { PhotoGrid } from '../../components/requests/RequestTimeline';
import { Thumb } from '../../components/devices/DeviceCard';
import { useFetch } from '../../hooks/useFetch';
import { refurbApi } from '../../services/refurbishmentApi';
import { CONDITIONS, labelOf, placeLabel } from '../../lib/devices';
import { jobLabel, jobSteps, jobTone } from '../../lib/refurbishment';
import { formatDate, formatMoney } from '../../lib/requests';

function Tracker({ job }) {
  const steps = jobSteps(job);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-3" aria-label="Refurbishment progress">
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

/** One page for both sides: what you see and can do depends on `viewerRole` and `actions` from the server. */
export default function RefurbJobDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data, error, loading, reload } = useFetch((signal) => refurbApi.job(id, signal), [id]);
  const [fresh, setFresh] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const job = fresh?._id === id ? fresh : data;

  if (loading && !job) return <div className="space-y-5" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48 w-full !rounded-3xl" /></div>;
  if (error && !job) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="space-y-5">
        <ErrorState error={missing ? { message: 'This job does not exist or is not yours.' } : error} title={missing ? 'Job not found' : 'Could not load this job'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to="/dashboard/refurbishment" className="font-semibold text-primary underline dark:text-primary-tint">Back to refurbishment</Link></p>
      </div>
    );
  }

  const j = job;
  const l = j.listing || {};
  const lat = l.location?.coordinates?.[1];
  const lng = l.location?.coordinates?.[0];
  const asOwner = j.viewerRole === 'owner';
  const hasPhotos = (j.beforePhotos?.length || 0) + (j.afterPhotos?.length || 0) > 0;

  return (
    <div className="space-y-5">
      <Link to="/dashboard/refurbishment" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Refurbishment</Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">{l.title}</h1>
        <Badge tone={jobTone(j.status)}>{jobLabel(j.status, j.viewerRole)}</Badge>
      </div>

      <Alert variant="success">{flash}</Alert>
      {j.status === 'listed' && j.product && (
        <Alert variant="success">{asOwner ? 'Your device was refurbished and is on sale again.' : 'This device is on the marketplace.'} {!asOwner && <Link to={`/dashboard/products/${j.product}/edit`} className="font-semibold underline">Manage the product</Link>}</Alert>
      )}
      <GlassCard><Tracker job={j} /></GlassCard>

      <JobActions job={j} onChanged={(updated, message) => { setFresh(updated); setFlash(message || ''); }} />

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard as="section" aria-label="Device and offer" className="space-y-4">
          <div className="flex gap-4">
            <Thumb listing={l} className="h-24 w-32 shrink-0 rounded-2xl" />
            <div className="min-w-0 space-y-1">
              <p className="font-bold text-ink dark:text-white">{l.title}</p>
              <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{[l.category?.name, l.brand, l.model].filter(Boolean).join(' · ')}</p>
              <Badge tone={l.condition === 'fully_working' ? 'green' : 'amber'}>{labelOf(CONDITIONS, l.condition)}</Badge>
            </div>
          </div>
          {l.description && <div><h2 className="text-sm font-bold text-ink dark:text-white">About the device</h2><p className="mt-1 text-sm text-ink dark:text-[#E8F1EB]">{l.description}</p></div>}
          <PhotoGrid photos={l.device?.photos} label="Photo of the device" />
          <div className="rounded-2xl bg-primary/5 p-3 text-sm text-ink dark:text-[#E8F1EB]">
            <p className="font-semibold">Offer: {j.offer.amount > 0 ? formatMoney(j.offer.amount) : 'free collection'}</p>
            {j.offer.message && <p className="mt-1 text-ink-muted dark:text-[#9FB2A7]">“{j.offer.message}”</p>}
            {j.offer.amount > 0 && <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">Paid directly between the two people. The platform only keeps a record.</p>}
          </div>
          <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><User size={16} aria-hidden />{asOwner ? `Refurbisher: ${j.refurbisher?.businessName || j.refurbisher?.name}` : `Owner: ${j.owner?.name}`}</p>
          <div className="text-sm text-ink dark:text-[#E8F1EB]">
            <p className="flex items-center gap-2"><MapPin size={16} aria-hidden />{placeLabel(l) || 'Location not shared'}</p>
            {lat !== undefined && (
              <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
                The exact pickup point is shared with you for the collection. <a className="font-semibold underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}>Open map</a>
              </p>
            )}
          </div>
          {j.pickup && <p className="text-sm text-ink dark:text-[#E8F1EB]">Collection: {formatDate(j.pickup.date)}{j.pickup.timeSlot ? ` (${j.pickup.timeSlot})` : ''}</p>}
          {j.status === 'cancelled' && j.cancelReason && <Alert variant="info">Cancelled: {j.cancelReason}</Alert>}
        </GlassCard>

        <div className="space-y-5">
          {hasPhotos && (
            <GlassCard as="section" aria-label="Refurbishment photos" className="space-y-3">
              <h2 className="text-lg font-bold text-ink dark:text-white">Before and after</h2>
              {j.beforePhotos?.length > 0 && <div><h3 className="text-sm font-bold text-ink dark:text-white">Before the work</h3><PhotoGrid photos={j.beforePhotos} label="Photo from before the work" /></div>}
              {j.afterPhotos?.length > 0 && <div><h3 className="text-sm font-bold text-ink dark:text-white">After the work</h3><PhotoGrid photos={j.afterPhotos} label="Photo from after the work" /></div>}
            </GlassCard>
          )}
          {j.workLog?.length > 0 && (
            <GlassCard as="section" aria-label="Work log">
              <h2 className="mb-3 text-lg font-bold text-ink dark:text-white">Work log</h2>
              <ul className="space-y-2">
                {[...j.workLog].reverse().map((w, i) => (
                  <li key={`${w.at}-${i}`} className="rounded-xl bg-primary/5 p-3 text-sm text-ink dark:text-[#E8F1EB]">
                    {w.text}
                    <span className="mt-1 block text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(w.at)}</span>
                  </li>
                ))}
              </ul>
            </GlassCard>
          )}
          <GlassCard as="section" aria-label="Activity">
            <h2 className="mb-3 text-lg font-bold text-ink dark:text-white">Activity</h2>
            <ol className="space-y-3" aria-label="History">
              {[...(j.history || [])].reverse().map((h, i) => (
                <li key={`${h.status}-${h.at}-${i}`} className="border-l-2 border-primary/30 pl-3 text-sm">
                  <p className="font-semibold text-ink dark:text-white">{jobLabel(h.status, j.viewerRole)}</p>
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(h.at)}</p>
                  {h.note && <p className="mt-1 text-ink dark:text-[#E8F1EB]">{h.note}</p>}
                </li>
              ))}
            </ol>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

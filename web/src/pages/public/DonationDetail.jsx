import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, Check, MapPin, User } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import DonationActions from '../../components/donations/DonationActions';
import { PhotoGrid } from '../../components/requests/RequestTimeline';
import { Thumb } from '../../components/devices/DeviceCard';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../hooks/useAuth';
import { donationApi } from '../../services/donationApi';
import { CONDITIONS, labelOf, placeLabel } from '../../lib/devices';
import { ORG_TYPES, donationLabel, donationSteps, donationTone } from '../../lib/donations';
import { formatDate } from '../../lib/requests';

function Tracker({ donation }) {
  const steps = donationSteps(donation);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-3" aria-label="Donation progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2" aria-current={s.state === 'current' ? 'step' : undefined}>
          <span aria-hidden className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${s.state === 'done' ? 'bg-success text-white' : s.state === 'current' ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'bg-gray-500/20 text-ink-muted'}`}>
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

/** One page for everyone: what you see and can do depends on `viewerRole` and `actions` from the server. */
export default function DonationDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const inDashboard = location.pathname.startsWith('/dashboard');
  const { data, error, loading, reload } = useFetch((signal) => donationApi.get(id, signal), [id, user?._id]);
  const [fresh, setFresh] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const donation = fresh?._id === id ? fresh : data;
  const wrap = inDashboard ? 'space-y-5' : 'mx-auto max-w-6xl space-y-5 px-4 py-10';
  const back = inDashboard ? ['/dashboard/donations', 'My donations'] : ['/donations', 'All donations'];

  if (loading && !donation) return <div className={wrap} aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-48 w-full !rounded-3xl" /></div>;
  if (error && !donation) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className={wrap}>
        <ErrorState error={missing ? { message: 'This donation does not exist or is no longer available.' } : error} title={missing ? 'Donation not found' : 'Could not load this donation'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to={back[0]} className="font-semibold text-primary underline dark:text-primary-tint">{back[1]}</Link></p>
      </div>
    );
  }

  const d = donation;
  const l = d.listing || {};
  const participant = ['donor', 'recipient', 'admin'].includes(d.viewerRole);
  const lat = l.location?.coordinates?.[1];
  const lng = l.location?.coordinates?.[0];
  const orgType = d.recipient?.orgType && ORG_TYPES.find(([k]) => k === d.recipient.orgType)?.[1];

  return (
    <div className={wrap}>
      <Link to={back[0]} className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> {back[1]}</Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">{l.title}</h1>
        <Badge tone={donationTone(d.status)}>{donationLabel(d.status)}</Badge>
        {!inDashboard && participant && <Link to={`/dashboard/donations/${d._id}`} className="text-sm font-semibold text-primary underline dark:text-primary-tint">Open in your dashboard</Link>}
      </div>

      <Alert variant="success">{flash}</Alert>
      {participant && <GlassCard><Tracker donation={d} /></GlassCard>}

      <DonationActions donation={d} signedIn={Boolean(user)} onChanged={(updated, message) => { setFresh(updated); setFlash(message || ''); }} />

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard as="section" aria-label="Device details" className="space-y-4">
          <div className="flex gap-4">
            <Thumb listing={l} className="h-24 w-32 shrink-0 rounded-2xl" />
            <div className="min-w-0 space-y-1">
              <p className="font-bold text-ink dark:text-white">{l.title}</p>
              <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{[l.category?.name, l.brand, l.model].filter(Boolean).join(' · ')}</p>
              <Badge tone={l.condition === 'fully_working' ? 'green' : 'amber'}>{labelOf(CONDITIONS, l.condition)}</Badge>
            </div>
          </div>
          {d.description && <div><h2 className="text-sm font-bold text-ink dark:text-white">From the donor</h2><p className="mt-1 text-sm text-ink dark:text-[#E8F1EB]">{d.description}</p></div>}
          {l.description && <div><h2 className="text-sm font-bold text-ink dark:text-white">About the device</h2><p className="mt-1 text-sm text-ink dark:text-[#E8F1EB]">{l.description}</p></div>}
          <PhotoGrid photos={l.device?.photos} label="Photo of the device" />
          <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><User size={16} aria-hidden />Donated by {d.donor?.name}</p>
          {d.recipient && <p className="text-sm text-ink dark:text-[#E8F1EB]">Recipient: {d.recipient.orgName || d.recipient.name}{orgType ? ` (${orgType})` : ''}</p>}
          <div className="text-sm text-ink dark:text-[#E8F1EB]">
            <p className="flex items-center gap-2"><MapPin size={16} aria-hidden />{placeLabel(l) || 'Location not shared'}</p>
            {lat !== undefined && (
              <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
                The exact pickup point is shared with you for the handover. <a className="font-semibold underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}>Open map</a>
              </p>
            )}
            {lat === undefined && d.viewerRole === 'visitor' && <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">The exact address is only shared with the chosen recipient.</p>}
          </div>
          {d.pickup && <p className="text-sm text-ink dark:text-[#E8F1EB]">Handover: {formatDate(d.pickup.date)}{d.pickup.timeSlot ? ` (${d.pickup.timeSlot})` : ''}</p>}
        </GlassCard>

        {participant && (
          <GlassCard as="section" aria-label="Activity">
            <h2 className="mb-3 text-lg font-bold text-ink dark:text-white">Activity</h2>
            <ol className="space-y-3" aria-label="History">
              {[...(d.history || [])].reverse().map((h, i) => (
                <li key={`${h.status}-${h.at}-${i}`} className="border-l-2 border-primary/30 pl-3 text-sm">
                  <p className="font-semibold text-ink dark:text-white">{donationLabel(h.status)}</p>
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(h.at)}</p>
                  {h.note && <p className="mt-1 text-ink dark:text-[#E8F1EB]">{h.note}</p>}
                </li>
              ))}
            </ol>
          </GlassCard>
        )}
      </div>
    </div>
  );
}

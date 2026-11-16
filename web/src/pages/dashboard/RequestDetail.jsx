import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, MapPin, User } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import ActionPanel from '../../components/requests/ActionPanel';
import { History, PhotoGrid, Tracker } from '../../components/requests/RequestTimeline';
import { Thumb } from '../../components/devices/DeviceCard';
import { useFetch } from '../../hooks/useFetch';
import { requestApi } from '../../services/repairApi';
import { formatDate, formatMoney, statusLabel, statusTone } from '../../lib/requests';
import { placeLabel } from '../../lib/devices';

const QUOTE_TONE = { submitted: 'amber', accepted: 'green', rejected: 'red', expired: 'neutral', superseded: 'neutral' };

function QuotationCard({ quotation: q }) {
  return (
    <GlassCard as="section" aria-label="Quotation" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-ink dark:text-white">Quotation {q.version > 1 ? `(version ${q.version})` : ''}</h2>
        <Badge tone={QUOTE_TONE[q.status]}>{q.status}</Badge>
      </div>
      <p className="font-numeric text-3xl font-extrabold text-primary dark:text-primary-tint">{formatMoney(q.amount)}</p>
      {q.breakdown?.length > 0 && (
        <table className="w-full text-sm">
          <caption className="sr-only">Quotation breakdown</caption>
          <tbody>{q.breakdown.map((b, i) => <tr key={i} className="border-b border-black/5 dark:border-white/10"><th scope="row" className="py-1 text-left font-normal text-ink dark:text-[#E8F1EB]">{b.label}</th><td className="py-1 text-right font-medium text-ink dark:text-white">{formatMoney(b.amount)}</td></tr>)}</tbody>
        </table>
      )}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {q.etaDays !== undefined && <div><dt className="text-ink-muted dark:text-[#9FB2A7]">Time needed</dt><dd className="font-semibold text-ink dark:text-white">{q.etaDays} {q.etaDays === 1 ? 'day' : 'days'}</dd></div>}
        {q.validUntil && <div><dt className="text-ink-muted dark:text-[#9FB2A7]">Offer valid until</dt><dd className="font-semibold text-ink dark:text-white">{formatDate(q.validUntil)}</dd></div>}
      </dl>
      {q.notes && <p className="text-sm text-ink dark:text-[#E8F1EB]">{q.notes}</p>}
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">You pay the technician directly. The platform does not handle payments.</p>
    </GlassCard>
  );
}

export default function RequestDetail() {
  const { id } = useParams();
  const location = useLocation();
  const { data, error, loading, reload } = useFetch((signal) => requestApi.get(id, signal), [id]);
  // After an action the server returns the updated request, so no extra fetch is needed.
  const [fresh, setFresh] = useState(null);
  const [flash, setFlash] = useState(location.state?.flash || '');
  const request = fresh?._id === id ? fresh : data;

  if (loading && !request) return <div className="space-y-4" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-32 w-full !rounded-3xl" /><Skeleton className="h-48 w-full !rounded-3xl" /></div>;
  if (error && !request) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="space-y-4">
        <ErrorState error={missing ? { message: 'This request does not exist or you do not have access to it.' } : error} title={missing ? 'Request not found' : 'Could not load this request'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to="/dashboard/requests" className="font-semibold text-primary underline dark:text-primary-tint">Back to requests</Link></p>
      </div>
    );
  }

  const r = request;
  const technicianView = r.viewerRole === 'technician';
  const other = technicianView ? r.customer : r.technician;
  const lat = r.listing?.location?.coordinates?.[1];
  const lng = r.listing?.location?.coordinates?.[0];
  const showQuote = r.activeQuotation && ['quotation_submitted', 'customer_approval_pending', 'repair_in_progress', 'repair_completed', 'device_delivery_pending', 'device_delivered', 'service_completed'].includes(r.status);

  return (
    <div className="space-y-5">
      <Link to="/dashboard/requests" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> All requests</Link>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">{r.listing?.title}</h1>
        <Badge tone={statusTone(r.status)}>{statusLabel(r.status)}</Badge>
      </div>

      <Alert variant="success">{flash}</Alert>
      <GlassCard><Tracker request={r} /></GlassCard>

      <ActionPanel
        request={r}
        onChanged={(updated, message) => {
          setFresh(updated);
          setFlash(message || '');
        }}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <GlassCard as="section" aria-label="Request details" className="space-y-4">
          <div className="flex gap-4">
            <Thumb listing={r.listing} className="h-20 w-28 shrink-0 rounded-2xl" />
            <div className="min-w-0">
              <p className="font-bold text-ink dark:text-white">{r.listing?.title}</p>
              <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{[r.listing?.brand, r.listing?.model].filter(Boolean).join(' ')}</p>
              {r.mode === 'open' && !r.technician && <Badge tone="blue" className="mt-1">Open to any suitable technician</Badge>}
              {r.onSite && <Badge tone="blue" className="mt-1">On-site repair</Badge>}
            </div>
          </div>
          <div>
            <h2 className="text-sm font-bold text-ink dark:text-white">Problem described</h2>
            <p className="mt-1 text-sm text-ink dark:text-[#E8F1EB]">{r.issueDescription}</p>
          </div>
          <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><User size={16} aria-hidden />{technicianView ? 'Customer' : 'Technician'}: {other?.name || 'Not assigned yet'}</p>
          <div className="text-sm text-ink dark:text-[#E8F1EB]">
            <p className="flex items-center gap-2"><MapPin size={16} aria-hidden />{placeLabel(r.listing) || 'Location not shared'}</p>
            {technicianView && lat !== undefined && (
              <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">The exact pickup point is shared now that you accepted. <a className="font-semibold underline" target="_blank" rel="noreferrer" href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}>Open the map</a></p>
            )}
            {technicianView && lat === undefined && <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">The exact address is shared after you accept the job.</p>}
          </div>
          {r.pickup && (
            <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><CalendarClock size={16} aria-hidden />Pickup: {formatDate(r.pickup.date)}{r.pickup.timeSlot ? ` (${r.pickup.timeSlot})` : ''}</p>
          )}
          {r.returnSchedule?.date && (
            <p className="flex items-center gap-2 text-sm text-ink dark:text-[#E8F1EB]"><CalendarClock size={16} aria-hidden />Return: {formatDate(r.returnSchedule.date)}{r.returnSchedule.timeSlot ? ` (${r.returnSchedule.timeSlot})` : ''}</p>
          )}
          <PhotoGrid photos={r.progressPhotos} label="Progress photo" />
          <PhotoGrid photos={r.completionPhotos} label="Photo of the repaired device" />
        </GlassCard>

        <div className="space-y-5">
          {showQuote && <QuotationCard quotation={r.activeQuotation} />}
          <GlassCard as="section" aria-label="Activity"><h2 className="mb-3 text-lg font-bold text-ink dark:text-white">Activity</h2><History request={r} /></GlassCard>
        </div>
      </div>
    </div>
  );
}

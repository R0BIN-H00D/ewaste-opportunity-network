import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, MapPin } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { pickupApi } from '../../services/pickupApi';
import { formatDate } from '../../lib/requests';

const TABS = [['upcoming', 'Upcoming'], ['past', 'Past']];
const KIND = { repair: 'Repair', donation: 'Donation', refurbishment: 'Refurbishment', recycling: 'Recycling' };
const STATUS = {
  requested: ['Requested', 'amber'],
  confirmed: ['Confirmed', 'blue'],
  rescheduled: ['Rescheduled', 'amber'],
  collected: ['Collected', 'green'],
  cancelled: ['Cancelled', 'neutral'],
};

function PickupCard({ pickup: p, onChanged }) {
  const [label, tone] = STATUS[p.status] || [p.status, 'neutral'];
  const save = useSave();
  const confirm = async () => {
    const res = await save.run(() => pickupApi.confirm(p._id), 'Confirmed');
    if (res.ok) onChanged();
  };
  return (
    <GlassCard as="article" className="flex flex-wrap items-start justify-between gap-3 !p-4">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-base font-bold text-ink dark:text-white"><Link to={p.link} className="hover:underline">{p.title}</Link></h2>
          <Badge tone="neutral">{KIND[p.kind] || p.kind}</Badge>
          <Badge tone={tone}>{label}{p.status === 'rescheduled' && p.rescheduleCount ? ` (${p.rescheduleCount}×)` : ''}</Badge>
        </div>
        <p className="flex items-center gap-1 text-sm font-semibold text-ink dark:text-[#E8F1EB]"><CalendarClock size={14} aria-hidden />{formatDate(p.date)}{p.timeSlot ? ` · ${p.timeSlot}` : ''}</p>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
          {p.viewerRole === 'requester' ? 'You hand over' : 'You collect'}{p.counterpart?.name ? ` · with ${p.counterpart.name}` : ''}
        </p>
        {p.addressArea && <p className="flex items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]"><MapPin size={12} aria-hidden />{p.addressArea}</p>}
        {p.notes && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Note: {p.notes}</p>}
        {p.reschedulesLeft !== undefined && ['requested', 'confirmed', 'rescheduled'].includes(p.status) && (
          <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
            {p.canChange
              ? `Can be changed ${p.reschedulesLeft === 1 ? 'once more' : `${p.reschedulesLeft} more times`}, until ${formatDate(p.changeableUntil)}`
              : (p.reschedulesLeft === 0 ? 'Cannot be changed again' : 'Too close to the start to change')}
          </p>
        )}
        {p.awaitingMe && (
          <p className="text-sm font-semibold text-warning" role="status">
            {p.counterpart?.name || 'The other person'} suggested this time. Confirm it, or open the request to suggest another.
          </p>
        )}
        {p.proposedByMe && p.status === 'rescheduled' && (
          <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Waiting for {p.counterpart?.name || 'the other person'} to confirm this time.</p>
        )}
        {save.status === 'error' && <p role="alert" className="text-xs font-medium text-danger dark:text-red-300">{save.message}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {p.awaitingMe && <button type="button" className="btn btn-primary !px-3 !py-1.5 text-sm" onClick={confirm} disabled={save.saving}>{save.saving ? 'Confirming…' : 'Confirm this time'}</button>}
        <Link to={p.link} className="btn btn-glass !px-3 !py-1.5 text-sm">Open</Link>
      </div>
    </GlassCard>
  );
}

/** Every pickup, collection and handover in one place. The details and the actions stay on each request. */
export default function Pickups() {
  const [params, setParams] = useSearchParams();
  const when = params.get('when') === 'past' ? 'past' : 'upcoming';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => pickupApi.list({ when, page, limit: 10 }, signal), [when, page]);
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Pickups</h1>
      <p className="max-w-3xl text-sm text-ink-muted dark:text-[#9FB2A7]">Every pickup, collection and handover you are part of, from repairs, donations, refurbishment and recycling. Only the area is shown here. Open an item to see the details and to change the time.</p>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Which pickups">
        {TABS.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={when === value} onClick={() => setParams(value === 'upcoming' ? {} : { when: value })}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${when === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your pickups" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={CalendarClock} title={when === 'past' ? 'No past pickups' : 'No upcoming pickups'}>
          {when === 'past' ? 'Pickups that were completed, cancelled or have gone by appear here.' : 'When a pickup, collection or handover is scheduled it appears here.'}
        </EmptyState>
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((p) => <li key={p._id}><PickupCard pickup={p} onChanged={reload} /></li>)}</ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...(when === 'past' ? { when } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

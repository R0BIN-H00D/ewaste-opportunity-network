import { Link, useSearchParams } from 'react-router-dom';
import { Recycle } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import { Thumb } from '../../components/devices/DeviceCard';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../hooks/useAuth';
import { refurbApi } from '../../services/refurbishmentApi';
import { jobLabel, jobTone } from '../../lib/refurbishment';
import { formatDate, formatMoney } from '../../lib/requests';

const TABS = [['refurbisher', 'My jobs'], ['owner', 'Offers on my devices']];

function JobCard({ job: j }) {
  const l = j.listing || {};
  const asOwner = j.viewerRole === 'owner';
  return (
    <GlassCard as="article" className="flex gap-4 !p-4">
      <Link to={`/dashboard/refurbishment/${j._id}`} aria-label={`View ${l.title}`} className="shrink-0"><Thumb listing={l} className="h-20 w-24 rounded-2xl" /></Link>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-bold text-ink dark:text-white"><Link to={`/dashboard/refurbishment/${j._id}`} className="hover:underline">{l.title}</Link></h2>
          <Badge tone={jobTone(j.status)}>{jobLabel(j.status, j.viewerRole)}</Badge>
        </div>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
          {asOwner ? `Offer from ${j.refurbisher?.name || 'a refurbisher'}` : `Owner ${j.owner?.name || ''}`} · {j.offer?.amount > 0 ? formatMoney(j.offer.amount) : 'Free collection'} · {formatDate(j.updatedAt || j.createdAt)}
        </p>
      </div>
    </GlassCard>
  );
}

/** Refurbishment jobs: offers on my devices (anyone) and my own jobs (refurbishers). */
export default function RefurbJobs() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isRefurbisher = user?.role === 'refurbisher';
  const as = !isRefurbisher || params.get('as') === 'owner' ? 'owner' : 'refurbisher';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => refurbApi.jobs({ as, page, limit: 10 }, signal), [as, page]);
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Refurbishment</h1>
        {isRefurbisher && <Link to="/dashboard/opportunities" className="btn btn-primary">Find devices to refurbish</Link>}
      </div>

      {isRefurbisher && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Which jobs">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={as === value} onClick={() => setParams(value === 'refurbisher' ? {} : { as: value })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${as === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your jobs" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        as === 'owner' ? (
          <EmptyState icon={Recycle} title="No offers on your devices yet" action={<Link to="/dashboard/listings" className="btn btn-primary">Go to my listings</Link>}>
            List a device with the service set to Refurbishment. Verified refurbishers can then make you an offer.
          </EmptyState>
        ) : (
          <EmptyState icon={Recycle} title="You have no refurbishment jobs yet" action={<Link to="/dashboard/opportunities" className="btn btn-primary">See available devices</Link>}>
            Make an offer on a device. Once the owner accepts it, the job appears here.
          </EmptyState>
        )
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((j) => <li key={j._id}><JobCard job={j} /></li>)}</ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...(as === 'owner' && isRefurbisher ? { as } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

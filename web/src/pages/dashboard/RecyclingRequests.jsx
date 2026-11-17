import { Link, useSearchParams } from 'react-router-dom';
import { BarChart3, Recycle } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../hooks/useAuth';
import { recyclingApi } from '../../services/recyclingApi';
import { RECYCLING_FILTERS, recyclingLabel, recyclingTone } from '../../lib/recycling';
import { formatDate } from '../../lib/requests';
import { assetUrl } from '../../services/api';

const TABS = [['center', 'Incoming requests'], ['requester', 'My requests']];

function RequestCard({ request: r }) {
  const asCenter = r.viewerRole === 'center';
  const names = (r.categories || []).map((c) => c.name).join(', ');
  return (
    <GlassCard as="article" className="flex gap-4 !p-4">
      <Link to={`/dashboard/recycling/${r._id}`} aria-label={`View request ${r.refNo}`} className="shrink-0">
        {r.photos?.[0] ? <img src={assetUrl(r.photos[0].url)} alt="" className="h-20 w-24 rounded-2xl object-cover" /> : <div className="grid h-20 w-24 place-items-center rounded-2xl bg-primary/5 text-primary dark:text-primary-tint" aria-hidden><Recycle size={28} /></div>}
      </Link>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="truncate text-base font-bold text-ink dark:text-white"><Link to={`/dashboard/recycling/${r._id}`} className="hover:underline">{r.deviceCount} {r.deviceCount === 1 ? 'device' : 'devices'}{names ? ` · ${names}` : ''}</Link></h2>
          <Badge tone={recyclingTone(r.status)}>{recyclingLabel(r.status)}</Badge>
        </div>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
          {r.refNo} · {asCenter ? `From ${r.requester?.name || 'a requester'} in ${r.pickupAddressArea}` : `To ${r.center?.name || 'a recycling centre'}`} · {formatDate(r.updatedAt || r.createdAt)}
        </p>
      </div>
    </GlassCard>
  );
}

/** Recycling requests: ones I sent (anyone) and, for recycling centres, the ones sent to my centre. */
export default function RecyclingRequests() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const isCenter = user?.role === 'recycler';
  const as = !isCenter || params.get('as') === 'requester' ? 'requester' : 'center';
  const status = params.get('status') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => recyclingApi.list({ as, status, page, limit: 10 }, signal), [as, status, page]);
  const items = data?.items || [];
  const keep = (next) => setParams(Object.fromEntries(Object.entries({ ...(isCenter && as === 'requester' ? { as } : {}), ...(status ? { status } : {}), ...next }).filter(([, v]) => v)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Recycling</h1>
        <div className="flex flex-wrap gap-2">
          {isCenter && <Link to="/dashboard/recycling/report" className="btn btn-glass"><BarChart3 size={16} aria-hidden /> Reports</Link>}
          <Link to="/recycling-centers" className="btn btn-primary">Find a recycling centre</Link>
        </div>
      </div>

      {isCenter && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Which requests">
          {TABS.map(([value, label]) => (
            <button key={value} type="button" role="tab" aria-selected={as === value} onClick={() => setParams({ ...(value === 'requester' ? { as: value } : {}), ...(status ? { status } : {}) })}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${as === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="max-w-xs">
        <TextField as="select" label="Show" value={status} onChange={(e) => setParams({ ...(isCenter && as === 'requester' ? { as } : {}), ...(e.target.value ? { status: e.target.value } : {}) })}>
          <option value="">All requests</option>
          {RECYCLING_FILTERS.map((s) => <option key={s} value={s}>{recyclingLabel(s)}</option>)}
        </TextField>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your requests" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        status ? (
          <EmptyState icon={Recycle} art="recycle" title="No requests with this status" action={<button type="button" className="btn btn-primary" onClick={() => keep({ status: undefined })}>Show all</button>} />
        ) : as === 'center' ? (
          <EmptyState icon={Recycle} art="recycle" title="No requests have come in yet">When someone sends devices to your centre, the request appears here for you to accept or decline.</EmptyState>
        ) : (
          <EmptyState icon={Recycle} art="recycle" title="You have not sent any recycling requests" action={<Link to="/recycling-centers" className="btn btn-primary">Find a recycling centre</Link>}>
            Pick an authorised centre, say what you are sending and where, and the centre will arrange the pickup.
          </EmptyState>
        )
      ) : (
        <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((r) => <li key={r._id}><RequestCard request={r} /></li>)}</ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => keep({ ...(n > 1 ? { page: String(n) } : { page: undefined }) })} />}
    </div>
  );
}

import { Link, useSearchParams } from 'react-router-dom';
import { MessageSquareWarning, Plus } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { complaintApi } from '../../services/complaintApi';
import { COMPLAINT_ABOUT, complaintLabel, complaintTone } from '../../lib/complaints';
import { formatDate } from '../../lib/requests';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The complaints this person filed, and how each one is going. */
export default function Complaints() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => complaintApi.list({ status, page, limit: 10 }, signal), [status, page]);
  const items = data?.items || [];
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Complaints</h1>
        <Link to="/dashboard/complaints/new" className="btn btn-primary"><Plus size={18} aria-hidden /> File a complaint</Link>
      </div>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">If something went wrong with a person, a service or an order, tell us here. An administrator will look into it and write back.</p>
      <TextField as="select" label="Show" value={status} onChange={(e) => set({ status: e.target.value })} className="w-52">
        <option value="">All my complaints</option>
        <option value="active">Still being handled</option>
        <option value="closed">Closed</option>
      </TextField>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your complaints" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title={status ? 'No complaint matches this' : 'You have not filed any complaints'}>
          {status ? 'Try another filter.' : 'Hopefully you never need to. If you do, this is where it starts.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">{plural(data.meta.total, 'complaint')}</p>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
            {items.map((c) => (
              <li key={c._id}>
                <GlassCard as="article" className="flex flex-wrap items-start justify-between gap-3 !p-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-bold text-ink dark:text-white">{c.subject}</h2>
                      <Badge tone={complaintTone(c.status)}>{complaintLabel(c.status)}</Badge>
                    </div>
                    <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
                      {[COMPLAINT_ABOUT[c.refType], c.against ? `about ${c.against.name}` : '', `filed ${formatDate(c.createdAt)}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <Link to={`/dashboard/complaints/${c._id}`} aria-label={`Open complaint: ${c.subject}`} className="btn btn-glass !px-4 !py-2 text-sm">Open</Link>
                </GlassCard>
              </li>
            ))}
          </ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ status, ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

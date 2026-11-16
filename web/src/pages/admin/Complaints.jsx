import { Link, useSearchParams } from 'react-router-dom';
import { MessageSquareWarning } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { adminComplaintApi } from '../../services/adminApi';
import { COMPLAINT_ABOUT, complaintLabel, complaintTone } from '../../lib/complaints';
import { formatDate } from '../../lib/requests';

const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** The complaint queue: the ones still being handled come first and the oldest is at the top, so none is left waiting. */
export default function Complaints() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const assigned = params.get('assigned') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => adminComplaintApi.list({ status, assigned, page, limit: 10 }, signal), [status, assigned, page]);
  const items = data?.items || [];
  const filtered = !!(status || assigned);
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  const current = { status, assigned };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Complaints</h1>
      <div className="flex flex-wrap items-end gap-3">
        <TextField as="select" label="Show" value={status} onChange={(e) => set({ ...current, status: e.target.value })} className="w-48">
          <option value="">Still being handled</option>
          <option value="open">Waiting</option>
          <option value="assigned">Picked up</option>
          <option value="in_review">Being reviewed</option>
          <option value="closed">Closed</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </TextField>
        <TextField as="select" label="Handled by" value={assigned} onChange={(e) => set({ ...current, assigned: e.target.value })} className="w-44">
          <option value="">Anyone</option>
          <option value="me">Me</option>
          <option value="unassigned">Nobody yet</option>
        </TextField>
        {filtered && <button type="button" className="btn btn-glass" onClick={() => setParams({})}>Clear</button>}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load complaints" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={MessageSquareWarning} title={filtered ? 'No complaint matches these filters' : 'No complaints need attention'}>
          {filtered ? 'Try another status.' : 'When someone files a complaint, it shows up here.'}
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
                      <Badge tone="neutral">{COMPLAINT_ABOUT[c.refType] || c.refType}</Badge>
                    </div>
                    <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
                      Filed by {c.filedBy?.name || 'a removed account'}{c.against ? ` about ${c.against.name}` : ''} · {formatDate(c.createdAt)}
                    </p>
                    <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{c.assignedTo ? `Handled by ${c.assignedTo.name}` : 'Nobody has picked it up yet'}</p>
                  </div>
                  <Link to={`/dashboard/admin/complaints/${c._id}`} aria-label={`Open complaint: ${c.subject}`} className="btn btn-glass !px-4 !py-2 text-sm">Open</Link>
                </GlassCard>
              </li>
            ))}
          </ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ ...current, ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

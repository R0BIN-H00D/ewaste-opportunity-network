import { Link, useSearchParams } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import OpportunityCard from '../../components/learning/OpportunityCard';
import { useFetch } from '../../hooks/useFetch';
import { opportunityApi } from '../../services/learningApi';

const STATUSES = [['open', 'Open'], ['filled', 'Full'], ['closed', 'Closed']];

/** A technician's supervised student tasks. */
export default function LearningTasks() {
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => opportunityApi.mine({ status, page, limit: 12 }, signal), [status, page]);
  const items = data?.items || [];
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Student tasks</h1>
        <Link to="/dashboard/learning-tasks/new" className="btn btn-primary">Post a task</Link>
      </div>
      <p className="max-w-3xl text-sm text-ink-muted dark:text-[#9FB2A7]">Post a practical task you will supervise from start to finish. Students apply, you choose who takes part and record the hours they complete.</p>
      <TextField as="select" label="Show" value={status} onChange={(e) => set({ status: e.target.value })} className="w-48">
        <option value="">All tasks</option>
        {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </TextField>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your tasks" />
      ) : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={GraduationCap} title={status ? 'No tasks with this status' : 'You have not posted a task yet'} action={<Link to="/dashboard/learning-tasks/new" className="btn btn-primary">Post a task</Link>}>
          {status ? 'Choose another status to see the rest.' : 'A task can be diagnosing a laptop, replacing a keyboard or testing a power supply, always with you supervising.'}
        </EmptyState>
      ) : (
        <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>{items.map((o) => <li key={o._id}><OpportunityCard opportunity={o} manager to={`/dashboard/learning-tasks/${o._id}`} /></li>)}</ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ status, ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

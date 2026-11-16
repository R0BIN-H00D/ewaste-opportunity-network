import { Link, useSearchParams } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { adminAuditApi } from '../../services/adminApi';
import { actionLabel, auditTargetLabel, auditTargetLink } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

const countEntries = (n) => `${n} ${n === 1 ? 'entry' : 'entries'}`;
const pretty = (value) => JSON.stringify(value, null, 2);

function Row({ item }) {
  const link = auditTargetLink(item.targetType, item.targetId);
  const hasChanges = item.before !== null || item.after !== null;
  return (
    <GlassCard as="article" className="space-y-1 !p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-ink dark:text-white">{actionLabel(item.action)}</h2>
        {item.targetType && <Badge tone="neutral">{auditTargetLabel(item.targetType)}</Badge>}
      </div>
      <p className="break-words text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(item.at)} · {item.admin?.name || 'a removed administrator'}{item.ip ? ` · from ${item.ip}` : ''}</p>
      {item.reason && <p className="text-sm text-ink dark:text-[#E8F1EB]">“{item.reason}”</p>}
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {link && <Link to={link} className="inline-flex min-h-[44px] items-center text-sm font-semibold text-secondary-strong underline dark:text-primary-tint">Open {auditTargetLabel(item.targetType).toLowerCase()}</Link>}
        {hasChanges && (
          <details className="w-full min-w-0 text-sm">
            <summary className="cursor-pointer py-3 font-semibold text-ink dark:text-white">Show what changed</summary>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {item.before !== null && <div className="min-w-0"><p className="text-xs font-semibold text-ink-muted dark:text-[#9FB2A7]">Before</p><pre className="overflow-x-auto rounded-xl bg-white/40 p-2 text-xs text-ink dark:bg-white/5 dark:text-[#E8F1EB]">{pretty(item.before)}</pre></div>}
              {item.after !== null && <div className="min-w-0"><p className="text-xs font-semibold text-ink-muted dark:text-[#9FB2A7]">After</p><pre className="overflow-x-auto rounded-xl bg-white/40 p-2 text-xs text-ink dark:bg-white/5 dark:text-[#E8F1EB]">{pretty(item.after)}</pre></div>}
            </div>
          </details>
        )}
      </div>
    </GlassCard>
  );
}

/** Who did what, to what, when and why. Read-only: the record cannot be edited or deleted from here or anywhere else. */
export default function AuditLog() {
  const [params, setParams] = useSearchParams();
  const f = { action: params.get('action') || '', targetType: params.get('targetType') || '', admin: params.get('admin') || '', from: params.get('from') || '', to: params.get('to') || '' };
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => adminAuditApi.list({ ...f, page, limit: 15 }, signal), [f.action, f.targetType, f.admin, f.from, f.to, page]);
  const items = data?.items || [];
  const filtered = Object.values(f).some(Boolean);
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  const meta = data?.meta;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Audit log</h1>
      <div className="flex flex-wrap items-end gap-3">
        <TextField as="select" label="Action" value={f.action} onChange={(e) => set({ ...f, action: e.target.value })} className="w-56">
          <option value="">Any action</option>
          {(meta?.actions || []).map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
        </TextField>
        <TextField as="select" label="About" value={f.targetType} onChange={(e) => set({ ...f, targetType: e.target.value })} className="w-44">
          <option value="">Anything</option>
          {(meta?.targetTypes || []).map((t) => <option key={t} value={t}>{auditTargetLabel(t)}</option>)}
        </TextField>
        <TextField as="select" label="Administrator" value={f.admin} onChange={(e) => set({ ...f, admin: e.target.value })} className="w-48">
          <option value="">Anyone</option>
          {(meta?.admins || []).map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
        </TextField>
        <TextField type="date" label="From" value={f.from} onChange={(e) => set({ ...f, from: e.target.value })} className="w-44" />
        <TextField type="date" label="To" value={f.to} onChange={(e) => set({ ...f, to: e.target.value })} className="w-44" />
        {filtered && <button type="button" className="btn btn-glass" onClick={() => setParams({})}>Clear</button>}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load the audit log" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ScrollText} title={filtered ? 'Nothing matches these filters' : 'Nothing has been recorded yet'}>
          {filtered ? 'Try a wider date range or another action.' : 'Every change an administrator makes is written here.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">{countEntries(meta.total)}</p>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((r) => <li key={r._id}><Row item={r} /></li>)}</ul>
        </>
      )}
      {meta && <Pagination page={meta.page} pages={meta.pages} onChange={(n) => set({ ...f, ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

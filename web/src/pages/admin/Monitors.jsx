import { useState } from 'react';
import { NavLink, useParams, useSearchParams } from 'react-router-dom';
import { Activity } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { adminMonitorApi } from '../../services/adminApi';
import { MONITORS, monitorStatusLabel, monitorStatusTone } from '../../lib/admin';
import { formatDate, formatMoney } from '../../lib/requests';

const tab = ({ isActive }) =>
  `inline-flex min-h-[44px] items-center rounded-xl px-4 text-sm font-semibold transition ${isActive ? 'bg-primary text-white' : 'glass-subtle text-ink dark:text-white'}`;

/** Free hand-overs (donations, recycling) have no payment, so they say so instead of showing a zero. */
function money(item) {
  if (item.amount === undefined || item.amount === null) return '';
  if (item.amount === 0) return ' · No payment';
  return ` · ${formatMoney(item.amount)}${item.method ? ` (${item.method === 'cod' ? 'cash on delivery' : 'paid offline'})` : ''}`;
}

function Row({ item }) {
  return (
    <GlassCard as="article" className="space-y-1 !p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-ink dark:text-white">{item.title}</h2>
        <Badge tone="neutral">{item.reference}</Badge>
        <Badge tone={monitorStatusTone(item.status)}>{monitorStatusLabel(item.status)}</Badge>
      </div>
      <p className="text-sm text-ink dark:text-[#E8F1EB]">{item.parties.map((p) => `${p.role}: ${p.name}`).join(' · ')}</p>
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
        Started {formatDate(item.createdAt)}
        {money(item)}
      </p>
    </GlassCard>
  );
}

/** Read-only view of one flow across the whole platform, with status and date filters. */
export default function Monitors() {
  const { kind = 'repairs' } = useParams();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || '';
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => adminMonitorApi.list(kind, { status, from, to, page, limit: 10 }, signal), [kind, status, from, to, page]);
  const [badRange, setBadRange] = useState('');
  const items = data?.items || [];
  const counts = data?.meta?.byStatus || {};
  const filtered = !!(status || from || to);
  const set = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  const setDates = (next) => {
    const a = next.from ?? from;
    const b = next.to ?? to;
    if (a && b && b < a) { setBadRange('The end date must not be before the start date.'); return; }
    setBadRange('');
    set({ status, from: a, to: b });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-ink dark:text-white">Monitors</h1>
      <nav aria-label="Monitors" className="flex flex-wrap gap-2">
        {MONITORS.map(([k, label]) => <NavLink key={k} to={`/dashboard/admin/monitors/${k}`} className={tab}>{label}</NavLink>)}
      </nav>

      <div className="flex flex-wrap items-end gap-3">
        <TextField label="From" type="date" value={from} onChange={(e) => setDates({ from: e.target.value })} className="w-44" />
        <TextField label="To" type="date" value={to} onChange={(e) => setDates({ to: e.target.value })} className="w-44" />
        {filtered && <button type="button" className="btn btn-glass" onClick={() => { setBadRange(''); setParams({}); }}>Clear</button>}
      </div>
      {badRange && <p role="alert" className="text-sm text-danger dark:text-red-300">{badRange}</p>}

      {data?.meta?.statuses && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
          <button type="button" aria-pressed={!status} className={`btn !min-h-[40px] !px-3 ${!status ? 'btn-primary' : 'btn-glass'}`} onClick={() => set({ from, to })}>All</button>
          {data.meta.statuses.filter((s) => counts[s] > 0 || s === status).map((s) => (
            <button key={s} type="button" aria-pressed={status === s} className={`btn !min-h-[40px] !px-3 ${status === s ? 'btn-primary' : 'btn-glass'}`} onClick={() => set({ status: s, from, to })}>
              {monitorStatusLabel(s)} ({counts[s] || 0})
            </button>
          ))}
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load this list" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Activity} title={filtered ? 'Nothing matches these filters' : 'Nothing here yet'}>
          {filtered ? 'Try a wider date range or another status.' : 'Entries appear here as people use this part of the platform.'}
        </EmptyState>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" role="status">{data.meta.total} {data.meta.total === 1 ? 'entry' : 'entries'}</p>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>{items.map((i) => <li key={i._id}><Row item={i} /></li>)}</ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => set({ status, from, to, ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

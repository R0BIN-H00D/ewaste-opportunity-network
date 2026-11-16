import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { useCategories } from '../../hooks/useCategories';
import { useFetch } from '../../hooks/useFetch';
import { recyclingApi } from '../../services/recyclingApi';
import { formatKg, materialLabel, recyclingLabel } from '../../lib/recycling';
import { friendlyMessage, toApiError } from '../../utils/errors';

const KEYS = ['from', 'to', 'category'];
const day = (v) => (v ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(v)) : '');
// The server wants instants; the page works in whole local days.
const startOf = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : '');
const endOf = (d) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : '');

function Tile({ label, value, sub }) {
  return (
    <div className="rounded-2xl bg-primary/5 p-4">
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]">{label}</dt>
      <dd className="mt-1 font-numeric text-2xl font-bold text-primary dark:text-primary-tint">{value}</dd>
      {sub && <p className="mt-0.5 text-xs text-ink-muted dark:text-[#9FB2A7]">{sub}</p>}
    </div>
  );
}

/** A centre's report (FR-REC-006): date range and category, totals with weighed and estimated kept apart, and a CSV export. */
export default function RecyclingReport() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const [draft, setDraft] = useState(filters);
  const [problem, setProblem] = useState('');
  const [exportError, setExportError] = useState('');
  const key = JSON.stringify(filters);
  useEffect(() => setDraft(filters), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const query = { from: startOf(filters.from), to: endOf(filters.to), category: filters.category };
  const { data: rep, error, loading, reload } = useFetch((signal) => recyclingApi.report(query, signal), [key]);

  const apply = (e) => {
    e.preventDefault();
    if (draft.from && draft.to && draft.from > draft.to) return setProblem('The start date is after the end date.');
    setProblem('');
    return setParams(Object.fromEntries(Object.entries(draft).filter(([, v]) => v)));
  };
  const download = async () => {
    setExportError('');
    try {
      const blob = await recyclingApi.reportCsv(query);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'recycling-report.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(friendlyMessage(toApiError(err)));
    }
  };

  return (
    <div className="space-y-5">
      <Link to="/dashboard/recycling" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint print:hidden"><ArrowLeft size={16} aria-hidden /> Recycling</Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Recycling report</h1>
        <div className="flex gap-2 print:hidden">
          <button type="button" className="btn btn-glass" onClick={download}><Download size={16} aria-hidden /> Download CSV</button>
          <button type="button" className="btn btn-glass" onClick={() => window.print()}><Printer size={16} aria-hidden /> Print</button>
        </div>
      </div>
      <Alert variant="error">{exportError}</Alert>

      <form onSubmit={apply} noValidate aria-label="Report filters" className="glass grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end print:hidden">
        <TextField label="From" type="date" value={draft.from} onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))} />
        <TextField label="To" type="date" value={draft.to} onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))} error={problem} />
        <TextField as="select" label="Category" value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </TextField>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary">Apply</button>
          {KEYS.some((k) => filters[k]) && <button type="button" className="btn btn-glass" onClick={() => { setProblem(''); setParams({}); }}>Clear</button>}
        </div>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load the report" />
      ) : loading && !rep ? (
        <div className="space-y-4" aria-busy><Skeleton className="h-28 w-full !rounded-3xl" /><Skeleton className="h-48 w-full !rounded-3xl" /></div>
      ) : (
        <>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{rep.center} · {filters.from || filters.to ? `${filters.from ? day(startOf(filters.from)) : 'the start'} to ${filters.to ? day(endOf(filters.to)) : 'today'}` : 'all time'}. Request counts cover requests sent in this period; weights and devices cover requests completed in it.</p>
          <GlassCard as="section" aria-label="Totals">
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Tile label="Requests received" value={rep.requests.total} />
              <Tile label="Completed" value={rep.completed.count} sub={`${rep.completed.devices} ${rep.completed.devices === 1 ? 'device' : 'devices'}`} />
              <Tile label="Weighed (measured)" value={formatKg(rep.totals.actualKg)} />
              <Tile label="Estimated" value={formatKg(rep.totals.estimatedKg)} sub="Not added to the weighed total" />
            </dl>
            {Object.keys(rep.requests.byStatus).length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-2 text-xs" aria-label="Requests by status">
                {Object.entries(rep.requests.byStatus).map(([s, n]) => <li key={s} className="rounded-full bg-primary/10 px-3 py-1 font-medium text-ink dark:text-white">{recyclingLabel(s)}: {n}</li>)}
              </ul>
            )}
          </GlassCard>

          <GlassCard as="section" aria-label="Materials recovered" className="space-y-3">
            <h2 className="text-lg font-bold text-ink dark:text-white">Materials recovered</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] text-sm text-ink dark:text-[#E8F1EB]">
                <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]"><th scope="col" className="py-1 pr-3">Material</th><th scope="col" className="py-1 pr-3">Weighed</th><th scope="col" className="py-1">Estimated</th></tr></thead>
                <tbody>
                  {rep.materials.map((m) => (
                    <tr key={m.type} className="border-t border-black/5 dark:border-white/10"><th scope="row" className="py-1.5 pr-3 text-left font-semibold">{materialLabel(m.type)}</th><td className="py-1.5 pr-3 font-numeric">{formatKg(m.actualKg)}</td><td className="py-1.5 font-numeric">{formatKg(m.estimatedKg)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassCard>

          {rep.byCategory.length > 0 && (
            <GlassCard as="section" aria-label="By category" className="space-y-3">
              <h2 className="text-lg font-bold text-ink dark:text-white">By category</h2>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {rep.byCategory.map((c) => <li key={c.category._id} className="rounded-xl bg-primary/5 p-3 text-sm text-ink dark:text-[#E8F1EB]"><span className="font-semibold">{c.category.name}</span><br />{c.requests} {c.requests === 1 ? 'request' : 'requests'} · {c.devices} {c.devices === 1 ? 'device' : 'devices'}</li>)}
              </ul>
            </GlassCard>
          )}

          <GlassCard as="section" aria-label="Completed requests" className="space-y-3">
            <h2 className="text-lg font-bold text-ink dark:text-white">Completed requests</h2>
            {rep.items.length === 0 ? (
              <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">No requests were completed in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm text-ink dark:text-[#E8F1EB]">
                  <thead><tr className="text-left text-xs uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]"><th scope="col" className="py-1 pr-3">Reference</th><th scope="col" className="py-1 pr-3">Completed</th><th scope="col" className="py-1 pr-3">Devices</th><th scope="col" className="py-1 pr-3">Categories</th><th scope="col" className="py-1">Weighed</th></tr></thead>
                  <tbody>
                    {rep.items.map((i) => (
                      <tr key={i._id} className="border-t border-black/5 dark:border-white/10">
                        <td className="py-1.5 pr-3"><Link to={`/dashboard/recycling/${i._id}`} className="font-semibold underline">{i.refNo}</Link></td>
                        <td className="py-1.5 pr-3">{day(i.completedAt)}</td>
                        <td className="py-1.5 pr-3 font-numeric">{i.deviceCount}</td>
                        <td className="py-1.5 pr-3">{i.categories.join(', ')}</td>
                        <td className="py-1.5 font-numeric">{formatKg(i.materials.reduce((t, m) => (typeof m.actualKg === 'number' ? t + m.actualKg : t), 0) || null)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}

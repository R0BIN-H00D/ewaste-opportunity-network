import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Layers, MapPin, PackageSearch, Search } from 'lucide-react';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import { useFetch } from '../../hooks/useFetch';
import { refurbApi } from '../../services/refurbishmentApi';
import { CONDITIONS, labelOf } from '../../lib/devices';

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

function postedAgo(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!Number.isFinite(days) || days < 1) return 'Today';
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

const HOW = [
  ['Find a request', 'Look for a device you have or can get.'],
  ['Press Accept', 'Add a short message, for example what you have.'],
  ['They contact you', 'The refurbisher messages you to agree the rest.'],
];

const SORTS = [
  ['newest', 'Newest first'],
  ['most', 'Most devices needed'],
  ['city', 'City A to Z'],
];

function WantedCard({ w }) {
  const detail = [w.brand, w.minCondition && `${labelOf(CONDITIONS, w.minCondition)} or better`].filter(Boolean);
  return (
    <article className="glass flex flex-col gap-4 rounded-3xl p-5 transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-start justify-between gap-3">
        <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary dark:text-primary-tint">{w.category?.name || 'Any device'}</span>
        <span className="text-xs text-ink-muted dark:text-[#9FB2A7]">{postedAgo(w.createdAt)}</span>
      </div>
      <div>
        <h3 className="text-lg font-bold leading-snug text-ink dark:text-white">{w.title}</h3>
        {detail.length > 0 && <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{detail.join(' · ')}</p>}
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1 font-medium text-ink dark:bg-white/10 dark:text-white"><Layers size={14} aria-hidden /> Needs {w.quantity}</span>
        {w.city && <span className="inline-flex items-center gap-1.5 rounded-full bg-black/[0.04] px-3 py-1 font-medium text-ink dark:bg-white/10 dark:text-white"><MapPin size={14} aria-hidden /> {w.city}</span>}
      </div>
      {w.notes && <p className="line-clamp-3 text-sm leading-relaxed text-ink dark:text-[#E8F1EB]">{w.notes}</p>}
      <div className="mt-auto space-y-3 border-t border-black/5 pt-4 dark:border-white/10">
        <p className="flex items-center gap-2.5 text-sm text-ink-muted dark:text-[#9FB2A7]">
          <span aria-hidden className="grid h-8 w-8 place-items-center rounded-full bg-primary text-xs font-bold text-white dark:bg-primary-tint dark:text-canvas-dark">{initials(w.refurbisher?.name)}</span>
          <span>Wanted by <span className="font-semibold text-ink dark:text-white">{w.refurbisher?.name}</span></span>
        </p>
        {w.hasResponded
          ? <Badge tone="blue" className="!px-3 !py-1.5 !text-sm"><Check size={14} aria-hidden /> Accepted</Badge>
          : <Link to={`/dashboard/wanted/${w._id}/accept`} className="btn btn-primary w-full justify-center" aria-label={`Accept request ${w.title}`}>Accept</Link>}
      </div>
    </article>
  );
}

/** Devices refurbishers are looking for. Device owners and technicians can accept the ones they can help with. */
export default function WantedBoard() {
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');
  const [open, setOpen] = useState(false);
  const { data, error, loading, reload } = useFetch((signal) => refurbApi.wanted({ as: 'board', page, limit: 24 }, signal), [page]);
  const items = data?.items || [];

  const categories = [...new Set(items.map((w) => w.category?.name).filter(Boolean))].sort();
  const q = term.trim().toLowerCase();
  const shown = items
    .filter((w) => (!category || w.category?.name === category)
      && (!open || !w.hasResponded)
      && (!q || [w.title, w.brand, w.city, w.notes, w.category?.name, w.refurbisher?.name].filter(Boolean).join(' ').toLowerCase().includes(q)))
    .sort((a, b) => (sort === 'most' ? (b.quantity || 0) - (a.quantity || 0) : sort === 'city' ? (a.city || '~').localeCompare(b.city || '~') : 0));
  const filtering = Boolean(q || category || open);
  const clear = () => { setTerm(''); setCategory(''); setOpen(false); };

  return (
    <div className="space-y-6">
      <section aria-label="About wanted devices" className="glass-strong space-y-6 rounded-3xl p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark"><PackageSearch size={24} /></span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-white">Wanted devices</h1>
            <p className="mt-1 max-w-2xl text-ink-muted dark:text-[#9FB2A7]">Refurbishers post the devices they are looking for. If you have one to give or sell, accept the request and they will get in touch with you.</p>
          </div>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3" aria-label="How it works">
          {HOW.map(([title, text], n) => (
            <li key={title} className="flex items-start gap-3 rounded-2xl bg-black/[0.03] p-4 dark:bg-white/5">
              <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white dark:bg-primary-tint dark:text-canvas-dark">{n + 1}</span>
              <div>
                <p className="text-sm font-semibold text-ink dark:text-white">{title}</p>
                <p className="mt-0.5 text-sm text-ink-muted dark:text-[#9FB2A7]">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load requests" />
      ) : loading && !data ? (
        <div aria-busy className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((n) => <Skeleton key={n} className="h-64 !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Search} art="recycle" title="No requests right now">When a refurbisher posts a device they are looking for it appears here.</EmptyState>
      ) : (
        <>
          <div className="space-y-3">
            <label className="glass-subtle flex items-center gap-3 rounded-full px-5 py-3">
              <Search size={18} aria-hidden className="shrink-0 text-ink-muted" />
              <span className="sr-only">Search requests</span>
              <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by device, brand or city" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted dark:text-white" />
            </label>
            {categories.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
                {['', ...categories].map((c) => (
                  <button
                    key={c || 'all'}
                    type="button"
                    aria-pressed={category === c}
                    onClick={() => setCategory(c)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${category === c ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink hover:-translate-y-0.5 dark:text-white'}`}
                  >
                    {c || 'All'}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" aria-live="polite">
              {filtering ? `Showing ${shown.length} of ${items.length} requests` : `${items.length} ${items.length === 1 ? 'request' : 'requests'} from refurbishers`}
              {filtering && <button type="button" onClick={clear} className="ml-3 font-semibold text-primary underline dark:text-primary-tint">Clear filters</button>}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
                <input type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} className="h-4 w-4 accent-[var(--color-primary,#1B5E3A)]" /> Hide ones I accepted
              </label>
              <label className="flex items-center gap-2 text-sm text-ink dark:text-white">
                Sort
                <select value={sort} onChange={(e) => setSort(e.target.value)} className="glass-subtle rounded-full px-3 py-1.5 text-sm font-medium text-ink outline-none dark:text-white">
                  {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </div>
          </div>

          {shown.length === 0 ? (
            <EmptyState icon={Search} art="recycle" title="Nothing matches">Try a different word, or <button type="button" onClick={clear} className="font-semibold underline">clear the filters</button>.</EmptyState>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((w) => <WantedCard key={w._id} w={w} />)}
            </div>
          )}
          <Pagination page={data.meta.page} pages={data.meta.pages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MapPin, Recycle, Search, X } from 'lucide-react';
import Alert from '../../components/ui/Alert';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Modal from '../../components/ui/Modal';
import Pagination from '../../components/ui/Pagination';
import TextField from '../../components/ui/TextField';
import { DeviceCardSkeleton, Thumb } from '../../components/devices/DeviceCard';
import { useFetch } from '../../hooks/useFetch';
import { useCategories } from '../../hooks/useCategories';
import { refurbApi } from '../../services/refurbishmentApi';
import { CONDITIONS, labelOf, placeLabel } from '../../lib/devices';

const KEYS = ['q', 'category', 'condition', 'city'];

/** Reusable devices owners have listed for refurbishment (FR-MKT-001). Only verified refurbishers can see this. */
export default function Opportunities() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const [draft, setDraft] = useState(filters);
  const key = JSON.stringify(filters);
  useEffect(() => setDraft(filters), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, reload } = useFetch((signal) => refurbApi.opportunities({ ...filters, page, limit: 12 }, signal), [key, page]);
  const items = data?.items || [];
  const active = KEYS.some((k) => filters[k]);

  const apply = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  const set = (name) => (e) => setDraft((d) => ({ ...d, [name]: e.target.value }));
  const setNow = (name) => (e) => {
    const next = { ...draft, [name]: e.target.value };
    setDraft(next);
    apply(next);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Devices to refurbish</h1>
        <div className="flex gap-2">
          <Link to="/dashboard/my-requests" className="btn btn-glass">My requests</Link>
          <Link to="/dashboard/refurbishment" className="btn btn-glass">My jobs</Link>
        </div>
      </div>
      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Reusable devices their owners want refurbished. Make an offer; the owner chooses one refurbisher and the exact address is shared only with that person.</p>

      <form role="search" aria-label="Search devices" noValidate onSubmit={(e) => { e.preventDefault(); apply(draft); }} className="glass grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
        <TextField label="Search" type="search" value={draft.q} onChange={set('q')} placeholder="Laptop, tablet, Lenovo…" maxLength={100} />
        <TextField as="select" label="Category" value={draft.category} onChange={setNow('category')}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </TextField>
        <TextField as="select" label="Condition" value={draft.condition} onChange={setNow('condition')}>
          <option value="">Any condition</option>
          {CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField label="City" value={draft.city} onChange={set('city')} maxLength={80} />
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary"><Search size={16} aria-hidden /> Search</button>
          {active && <button type="button" className="btn btn-glass" aria-label="Clear all filters" onClick={() => setParams({})}><X size={16} aria-hidden /> Clear</button>}
        </div>
      </form>

      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" aria-live="polite">
        {loading && !data ? 'Loading devices…' : data ? `${data.meta.total} ${data.meta.total === 1 ? 'device' : 'devices'} available` : ''}
      </p>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load devices" />
      ) : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>{Array.from({ length: 3 }, (_, i) => <DeviceCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Recycle} art="recycle" title={active ? 'No devices match your search' : 'No devices to refurbish right now'} action={active ? <button type="button" className="btn btn-glass" onClick={() => setParams({})}>Clear filters</button> : null}>
          {active ? 'Try fewer filters or a different keyword.' : 'When an owner lists a device for refurbishment it appears here.'}
        </EmptyState>
      ) : (
        <>
          <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
            {items.map((l) => (
              <article key={l._id} className="glass flex flex-col overflow-hidden">
                <Thumb listing={l} className="aspect-[4/3]" />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <Badge tone={l.condition === 'fully_working' ? 'green' : 'amber'}>{labelOf(CONDITIONS, l.condition)}</Badge>
                  <h3 className="text-base font-bold leading-snug text-ink dark:text-white">{l.title}</h3>
                  <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{[l.category?.name, l.brand, l.model].filter(Boolean).join(' · ')}</p>
                  {placeLabel(l) && <p className="flex items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]"><MapPin size={14} aria-hidden />{placeLabel(l)}</p>}
                  <div className="mt-auto pt-2">
                    {l.hasOffered
                      ? <Badge tone="blue">Offer sent</Badge>
                      : <Link to={`/dashboard/opportunities/${l._id}/offer`} className="btn btn-primary" aria-label={`Make an offer on ${l.title}`}>Make an offer</Link>}
                  </div>
                </div>
              </article>
            ))}
          </div>
          <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(n > 1 ? { page: String(n) } : {}) })} />
        </>
      )}
    </div>
  );
}

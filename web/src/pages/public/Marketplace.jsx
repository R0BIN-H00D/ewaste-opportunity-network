import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Heart, Search, Store, X } from 'lucide-react';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import TextField from '../../components/ui/TextField';
import ProductCard, { ProductCardSkeleton } from '../../components/marketplace/ProductCard';
import { useFetch } from '../../hooks/useFetch';
import { useCategories } from '../../hooks/useCategories';
import { marketApi } from '../../services/marketplaceApi';
import { PRODUCT_CONDITIONS, PRODUCT_SORTS } from '../../lib/marketplace';

const KEYS = ['q', 'category', 'condition', 'minPrice', 'maxPrice', 'sort'];
const PAGE_SIZE = 12;

/** Public refurbished marketplace (FR-MKT-006): search, category, condition and price filters, sorting and pages. */
export default function Marketplace() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const [draft, setDraft] = useState(filters);
  const [problem, setProblem] = useState('');
  const key = JSON.stringify(filters);
  useEffect(() => setDraft(filters), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, reload } = useFetch((signal) => marketApi.list({ ...filters, page, limit: PAGE_SIZE }, signal), [key, page]);
  const items = data?.items || [];
  const meta = data?.meta;
  const active = KEYS.some((k) => k !== 'sort' && filters[k]);

  const apply = (next) => {
    const lo = next.minPrice === '' ? null : Number(next.minPrice);
    const hi = next.maxPrice === '' ? null : Number(next.maxPrice);
    if ((lo !== null && (Number.isNaN(lo) || lo < 0)) || (hi !== null && (Number.isNaN(hi) || hi < 0))) return setProblem('Prices must be 0 or more.');
    if (lo !== null && hi !== null && lo > hi) return setProblem('The lowest price is above the highest price.');
    setProblem('');
    return setParams(Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'sort' && v === 'newest'))));
  };
  const set = (name) => (e) => setDraft((d) => ({ ...d, [name]: e.target.value }));
  const setNow = (name) => (e) => { const next = { ...draft, [name]: e.target.value }; setDraft(next); apply(next); };

  // A stale link such as ?page=99 should land on the last real page rather than an empty screen.
  useEffect(() => {
    if (data && items.length === 0 && meta?.total > 0 && page > 1) setParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(meta.pages > 1 ? { page: String(meta.pages) } : {}) });
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6 space-y-2">
        <h1 className="text-3xl font-extrabold text-ink dark:text-white sm:text-4xl">Marketplace</h1>
        <p className="max-w-3xl text-ink-muted dark:text-[#9FB2A7]">Refurbished devices from verified refurbishers. Every product shows its condition, and you pay the seller directly: the platform never handles money.</p>
        <p className="text-sm"><Link to="/donations" className="inline-flex items-center gap-1 font-semibold text-primary underline dark:text-primary-tint"><Heart size={14} aria-hidden />Looking for a donated device? See the donation marketplace</Link></p>
      </header>

      <form role="search" aria-label="Search products" noValidate onSubmit={(e) => { e.preventDefault(); apply(draft); }} className="glass mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
        <TextField className="lg:col-span-2" label="Search" type="search" value={draft.q} onChange={set('q')} placeholder="Laptop, Dell, ThinkPad…" maxLength={100} />
        <TextField as="select" label="Category" value={draft.category} onChange={setNow('category')}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </TextField>
        <TextField as="select" label="Condition" value={draft.condition} onChange={setNow('condition')}>
          <option value="">Any condition</option>
          {PRODUCT_CONDITIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <TextField label="Lowest price (₹)" type="number" inputMode="numeric" min="0" value={draft.minPrice} onChange={set('minPrice')} />
        <TextField label="Highest price (₹)" type="number" inputMode="numeric" min="0" value={draft.maxPrice} onChange={set('maxPrice')} />
        <TextField as="select" label="Sort by" value={draft.sort || 'newest'} onChange={setNow('sort')}>
          {PRODUCT_SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </TextField>
        <div className="flex gap-2 lg:col-span-5">
          <button type="submit" className="btn btn-primary"><Search size={16} aria-hidden /> Search</button>
          {active && <button type="button" className="btn btn-glass" aria-label="Clear all filters" onClick={() => { setProblem(''); setParams({}); }}><X size={16} aria-hidden /> Clear</button>}
        </div>
        {problem && <p role="alert" className="text-sm font-medium text-danger dark:text-red-300 sm:col-span-2 lg:col-span-6">{problem}</p>}
      </form>

      <p className="mb-4 text-sm text-ink-muted dark:text-[#9FB2A7]" aria-live="polite">
        {loading && !data ? 'Loading products…' : meta ? `${meta.total} ${meta.total === 1 ? 'product' : 'products'} found` : ''}
      </p>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load the marketplace" />
      ) : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy>{Array.from({ length: 4 }, (_, i) => <ProductCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Store} art="devices" title={active ? 'No products match your search' : 'No refurbished products yet'} action={active ? <button type="button" className="btn btn-glass" onClick={() => setParams({})}>Clear filters</button> : <Link to="/register" className="btn btn-primary">Join as a refurbisher</Link>}>
          {active ? 'Try fewer filters or a different keyword.' : 'Verified refurbishers publish tested devices here, each with its condition and what was done to it.'}
        </EmptyState>
      ) : (
        <>
          <div className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${loading ? 'opacity-60' : ''}`}>
            {items.map((p) => <ProductCard key={p._id} product={p} />)}
          </div>
          <Pagination page={meta.page} pages={meta.pages} onChange={(n) => { setParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(n > 1 ? { page: String(n) } : {}) }); window.scrollTo?.({ top: 0 }); }} />
        </>
      )}
    </div>
  );
}

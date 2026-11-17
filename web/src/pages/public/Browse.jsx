import { Suspense, lazy, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { LayoutGrid, List, MapIcon, PackageSearch } from 'lucide-react';
import DeviceCard, { DeviceCardSkeleton } from '../../components/devices/DeviceCard';
import FilterPanel, { FILTER_KEYS } from '../../components/devices/FilterPanel';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import { useFetch } from '../../hooks/useFetch';
import { useCategories } from '../../hooks/useCategories';
import { deviceApi } from '../../services/deviceApi';
import { listingMarkers, unplaced } from '../../lib/maps';

// The map and its tiles load only when someone asks for the map view.
const MapView = lazy(() => import('../../components/maps/MapView'));

const PAGE_SIZE = 12;
const VIEWS = [
  { value: 'grid', Icon: LayoutGrid, label: 'Grid view' },
  { value: 'list', Icon: List, label: 'List view' },
  { value: 'map', Icon: MapIcon, label: 'Map view' },
];

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const layout = ['list', 'map'].includes(params.get('view')) ? params.get('view') : 'grid';
  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) || ''])), [params]);
  const queryKey = JSON.stringify([filters, page]);

  const { data, error, loading, reload } = useFetch((signal) => deviceApi.list({ ...filters, page, limit: PAGE_SIZE }, signal), [queryKey]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: false });
  };
  const apply = (values) => update({ ...Object.fromEntries(FILTER_KEYS.map((k) => [k, k === 'sort' && values[k] === 'newest' ? '' : values[k]])), page: '' });
  const clear = () => setParams(layout !== 'grid' ? { view: layout } : {});
  const goTo = (n) => {
    update({ page: n > 1 ? String(n) : '' });
    window.scrollTo?.({ top: 0 });
  };

  const items = useMemo(() => data?.items || [], [data]);
  const meta = data?.meta;
  const mapMarkers = useMemo(() => (layout === 'map' ? listingMarkers(items) : []), [layout, items]);
  const missing = unplaced(items, mapMarkers);

  // A stale link such as ?page=99 should land on the last real page rather than an empty screen.
  useEffect(() => {
    if (data && items.length === 0 && meta?.total > 0 && page > 1) update({ page: meta.pages > 1 ? String(meta.pages) : '' });
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold text-ink dark:text-white sm:text-4xl">Browse devices</h1>
          <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]" aria-live="polite">
            {loading && !data ? 'Loading devices…' : meta ? `${meta.total} ${meta.total === 1 ? 'device' : 'devices'} found` : ''}
          </p>
        </div>
        <div className="glass-subtle flex p-1" role="group" aria-label="Layout">
          {VIEWS.map((view) => {
            const Icon = view.Icon;
            return (
              <button
                key={view.value}
                type="button"
                aria-label={view.label}
                aria-pressed={layout === view.value}
                onClick={() => update({ view: view.value === 'grid' ? '' : view.value })}
                className={`grid h-10 w-10 place-items-center rounded-xl transition ${layout === view.value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'text-ink-muted'}`}
              >
                <Icon size={18} aria-hidden />
              </button>
            );
          })}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside><FilterPanel values={filters} categories={categories} onApply={apply} onClear={clear} /></aside>
        <section aria-label="Results" aria-busy={loading}>
          {error ? (
            <ErrorState error={error} onRetry={reload} title="Could not load devices" />
          ) : loading && !data ? (
            <div className={layout === 'list' ? 'space-y-4' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'}>
              {Array.from({ length: 6 }, (_, i) => <DeviceCardSkeleton key={i} layout={layout} />)}
            </div>
          ) : items.length === 0 ? (
            <EmptyState icon={PackageSearch} art="search" title="No devices match your search" action={<button type="button" onClick={clear} className="btn btn-glass">Clear filters</button>}>
              Try fewer filters or a different keyword. Have something to give a second life?{' '}
              <Link to="/list-device" className="font-semibold text-primary underline dark:text-primary-tint">List your device</Link>.
            </EmptyState>
          ) : (
            <>
              {layout === 'map' ? (
                <div className={loading ? 'opacity-60' : ''}>
                  <Suspense fallback={<div className="h-[30rem] animate-pulse rounded-3xl bg-black/5 dark:bg-white/10" aria-busy />}>
                    <MapView label="Map of the devices on this page" markers={mapMarkers} />
                  </Suspense>
                  <p className="mt-2 text-xs text-ink-muted dark:text-[#9FB2A7]">
                    Pins show an approximate area, never the exact address.
                    {missing > 0 ? ` ${missing} of these ${missing === 1 ? 'has' : 'have'} no location and ${missing === 1 ? 'is' : 'are'} only in the list below.` : ''}
                  </p>
                  <ul className="mt-4 space-y-2" aria-label="Devices on the map">
                    {items.map((l) => (
                      <li key={l._id}>
                        <Link to={`/devices/${l._id}`} className="font-semibold text-primary hover:underline dark:text-primary-tint">{l.title}</Link>
                        {[l.addressArea, l.city].filter(Boolean).length > 0 && <span className="text-sm text-ink-muted dark:text-[#9FB2A7]"> · {[l.addressArea, l.city].filter(Boolean).join(', ')}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className={`${layout === 'list' ? 'space-y-4' : 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3'} ${loading ? 'opacity-60' : ''}`}>
                  {items.map((l) => <DeviceCard key={l._id} listing={l} layout={layout} />)}
                </div>
              )}
              <div className="mt-8"><Pagination page={meta.page} pages={meta.pages} onChange={goTo} /></div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarClock, ClipboardList, MapPin, Plus, Search, SlidersHorizontal, Wrench, X } from 'lucide-react';
import Alert from '../../components/ui/Alert';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import { Thumb } from '../../components/devices/DeviceCard';
import { useAuth } from '../../hooks/useAuth';
import { useFetch } from '../../hooks/useFetch';
import { useSave } from '../../hooks/useSave';
import { requestApi, technicianApi } from '../../services/repairApi';
import { AVAILABILITY, formatDate, journeySteps } from '../../lib/requests';
import { placeLabel } from '../../lib/devices';

const CUSTOMER_TABS = [['active', 'Active'], ['all', 'All']];
const JOB_TABS = [['jobs', 'Active jobs'], ['all', 'All jobs']];

const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const DOT = { available: 'bg-success', limited: 'bg-warning', unavailable: 'bg-danger' };

/** How far along a repair is, as a thin bar. Requests that were declined or cancelled show none. */
function Progress({ request }) {
  if (['rejected', 'cancelled'].includes(request.status)) return null;
  const steps = journeySteps(request);
  const done = steps.filter((s) => s.state === 'done').length + (steps.some((s) => s.state === 'current') ? 0.5 : 0);
  const percent = Math.round((done / steps.length) * 100);
  const now = steps.find((s) => s.state === 'current');
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs">
        <span className="font-medium text-ink-muted dark:text-[#9FB2A7]">{now ? now.label : 'Finished'}</span>
        <span className="font-numeric font-semibold text-ink dark:text-white">{percent}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-all dark:bg-primary-tint" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function RequestCard({ request: r, technicianView }) {
  const other = technicianView ? r.customer : r.technician;
  const needsAction = Boolean(r.actions?.length);
  const place = placeLabel(r.listing);
  return (
    <article className={`glass flex h-full flex-col overflow-hidden rounded-3xl transition hover:-translate-y-0.5 hover:shadow-xl ${needsAction ? 'ring-2 ring-warning/60' : ''}`}>
      <div className="relative">
        <Thumb listing={r.listing} className="h-40 w-full" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div>
          <h2 className="truncate text-lg font-bold text-ink dark:text-white">{r.listing?.title}</h2>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted dark:text-[#9FB2A7]">{r.issueDescription}</p>
        </div>
        <ul className="space-y-1.5 text-sm text-ink dark:text-[#E8F1EB]">
          <li className="flex items-center gap-2.5">
            <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[10px] font-bold text-white dark:bg-primary-tint dark:text-canvas-dark">{other?.name ? initials(other.name) : '?'}</span>
            <span className="min-w-0 truncate">
              {other?.name ? `${technicianView ? 'Customer' : 'Technician'}: ${other.name}` : !technicianView && r.mode === 'open' ? 'Open to any suitable technician' : 'No technician yet'}
            </span>
          </li>
          {place && <li className="flex items-center gap-2.5 text-ink-muted dark:text-[#9FB2A7]"><MapPin size={16} aria-hidden className="shrink-0" /> <span className="truncate">{place}</span></li>}
          <li className="flex items-center gap-2.5 text-ink-muted dark:text-[#9FB2A7]"><CalendarClock size={16} aria-hidden className="shrink-0" /> <span>Updated {formatDate(r.updatedAt)}</span></li>
        </ul>
        <div className="mt-auto space-y-4 pt-1">
          <Progress request={r} />
          <Link to={`/dashboard/requests/${r._id}`} className={`btn w-full justify-center ${needsAction ? 'btn-primary' : 'btn-glass'}`} aria-label={`Open request for ${r.listing?.title}`}>
            {needsAction ? 'Action needed' : 'View'} <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** The technician's availability as one tidy control in the page header: a coloured dot and a dropdown. */
function AvailabilityControl({ initial = '' }) {
  const [value, setValue] = useState(initial);
  const save = useSave();
  const change = async (e) => {
    const status = e.target.value;
    setValue(status);
    await save.run(() => technicianApi.setAvailability(status), 'Availability updated');
  };
  return (
    <div className="w-full sm:w-72">
      <label htmlFor="availability" className="mb-1.5 block text-sm font-semibold text-ink dark:text-white">Your availability</label>
      <div className="glass-subtle flex items-center gap-3 rounded-full px-4">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${DOT[value] || 'bg-gray-400'}`} />
        <select id="availability" value={value} onChange={change} className="min-h-[44px] w-full bg-transparent text-sm font-medium text-ink outline-none dark:text-white">
          <option value="" disabled>Choose…</option>
          {AVAILABILITY.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>
      <p className="mt-1.5 text-xs text-ink-muted dark:text-[#9FB2A7]">Technicians who are not taking jobs are not suggested to customers.</p>
      <Alert variant={save.status === 'error' ? 'error' : 'success'}>{save.status === 'saved' || save.status === 'error' ? save.message : ''}</Alert>
    </div>
  );
}

const SORTS = [['newest', 'Newest first'], ['oldest', 'Oldest first']];
const categoryName = (r) => (typeof r.listing?.category === 'object' ? r.listing.category?.name : '') || '';

/**
 * Three pages share this component:
 *  - "board": Find repair requests (a technician looking for work), with a Filters button;
 *  - "jobs": My repair jobs (a technician's accepted work);
 *  - "customer" (the default): My repairs, for a device owner.
 */
export default function Requests({ view = 'customer' }) {
  const { user, roleProfile } = useAuth();
  const technician = user?.role === 'technician';
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({ category: '', city: '', onSite: false, sort: 'newest' });

  const board = view === 'board';
  const tabs = view === 'customer' ? CUSTOMER_TABS : [];
  const jobTab = JOB_TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : JOB_TABS[0][0];
  const tab = board ? 'board' : view === 'jobs' ? jobTab : params.get('tab') || tabs[0][0];
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);

  const query = board ? { as: 'board' }
    : view === 'jobs' ? (tab === 'all' ? { as: 'technician' } : { as: 'technician', active: 'true' })
      : { as: 'customer', ...(tab === 'active' ? { active: 'true' } : {}) };
  const { data, error, loading, reload } = useFetch((signal) => requestApi.list({ ...query, page, limit: board ? 24 : 8 }, signal), [view, tab, page, user?.role]);

  // A technician who opens the old "repairs" address goes to the right one of the two new pages.
  if (technician && view === 'customer') return <Navigate to={['jobs', 'all'].includes(params.get('tab')) ? `/dashboard/my-jobs${params.get('tab') === 'jobs' ? '' : `?tab=${params.get('tab')}`}` : '/dashboard/find-requests'} replace />;

  const items = data?.items || [];
  const q = term.trim().toLowerCase();
  const categories = [...new Set(items.map(categoryName).filter(Boolean))].sort();
  const cities = [...new Set(items.map((r) => r.listing?.city).filter(Boolean))].sort();
  const showingAll = view === 'jobs' && tab !== JOB_TABS[0][0]; // "Show" is a filter too, once it is not on the default
  const activeFilters = [filters.category, filters.city, filters.onSite, showingAll].filter(Boolean).length;
  const shown = items
    .filter((r) => (!q || [r.listing?.title, r.listing?.brand, r.issueDescription, r.customer?.name, r.technician?.name].filter(Boolean).join(' ').toLowerCase().includes(q))
      && (!filters.category || categoryName(r) === filters.category)
      && (!filters.city || r.listing?.city === filters.city)
      && (!filters.onSite || r.onSite))
    .sort((a, b) => (filters.sort === 'oldest' ? -1 : 1) * (new Date(b.updatedAt) - new Date(a.updatedAt)));
  const filtering = Boolean(q || activeFilters);
  const hasFilters = board || view === 'jobs';
  const waiting = items.filter((r) => r.actions?.length).length;
  const clear = () => {
    setTerm('');
    setFilters({ category: '', city: '', onSite: false, sort: filters.sort });
    if (view === 'jobs' && params.get('tab')) setParams({});
  };
  const setFilter = (name) => (e) => setFilters((f) => ({ ...f, [name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const heading = board ? 'Find repair requests' : view === 'jobs' ? 'My repair jobs' : 'My repairs';
  const intro = board ? 'New requests from device owners. Open one to read the problem and accept the job.'
    : view === 'jobs' ? 'The jobs you have accepted, from the first diagnosis to handing the device back.'
      : 'Follow each repair from the first request to the day your device comes back.';
  const Icon = board ? Search : view === 'jobs' ? ClipboardList : Wrench;
  const empty = board ? ['No open requests near you', 'New requests that match your device types and service area will appear here.']
    : view === 'jobs' ? ['No jobs here yet', 'Jobs you accept will appear here. Find new ones under Find repair requests.']
      : ['Nothing here yet', 'List a device for repair, then ask a technician to look at it.'];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section aria-label="About this page" className="glass-strong flex flex-wrap items-start justify-between gap-6 rounded-3xl p-6 sm:p-8">
        <div className="flex items-start gap-4">
          <span aria-hidden className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark"><Icon size={26} /></span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-white">{heading}</h1>
            <p className="mt-1 max-w-xl text-ink-muted dark:text-[#9FB2A7]">{intro}</p>
            {view === 'customer' && <Link to="/dashboard/listings" className="btn btn-primary mt-4"><Plus size={16} aria-hidden /> Start a new repair</Link>}
            {view === 'jobs' && <Link to="/dashboard/find-requests" className="btn btn-glass mt-4"><Search size={16} aria-hidden /> Find more requests</Link>}
          </div>
        </div>
        {board && <AvailabilityControl initial={roleProfile?.availability?.status || ''} />}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {tabs.length > 0 ? (
          <div className="glass-subtle inline-flex flex-wrap gap-1 rounded-full p-1" role="tablist" aria-label="Filter requests">
            {tabs.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                onClick={() => { setTerm(''); setParams(value === tabs[0][0] ? {} : { tab: value }); }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${tab === value ? 'bg-primary text-white shadow dark:bg-primary-tint dark:text-canvas-dark' : 'text-ink-muted hover:text-ink dark:text-[#9FB2A7] dark:hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
        ) : <span />}
        {(items.length > 0 || view === 'jobs') && (
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            {items.length > 0 && (
              <label className="glass-subtle flex min-w-0 flex-1 items-center gap-2.5 rounded-full px-4 py-2.5 sm:w-72 sm:flex-none">
                <Search size={16} aria-hidden className="shrink-0 text-ink-muted" />
                <span className="sr-only">Search requests</span>
                <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search by device or person" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted dark:text-white" />
              </label>
            )}
            {hasFilters && (
              <button type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((o) => !o)} className={`inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition ${filtersOpen || activeFilters ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink dark:text-white'}`}>
                <SlidersHorizontal size={16} aria-hidden /> Filters
                {activeFilters > 0 && <span className="grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-white px-1 text-xs font-bold text-primary">{activeFilters}</span>}
              </button>
            )}
          </div>
        )}
      </div>

      {hasFilters && filtersOpen && (items.length > 0 || view === 'jobs') && (
        <section aria-label="Filters" className="glass space-y-4 rounded-3xl p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {view === 'jobs' && (
              <div>
                <label htmlFor="f-show" className="mb-1.5 block text-sm font-semibold text-ink dark:text-white">Show</label>
                <select id="f-show" value={tab} onChange={(e) => setParams(e.target.value === JOB_TABS[0][0] ? {} : { tab: e.target.value })} className="glass-subtle min-h-[44px] w-full rounded-full px-4 text-sm text-ink outline-none dark:text-white">
                  {JOB_TABS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            )}
            <div>
              <label htmlFor="f-category" className="mb-1.5 block text-sm font-semibold text-ink dark:text-white">Device type</label>
              <select id="f-category" value={filters.category} onChange={setFilter('category')} className="glass-subtle min-h-[44px] w-full rounded-full px-4 text-sm text-ink outline-none dark:text-white">
                <option value="">All types</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-city" className="mb-1.5 block text-sm font-semibold text-ink dark:text-white">City</label>
              <select id="f-city" value={filters.city} onChange={setFilter('city')} className="glass-subtle min-h-[44px] w-full rounded-full px-4 text-sm text-ink outline-none dark:text-white">
                <option value="">All cities</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="f-sort" className="mb-1.5 block text-sm font-semibold text-ink dark:text-white">Sort by</label>
              <select id="f-sort" value={filters.sort} onChange={setFilter('sort')} className="glass-subtle min-h-[44px] w-full rounded-full px-4 text-sm text-ink outline-none dark:text-white">
                {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div className="flex items-end">
              <label className="glass-subtle flex min-h-[44px] w-full cursor-pointer items-center gap-3 rounded-full px-4 text-sm font-medium text-ink dark:text-white">
                <input type="checkbox" checked={filters.onSite} onChange={setFilter('onSite')} className="h-4 w-4 accent-[var(--color-primary,#1B5E3A)]" /> On-site repairs only
              </label>
            </div>
          </div>
          {activeFilters > 0 && <button type="button" onClick={clear} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary underline dark:text-primary-tint"><X size={14} aria-hidden /> Clear all filters</button>}
        </section>
      )}

      {data && items.length > 0 && (
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]" aria-live="polite">
          {filtering ? `Showing ${shown.length} of ${items.length} requests` : `${data.meta?.total ?? items.length} ${(data.meta?.total ?? items.length) === 1 ? 'request' : 'requests'}`}
          {filtering && <button type="button" onClick={clear} className="ml-3 font-semibold text-primary underline dark:text-primary-tint">Clear filters</button>}
          {!filtering && waiting > 0 && <span className="ml-2 font-semibold text-warning">· {waiting} waiting for you</span>}
        </p>
      )}

      {error ? (
        error.code === 'NOT_VERIFIED' ? (
          <EmptyState icon={ClipboardList} title="Your account is waiting for verification" action={<Link to="/dashboard/settings" className="btn btn-glass">Check verification</Link>}>
            You can take repair jobs once an administrator has approved your documents.
          </EmptyState>
        ) : (
          <ErrorState error={error} onRetry={reload} title="Could not load requests" />
        )
      ) : loading && !data ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96 !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={ClipboardList} title={showingAll ? 'Nothing in this list' : empty[0]}>{showingAll ? 'Open Filters and choose Show to see another list.' : empty[1]}</EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon={Search} title="Nothing matches">Try different filters, or <button type="button" onClick={clear} className="font-semibold underline">clear them</button>.</EmptyState>
      ) : (
        <ul className={`grid gap-5 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
          {shown.map((r) => <li key={r._id}><RequestCard request={r} technicianView={technician} /></li>)}
        </ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...(!board && tab !== (tabs[0]?.[0] ?? JOB_TABS[0][0]) ? { tab } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

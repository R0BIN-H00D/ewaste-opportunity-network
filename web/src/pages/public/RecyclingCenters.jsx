import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Clock, MapPin, Recycle, Search, ShieldCheck, X } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import { Rating } from '../../components/requests/TechnicianCard';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../hooks/useAuth';
import { useCategories } from '../../hooks/useCategories';
import { centerApi } from '../../services/recyclingApi';
import { formatKg } from '../../lib/recycling';

const KEYS = ['q', 'city', 'category'];
const PAGE_SIZE = 12;
const day = (v) => (v ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(v)) : '');

function AuthBadge({ center }) {
  return center.authorized
    ? <Badge tone="green"><ShieldCheck size={12} aria-hidden className="mr-1" />Authorised</Badge>
    : <Badge tone="amber">Authorisation not current</Badge>;
}

function CategoryChips({ list, max = 5 }) {
  if (!list?.length) return <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Categories not listed yet.</p>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Accepted categories">
      {list.slice(0, max).map((c) => <li key={c._id} className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary dark:text-primary-tint">{c.name}</li>)}
      {list.length > max && <li className="rounded-full bg-primary/5 px-2.5 py-0.5 text-xs text-ink-muted dark:text-[#9FB2A7]">+{list.length - max} more</li>}
    </ul>
  );
}

function CenterCard({ center: c }) {
  return (
    <GlassCard as="article" className="flex h-full flex-col gap-3 !p-5">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-ink dark:text-white"><Link to={`/recycling-centers/${c._id}`} className="hover:underline">{c.name}</Link></h2>
        <div className="flex flex-wrap items-center gap-2"><AuthBadge center={c} />{c.city && <span className="inline-flex items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]"><MapPin size={12} aria-hidden />{c.city}</span>}</div>
      </div>
      <CategoryChips list={c.acceptedCategories} />
      {c.operatingHours && <p className="flex items-center gap-1 text-xs text-ink-muted dark:text-[#9FB2A7]"><Clock size={12} aria-hidden />{c.operatingHours}</p>}
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <Rating avg={c.ratingAvg} count={c.ratingCount} />
        <Link to={`/recycling-centers/${c._id}`} className="btn btn-glass !px-3 !py-1.5 text-sm">View centre</Link>
      </div>
    </GlassCard>
  );
}

/** Public directory of verified recycling centres (FR-REC-001). */
export function RecyclingCenterDirectory() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const [draft, setDraft] = useState(filters);
  const key = JSON.stringify(filters);
  useEffect(() => setDraft(filters), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, reload } = useFetch((signal) => centerApi.list({ ...filters, page, limit: PAGE_SIZE }, signal), [key, page]);
  const items = data?.items || [];
  const active = KEYS.some((k) => filters[k]);
  const apply = (next) => setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
      <header className="mb-6 space-y-2">
        <h1 className="text-3xl font-extrabold text-ink dark:text-white sm:text-4xl">Recycling centres</h1>
        <p className="max-w-3xl text-ink-muted dark:text-[#9FB2A7]">Authorised centres that recycle responsibly. Each one is checked by an administrator, and a centre whose authorisation has run out is not listed.</p>
      </header>

      <form role="search" aria-label="Search recycling centres" noValidate onSubmit={(e) => { e.preventDefault(); apply(draft); }} className="glass mb-6 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
        <TextField label="Search" type="search" value={draft.q} onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} placeholder="Centre name" maxLength={100} />
        <TextField label="City" value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} placeholder="Bengaluru" maxLength={80} />
        <TextField as="select" label="Takes this category" value={draft.category} onChange={(e) => { const next = { ...draft, category: e.target.value }; setDraft(next); apply(next); }}>
          <option value="">Any category</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </TextField>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary"><Search size={16} aria-hidden /> Search</button>
          {active && <button type="button" className="btn btn-glass" aria-label="Clear all filters" onClick={() => setParams({})}><X size={16} aria-hidden /> Clear</button>}
        </div>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load the centres" />
      ) : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Recycle} title={active ? 'No centres match your search' : 'No authorised centres yet'} action={active ? <button type="button" className="btn btn-primary" onClick={() => setParams({})}>Clear filters</button> : <Link to="/register" className="btn btn-primary">Join as a recycling centre</Link>}>
          {active ? 'Try fewer filters or another city.' : 'Centres appear here once an administrator has verified them.'}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-muted dark:text-[#9FB2A7]" aria-live="polite">{data.meta.total} {data.meta.total === 1 ? 'centre' : 'centres'} found</p>
          <ul className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>{items.map((c) => <li key={c._id}><CenterCard center={c} /></li>)}</ul>
        </>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

function Fact({ label, children }) {
  if (!children) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]">{label}</dt>
      <dd className="mt-0.5 text-sm text-ink dark:text-[#E8F1EB]">{children}</dd>
    </div>
  );
}

/** One centre: authorisation, what it accepts, hours and the weights it has recorded (actual and estimated kept apart). */
export function RecyclingCenterDetail() {
  const { id } = useParams();
  const { isAuthenticated, user } = useAuth();
  const { data: c, error, loading, reload } = useFetch((signal) => centerApi.get(id, signal), [id]);

  if (loading && !c) return <div className="mx-auto max-w-4xl space-y-5 px-4 py-10" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 w-full !rounded-3xl" /></div>;
  if (error && !c) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="mx-auto max-w-4xl space-y-5 px-4 py-10">
        <ErrorState error={missing ? { message: 'This recycling centre does not exist or is not listed.' } : error} title={missing ? 'Centre not found' : 'Could not load this centre'} onRetry={missing ? undefined : reload} />
        <p className="text-center"><Link to="/recycling-centers" className="font-semibold text-primary underline dark:text-primary-tint">Back to the centres</Link></p>
      </div>
    );
  }

  const canRequest = isAuthenticated && user?.role !== 'admin' && c.authorized;
  return (
    <div className="mx-auto max-w-4xl space-y-5 px-4 py-10">
      <Link to="/recycling-centers" className="inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> Recycling centres</Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-extrabold text-ink dark:text-white">{c.name}</h1>
        <div className="flex flex-wrap items-center gap-3"><AuthBadge center={c} />{c.city && <span className="inline-flex items-center gap-1 text-sm text-ink-muted dark:text-[#9FB2A7]"><MapPin size={14} aria-hidden />{c.city}</span>}<Rating avg={c.ratingAvg} count={c.ratingCount} /></div>
      </header>

      <GlassCard className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink dark:text-[#E8F1EB]">Send your old devices here for responsible recycling. The centre agrees the pickup with you directly, and the platform never handles money.</p>
        {c.authorized && (canRequest
          ? <Link to={`/dashboard/recycling/new?center=${c._id}`} className="btn btn-primary">Request recycling</Link>
          : !isAuthenticated && <Link to="/login" className="btn btn-primary">Log in to request recycling</Link>)}
      </GlassCard>

      <div className="grid gap-5 md:grid-cols-2">
        <GlassCard as="section" aria-label="Authorisation" className="space-y-3">
          <h2 className="text-lg font-bold text-ink dark:text-white">Authorisation</h2>
          <dl className="space-y-3">
            <Fact label="Authorisation number">{c.authorizationNo}</Fact>
            <Fact label="Issued by">{c.authorizingBody}</Fact>
            <Fact label="Valid until">{c.validUntil ? day(c.validUntil) : 'No end date recorded'}</Fact>
          </dl>
        </GlassCard>
        <GlassCard as="section" aria-label="Accepted devices" className="space-y-3">
          <h2 className="text-lg font-bold text-ink dark:text-white">What it accepts</h2>
          <CategoryChips list={c.acceptedCategories} max={20} />
          <dl className="space-y-3"><Fact label="Opening hours">{c.operatingHours}</Fact></dl>
        </GlassCard>
      </div>

      {c.facilityDetails && (
        <GlassCard as="section" aria-label="About the facility" className="space-y-2">
          <h2 className="text-lg font-bold text-ink dark:text-white">About the facility</h2>
          <p className="whitespace-pre-line text-sm text-ink dark:text-[#E8F1EB]">{c.facilityDetails}</p>
        </GlassCard>
      )}

      {c.collectionAreas?.length > 0 && (
        <GlassCard as="section" aria-label="Collection areas" className="space-y-2">
          <h2 className="text-lg font-bold text-ink dark:text-white">Collection areas</h2>
          <ul className="list-disc pl-5 text-sm text-ink dark:text-[#E8F1EB]">{c.collectionAreas.map((a, i) => <li key={i}>{[a.label, a.addressArea].filter(Boolean).join(' · ')}</li>)}</ul>
        </GlassCard>
      )}

      <GlassCard as="section" aria-label="Recorded weights" className="space-y-2">
        <h2 className="text-lg font-bold text-ink dark:text-white">Recovered so far</h2>
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Totals from completed requests. Weighed amounts and estimates are shown separately and never added together.</p>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-primary/5 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]">Weighed (measured)</dt><dd className="mt-1 font-numeric text-2xl font-bold text-primary dark:text-primary-tint">{formatKg(c.totals?.actualKg || 0)}</dd></div>
          <div className="rounded-2xl bg-primary/5 p-4"><dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]">Estimated</dt><dd className="mt-1 font-numeric text-2xl font-bold text-ink dark:text-white">{formatKg(c.totals?.estimatedKg || 0)}</dd></div>
        </dl>
      </GlassCard>
    </div>
  );
}

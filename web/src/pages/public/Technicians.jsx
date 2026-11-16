import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Wrench } from 'lucide-react';
import PageShell from '../../components/layout/PageShell';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import Skeleton from '../../components/ui/Skeleton';
import TextField from '../../components/ui/TextField';
import TechnicianCard, { Avatar, Rating } from '../../components/requests/TechnicianCard';
import Reviews from '../../components/requests/Reviews';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../hooks/useAuth';
import { useCategories } from '../../hooks/useCategories';
import { technicianApi } from '../../services/repairApi';
import { formatMoney } from '../../lib/requests';

const KEYS = ['category', 'city', 'minRating', 'available', 'sort'];

export function TechnicianDirectory() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const values = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const [city, setCity] = useState(values.city);
  useEffect(() => setCity(values.city), [values.city]);

  const { data, error, loading, reload } = useFetch((signal) => technicianApi.list({ ...values, page, limit: 12 }, signal), [JSON.stringify(values), page]);
  const change = (patch) => {
    const next = { ...values, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)));
  };
  const items = data?.items || [];
  const active = KEYS.some((k) => k !== 'sort' && values[k]);

  return (
    <PageShell wide title="Find a technician" intro="Every technician here has been verified by an administrator. Pick one yourself, or list your device and let us suggest the best match.">
      <form
        role="search"
        aria-label="Filter technicians"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          change({ city: city.trim() });
        }}
        className="glass grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-5"
      >
        <TextField as="select" label="Device type" value={values.category} onChange={(e) => change({ category: e.target.value })}>
          <option value="">Any device</option>
          {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
        </TextField>
        <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Bengaluru" maxLength={80} />
        <TextField as="select" label="Minimum rating" value={values.minRating} onChange={(e) => change({ minRating: e.target.value })}>
          <option value="">Any rating</option>
          <option value="3">3 stars and up</option>
          <option value="4">4 stars and up</option>
          <option value="4.5">4.5 stars and up</option>
        </TextField>
        <TextField as="select" label="Availability" value={values.available} onChange={(e) => change({ available: e.target.value })}>
          <option value="">Anyone</option>
          <option value="true">Taking jobs now</option>
        </TextField>
        <div className="flex items-end gap-2">
          <button type="submit" className="btn btn-primary">Search</button>
          {active && <button type="button" className="btn btn-glass" onClick={() => setParams({})}>Clear</button>}
        </div>
      </form>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load technicians" />
      ) : loading && !data ? (
        <div className="space-y-3" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full !rounded-3xl" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={Wrench} title={active ? 'No technicians match these filters' : 'No verified technicians yet'} action={<Link to="/register" className="btn btn-primary">Join as a technician</Link>}>
          {active ? 'Try a different city or device type.' : 'Technicians appear here once an administrator has verified them.'}
        </EmptyState>
      ) : (
        <ul className={`grid gap-3 ${loading ? 'opacity-60' : ''}`}>
          {items.map((t) => <li key={t._id}><TechnicianCard technician={t} /></li>)}
        </ul>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...Object.fromEntries(Object.entries(values).filter(([, v]) => v)), ...(n > 1 ? { page: String(n) } : {}) })} />}
    </PageShell>
  );
}

export function TechnicianProfile() {
  const { id } = useParams();
  const { isAuthenticated, user } = useAuth();
  const { data: t, error, loading, reload } = useFetch((signal) => technicianApi.get(id, signal), [id]);
  const canRequest = ['user', 'technician', 'refurbisher'].includes(user?.role) && user?._id !== id;

  if (loading && !t) return <div className="mx-auto max-w-3xl space-y-4 px-4 py-12" aria-busy><Skeleton className="h-10 w-1/2" /><Skeleton className="h-40 w-full" /></div>;
  if (error) {
    const missing = error.status === 404 || error.status === 422;
    return (
      <div className="px-4 py-16">
        <ErrorState error={missing ? { message: 'This technician is not available.' } : error} title={missing ? 'Technician not found' : 'Could not load this technician'} onRetry={missing ? undefined : reload} />
        <p className="mt-4 text-center"><Link to="/technicians" className="font-semibold text-primary underline dark:text-primary-tint">Back to technicians</Link></p>
      </div>
    );
  }

  const requestLink = `/dashboard/requests/new?technician=${t._id}`;
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link to="/technicians" className="mb-5 inline-flex items-center gap-1 text-sm font-medium text-primary dark:text-primary-tint"><ArrowLeft size={16} aria-hidden /> All technicians</Link>
      <GlassCard className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar person={t} size="h-16 w-16" />
          <div>
            <h1 className="text-2xl font-extrabold text-ink dark:text-white">{t.name}</h1>
            {t.headline && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">{t.headline}</p>}
            <div className="mt-1"><Rating avg={t.ratingAvg} count={t.ratingCount} /></div>
          </div>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-ink-muted dark:text-[#9FB2A7]">Jobs completed</dt><dd className="font-semibold text-ink dark:text-white">{t.completedJobs}</dd></div>
          <div><dt className="text-ink-muted dark:text-[#9FB2A7]">Experience</dt><dd className="font-semibold text-ink dark:text-white">{t.experienceYears ? `${t.experienceYears} years` : 'Not stated'}</dd></div>
          <div><dt className="text-ink-muted dark:text-[#9FB2A7]">Works around</dt><dd className="font-semibold text-ink dark:text-white">{[t.serviceAddressArea, t.city].filter(Boolean).join(', ') || 'Not stated'} (up to {t.serviceRadiusKm} km)</dd></div>
          <div><dt className="text-ink-muted dark:text-[#9FB2A7]">Starting rate</dt><dd className="font-semibold text-ink dark:text-white">{t.baseRate ? `${formatMoney(t.baseRate)} (estimate, final price is quoted per job)` : 'Quoted per job'}</dd></div>
        </dl>
        {t.categories?.length > 0 && <div><h2 className="text-sm font-bold text-ink dark:text-white">Devices handled</h2><div className="mt-1 flex flex-wrap gap-1.5">{t.categories.map((c) => <Badge key={c._id} tone="blue">{c.name || 'Device'}</Badge>)}</div></div>}
        {t.specializations?.length > 0 && <div><h2 className="text-sm font-bold text-ink dark:text-white">Specialities</h2><div className="mt-1 flex flex-wrap gap-1.5">{t.specializations.map((s) => <Badge key={s}>{s}</Badge>)}</div></div>}
        {t.qualifications?.length > 0 && <div><h2 className="text-sm font-bold text-ink dark:text-white">Qualifications</h2><ul className="mt-1 list-disc pl-5 text-sm text-ink dark:text-[#E8F1EB]">{t.qualifications.map((q, i) => <li key={i}>{[q.title, q.institution, q.year].filter(Boolean).join(', ')}</li>)}</ul></div>}
        <Reviews targetId={t._id} />
        <div>
          {canRequest ? (
            <Link to={requestLink} className="btn btn-primary">Request a repair</Link>
          ) : !isAuthenticated ? (
            <Link to="/login" state={{ from: requestLink }} className="btn btn-primary">Log in to request a repair</Link>
          ) : null}
          <p className="mt-2 text-xs text-ink-muted dark:text-[#9FB2A7]">Payment is agreed and made directly with the technician. The platform never handles your money.</p>
        </div>
      </GlassCard>
    </div>
  );
}

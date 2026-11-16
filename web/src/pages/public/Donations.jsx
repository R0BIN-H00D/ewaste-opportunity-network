import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Heart, Search, X } from 'lucide-react';
import PageShell from '../../components/layout/PageShell';
import DonationCard from '../../components/donations/DonationCard';
import { DeviceCardSkeleton } from '../../components/devices/DeviceCard';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import TextField from '../../components/ui/TextField';
import { useFetch } from '../../hooks/useFetch';
import { useCategories } from '../../hooks/useCategories';
import { useAuth } from '../../hooks/useAuth';
import { donationApi } from '../../services/donationApi';
import { CONDITIONS } from '../../lib/devices';

const KEYS = ['q', 'category', 'condition', 'city'];

/** Donation marketplace (FR-DON-002). Anyone can look; only verified organisations can request. */
export default function Donations() {
  const [params, setParams] = useSearchParams();
  const categories = useCategories();
  const { user } = useAuth();
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const filters = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const [draft, setDraft] = useState(filters);
  const key = JSON.stringify(filters);
  useEffect(() => setDraft(filters), [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data, error, loading, reload } = useFetch((signal) => donationApi.list({ ...filters, page, limit: 12 }, signal), [key, page]);
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
    <PageShell wide title="Donation marketplace" intro="Working and repairable devices offered free to verified schools, colleges and charities. Donors choose who receives each device.">
      <form role="search" aria-label="Search donations" noValidate onSubmit={(e) => { e.preventDefault(); apply(draft); }} className="glass grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
        <TextField label="Search" type="search" value={draft.q} onChange={set('q')} placeholder="Laptop, tablet, Dell…" maxLength={100} />
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
        {loading && !data ? 'Loading donations…' : data ? `${data.meta.total} ${data.meta.total === 1 ? 'donation' : 'donations'} available` : ''}
      </p>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load donations" />
      ) : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <DeviceCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={active ? 'No donations match your search' : 'No donations to request yet'}
          action={active ? <button type="button" className="btn btn-glass" onClick={() => setParams({})}>Clear filters</button> : <Link to={user ? '/dashboard/listings' : '/register'} className="btn btn-primary">{user ? 'Offer a device' : 'Create an account'}</Link>}
        >
          {active ? 'Try fewer filters or a different keyword.' : 'When someone offers a device for donation it appears here. Verified schools and organisations can then ask for it.'}
        </EmptyState>
      ) : (
        <>
          <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>{items.map((d) => <DonationCard key={d._id} donation={d} />)}</div>
          <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => { setParams({ ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)), ...(n > 1 ? { page: String(n) } : {}) }); window.scrollTo?.({ top: 0 }); }} />
        </>
      )}

      <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">
        Are you a school or charity?{' '}
        <Link to={user ? '/dashboard/recipient' : '/register'} className="font-semibold text-primary underline dark:text-primary-tint">Register your organisation</Link>
        {' '}so you can request devices once an administrator verifies it.
      </p>
    </PageShell>
  );
}

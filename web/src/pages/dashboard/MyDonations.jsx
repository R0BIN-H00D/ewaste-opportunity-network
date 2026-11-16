import { Link, useSearchParams } from 'react-router-dom';
import { Heart } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Badge from '../../components/ui/Badge';
import DonationCard from '../../components/donations/DonationCard';
import { DeviceCardSkeleton } from '../../components/devices/DeviceCard';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import Pagination from '../../components/ui/Pagination';
import { useFetch } from '../../hooks/useFetch';
import { useAuth } from '../../hooks/useAuth';
import { donationApi, recipientApi } from '../../services/donationApi';
import { VERIFICATION } from '../../lib/donations';

const TABS = [['donor', 'I am donating'], ['recipient', 'I asked for']];

/** Organisation status for general users: whether they may request donated devices yet. */
function RecipientBanner() {
  const { data } = useFetch((signal) => recipientApi.status(signal), []);
  if (!data) return null;
  const [label, tone] = VERIFICATION[data.status] || [data.status, 'neutral'];
  return (
    <GlassCard className="flex flex-wrap items-center justify-between gap-3 !p-4">
      <div>
        <p className="text-sm font-semibold text-ink dark:text-white">
          Recipient organisation {data.orgName ? `· ${data.orgName}` : ''} <Badge tone={tone}>{label}</Badge>
        </p>
        <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
          {data.status === 'approved' ? 'You can request donated devices.' : 'Schools, colleges and charities can request donated devices once an administrator verifies them.'}
        </p>
      </div>
      {data.status !== 'approved' && <Link to="/dashboard/recipient" className="btn btn-glass">{data.status === 'not_submitted' ? 'Register your organisation' : 'View details'}</Link>}
    </GlassCard>
  );
}

export default function MyDonations() {
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const as = params.get('as') === 'recipient' ? 'recipient' : 'donor';
  const page = Math.max(1, parseInt(params.get('page') || '1', 10) || 1);
  const { data, error, loading, reload } = useFetch((signal) => donationApi.list({ as, page, limit: 9 }, signal), [as, page]);
  const items = data?.items || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Donations</h1>
        <Link to="/donations" className="btn btn-glass">Browse the marketplace</Link>
      </div>
      {user?.role === 'user' && <RecipientBanner />}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Which donations">
        {TABS.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={as === value} onClick={() => setParams(value === 'donor' ? {} : { as: value })}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${as === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink-muted hover:text-ink dark:hover:text-white'}`}>
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={reload} title="Could not load your donations" />
      ) : loading && !data ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>{Array.from({ length: 3 }, (_, i) => <DeviceCardSkeleton key={i} />)}</div>
      ) : items.length === 0 ? (
        as === 'donor' ? (
          <EmptyState icon={Heart} title="You have not offered any donations yet" action={<Link to="/dashboard/listings" className="btn btn-primary">Go to my listings</Link>}>
            List a working or repairable device with the service set to Donation, then offer it from your listings.
          </EmptyState>
        ) : (
          <EmptyState icon={Heart} title="You have not asked for any devices yet" action={<Link to="/donations" className="btn btn-primary">See available donations</Link>}>
            Verified organisations can request devices from the donation marketplace.
          </EmptyState>
        )
      ) : (
        <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-3 ${loading ? 'opacity-60' : ''}`}>
          {items.map((d) => <DonationCard key={d._id} donation={d} to={`/dashboard/donations/${d._id}`} />)}
        </div>
      )}
      {data?.meta && <Pagination page={data.meta.page} pages={data.meta.pages} onChange={(n) => setParams({ ...(as === 'recipient' ? { as } : {}), ...(n > 1 ? { page: String(n) } : {}) })} />}
    </div>
  );
}

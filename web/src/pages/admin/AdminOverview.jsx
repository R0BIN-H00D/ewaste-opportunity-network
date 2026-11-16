import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import ErrorState from '../../components/ui/ErrorState';
import Skeleton from '../../components/ui/Skeleton';
import { useFetch } from '../../hooks/useFetch';
import { adminDashboardApi } from '../../services/adminApi';
import { actionLabel } from '../../lib/admin';
import { formatDate } from '../../lib/requests';

const TILE = 'glass-subtle block h-full !rounded-2xl p-4';

/** One number with a label. It is a link when there is a list behind it. */
function Tile({ label, value, hint, to }) {
  const body = (
    <>
      <p className="text-sm font-semibold text-ink dark:text-white">{label}</p>
      <p className="font-numeric text-3xl font-extrabold text-primary dark:text-primary-tint">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">{hint}</p>}
    </>
  );
  return to
    ? <Link to={to} className={`${TILE} transition hover:shadow-e1`}>{body}</Link>
    : <div className={TILE}>{body}</div>;
}

function Section({ title, children }) {
  const id = `sec-${title.toLowerCase().replace(/[^a-z]+/g, '-')}`;
  return (
    <section aria-labelledby={id} className="space-y-3">
      <h2 id={id} className="text-lg font-bold text-ink dark:text-white">{title}</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</ul>
    </section>
  );
}
const Item = (props) => <li><Tile {...props} /></li>;

const count = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const flowHint = (f) => `${f.open} open · ${f.completed} completed`;

/** The administrator's home: what needs a decision, then the size of the platform, then what admins did last. */
export default function AdminOverview() {
  const { data, error, loading, reload } = useFetch((signal) => adminDashboardApi.get(signal), []);

  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load the overview" />;
  if (!data) {
    return <div className="space-y-4" aria-busy>{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full !rounded-3xl" />)}</div>;
  }
  const { people, centres, listings, services, marketplace, attention, recentActivity } = data;
  const users = '/dashboard/admin/users';

  return (
    <div className="space-y-6">
      <GlassCard className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink dark:text-white">Platform overview</h1>
          <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">Updated {formatDate(data.generatedAt)}</p>
        </div>
        <button type="button" className="btn btn-glass" onClick={reload} disabled={loading}>
          <RefreshCw size={16} aria-hidden /> {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </GlassCard>

      <Section title="Needs attention">
        <Item label="Verifications waiting" value={attention.pendingVerifications.total} to="/dashboard/admin/verifications"
          hint={`${count(attention.pendingVerifications.providers, 'provider')} · ${count(attention.pendingVerifications.recipients, 'recipient organisation')}`} />
        <Item label="Open reports" value={attention.openReports} to="/dashboard/admin/reports" />
        <Item label="Open complaints" value={attention.openComplaints} to="/dashboard/admin/complaints" />
      </Section>

      <Section title="People">
        <Item label="Accounts" value={people.total} to={users} hint={`${people.newThisMonth} joined this month`} />
        <Item label="Active" value={people.active} to={`${users}?status=active`} />
        <Item label="Waiting for verification" value={people.waitingForVerification} to={`${users}?status=pending_verification`} />
        <Item label="Suspended" value={people.suspended} to={`${users}?status=suspended`} />
        <Item label="Members" value={people.byRole.user} to={`${users}?role=user`} />
        <Item label="Technicians" value={people.byRole.technician} to={`${users}?role=technician`} />
        <Item label="Students" value={people.byRole.student} to={`${users}?role=student`} />
        <Item label="Refurbishers" value={people.byRole.refurbisher} to={`${users}?role=refurbisher`} />
        <Item label="Recycling centres" value={people.byRole.recycler} to={`${users}?role=recycler`} hint={`${centres.authorised} authorised`} />
      </Section>

      <Section title="Activity">
        <Item label="Device listings" value={listings.total} hint={`${listings.listed} live · ${listings.inService} in service`} />
        <Item label="Repairs" value={services.repairs.total} to="/dashboard/admin/monitors/repairs" hint={flowHint(services.repairs)} />
        <Item label="Donations" value={services.donations.total} to="/dashboard/admin/monitors/donations" hint={flowHint(services.donations)} />
        <Item label="Refurbishment jobs" value={services.refurbishment.total} to="/dashboard/admin/monitors/refurbishment" hint={flowHint(services.refurbishment)} />
        <Item label="Recycling requests" value={services.recycling.total} to="/dashboard/admin/monitors/recycling" hint={flowHint(services.recycling)} />
        <Item label="Completed services" value={services.completed} hint="Repairs, donations, refurbishments and recycling" />
        <Item label="Marketplace" value={marketplace.activeProducts} hint={`products for sale · ${count(marketplace.orders, 'order')}`} />
      </Section>

      <section aria-labelledby="sec-latest" className="space-y-3">
        <h2 id="sec-latest" className="text-lg font-bold text-ink dark:text-white">Latest admin actions</h2>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">No administrator action has been recorded yet.</p>
        ) : (
          <ol className="space-y-2">
            {recentActivity.map((a) => (
              <li key={a._id} className="rounded-xl border border-white/30 bg-white/30 px-3 py-2 text-sm dark:bg-white/5">
                <p className="font-semibold text-ink dark:text-white">{actionLabel(a.action)}</p>
                <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(a.at)}{a.admin?.name ? ` · ${a.admin.name}` : ''}</p>
                {a.reason && <p className="mt-1 text-ink dark:text-[#E8F1EB]">{a.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

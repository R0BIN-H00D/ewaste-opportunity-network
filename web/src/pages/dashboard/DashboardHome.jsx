import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MailWarning } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import StatusBadge from '../../components/ui/StatusBadge';
import { useAuth } from '../../hooks/useAuth';
import { authApi } from '../../services/authApi';
import { deviceApi } from '../../services/deviceApi';
import { useFetch } from '../../hooks/useFetch';
import { toApiError } from '../../utils/errors';
import AdminOverview from '../admin/AdminOverview';

const LISTER_ROLES = ['user', 'technician', 'refurbisher'];

// What each role can do today. Provider tools for requests and quotations arrive with the service modules.
const ACTIONS = {
  user: [['List a device', '/list-device'], ['My listings', '/dashboard/listings'], ['Browse devices', '/browse'], ['Learn about safe handover', '/learn/protect-your-data']],
  technician: [['Complete your profile', '/dashboard/settings'], ['Post a student task', '/dashboard/learning-tasks/new'], ['Devices that need repair', '/browse?service=repair'], ['List a device', '/list-device'], ['My listings', '/dashboard/listings']],
  student: [['Find opportunities', '/opportunities'], ['My learning', '/dashboard/learning'], ['Complete your profile', '/dashboard/settings'], ['Learning centre', '/learn'], ['See how repairs work', '/how-it-works']],
  refurbisher: [['Devices for refurbishment', '/browse?service=refurbishment'], ['List a device', '/list-device'], ['Complete your profile', '/dashboard/settings']],
  recycler: [['Devices for recycling', '/browse?service=recycling'], ['Complete your profile', '/dashboard/settings'], ['Safe disposal guide', '/learn/safe-disposal']],
};

function QuickActions({ role }) {
  const items = ACTIONS[role] || [];
  return (
    <GlassCard>
      <h2 className="text-lg font-bold text-ink dark:text-white">Quick actions</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {items.map(([label, to]) => (
          <li key={to}>
            <Link to={to} className="glass-subtle flex min-h-[48px] items-center justify-between gap-2 px-4 text-sm font-semibold text-ink transition hover:shadow-e1 dark:text-white">
              {label} <ArrowRight size={16} aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}

function ListingCounts() {
  const { data } = useFetch((signal) => deviceApi.list({ mine: 'true', limit: 1 }, signal), []);
  const { data: live } = useFetch((signal) => deviceApi.list({ mine: 'true', status: 'listed', limit: 1 }, signal), []);
  if (!data) return null;
  return (
    <dl className="grid grid-cols-2 gap-3">
      {[['Your listings', data.meta.total], ['Live now', live?.meta.total ?? '–']].map(([label, value]) => (
        <GlassCard key={label} className="!p-4 text-center">
          <dd className="font-numeric text-3xl font-extrabold text-primary dark:text-primary-tint">{value}</dd>
          <dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">{label}</dt>
        </GlassCard>
      ))}
    </dl>
  );
}

function EmailBanner() {
  const [state, setState] = useState({ busy: false, message: '', variant: 'info' });
  const resend = async () => {
    setState({ busy: true, message: '', variant: 'info' });
    try {
      await authApi.resendVerification();
      setState({ busy: false, message: 'Verification email sent. Check your inbox.', variant: 'success' });
    } catch (err) {
      setState({ busy: false, message: toApiError(err).message, variant: 'error' });
    }
  };
  return (
    <GlassCard className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <MailWarning aria-hidden className="mt-0.5 shrink-0 text-warning" size={22} />
        <div>
          <p className="font-semibold text-ink dark:text-white">Verify your email address</p>
          <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">We sent you a link when you signed up. In development it is printed in the backend log.</p>
        </div>
      </div>
      <button type="button" className="btn btn-glass" onClick={resend} disabled={state.busy}>
        {state.busy ? 'Sending…' : 'Resend verification email'}
      </button>
      {state.message && <Alert variant={state.variant}>{state.message}</Alert>}
    </GlassCard>
  );
}

export default function DashboardHome() {
  const { user, isProvider, verification } = useAuth();
  if (!user) return null;
  if (user.role === 'admin') return <AdminOverview />;
  const vStatus = verification?.status || 'not_submitted';

  return (
    <div className="space-y-4">
      <GlassCard>
        <h1 className="text-2xl font-bold text-ink dark:text-white">Hello, {user.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">Here is what you can do today. Requests, quotations and impact tracking arrive with the next modules.</p>
      </GlassCard>

      {!user.emailVerified && <EmailBanner />}

      {LISTER_ROLES.includes(user.role) && <ListingCounts />}
      <QuickActions role={user.role} />

      {isProvider && (
        <GlassCard className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-semibold text-ink dark:text-white">Provider verification <StatusBadge status={vStatus} /></p>
            <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">
              {vStatus === 'approved' && 'You are verified and can use provider features.'}
              {vStatus === 'pending' && 'An administrator is reviewing your documents.'}
              {(vStatus === 'not_submitted' || vStatus === 'resubmission_required') && 'Upload your documents so an administrator can approve your account.'}
              {vStatus === 'rejected' && (verification?.reason ? `Rejected: ${verification.reason}. You can upload new documents.` : 'Your submission was rejected. You can upload new documents.')}
            </p>
          </div>
          {vStatus !== 'approved' && vStatus !== 'pending' && (
            <Link to="/dashboard/settings#verification" className="btn btn-primary">Submit documents</Link>
          )}
        </GlassCard>
      )}
    </div>
  );
}

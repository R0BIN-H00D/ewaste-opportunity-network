import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, MailWarning, ShieldCheck } from 'lucide-react';
import GlassCard from '../../components/glass/GlassCard';
import Alert from '../../components/ui/Alert';
import StatusBadge from '../../components/ui/StatusBadge';
import { useAuth } from '../../hooks/useAuth';
import EmailVerifyBanner from '../../components/auth/EmailVerifyBanner';
import { deviceApi } from '../../services/deviceApi';
import { requestApi } from '../../services/repairApi';
import { refurbApi } from '../../services/refurbishmentApi';
import { useFetch } from '../../hooks/useFetch';
import AdminOverview from '../admin/AdminOverview';

const LISTER_ROLES = ['user', 'technician', 'refurbisher'];

// The few things each person does most, in plain words. Everything else is in the menu under "More".
const ACTIONS = {
  user: [['List a device', '/list-device'], ['My devices', '/dashboard/listings'], ['My repairs', '/dashboard/requests'], ['Donate a device', '/donations']],
  technician: [['Find repair requests', '/dashboard/requests?tab=board'], ['My repair jobs', '/dashboard/requests?tab=jobs'], ['Messages', '/dashboard/messages'], ['Complete your profile', '/dashboard/settings']],
  refurbisher: [['Devices to refurbish', '/dashboard/opportunities'], ['Refurbishment jobs', '/dashboard/refurbishment'], ['My products', '/dashboard/products'], ['Orders', '/dashboard/orders']],
  recycler: [['Recycling requests', '/dashboard/recycling'], ['Recycling report', '/dashboard/recycling/report'], ['Pickups', '/dashboard/pickups'], ['Messages', '/dashboard/messages']],
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

/** The one thing to do next, as a single big card, so a new person never has to work out where to begin. */
function NextStep({ role }) {
  const mine = useFetch((signal) => (role === 'user' || role === 'refurbisher' ? deviceApi.list({ mine: 'true', limit: 1 }, signal) : Promise.resolve(null)), [role]);

  let card = null;
  if (role === 'user' && mine.data && mine.data.meta.total === 0) {
    card = {
      title: 'Start by listing your first device',
      steps: ['Add a photo and a few details', 'Choose what you want: repair, donate, recycle or sell', 'A matching technician, centre or recipient gets in touch'],
      to: '/list-device',
      cta: 'List a device',
    };
  } else if (role === 'user' && mine.data) {
    card = { title: 'Your devices', steps: ['See where each device stands', 'Answer quotations and messages when they arrive'], to: '/dashboard/listings', cta: 'See my devices' };
  } else if (role === 'refurbisher') {
    card = { title: 'Find devices to refurbish', steps: ['Browse devices owners want refurbished', 'Send an offer', 'Refurbish and list the product for sale'], to: '/dashboard/opportunities', cta: 'See devices' };
  } else if (role === 'recycler') {
    card = { title: 'Handle recycling requests', steps: ['Accept a request', 'Collect the devices', 'Record what was recovered'], to: '/dashboard/recycling', cta: 'See requests' };
  }
  if (!card) return null;
  return (
    <GlassCard as="section" aria-labelledby="next-h" className="space-y-3 border-2 !border-primary/40">
      <h2 id="next-h" className="text-xl font-bold text-ink dark:text-white">{card.title}</h2>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink dark:text-[#E8F1EB]">
        {card.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <Link to={card.to} className="btn btn-primary inline-flex">{card.cta} <ArrowRight size={16} aria-hidden /></Link>
    </GlassCard>
  );
}

/** Wanted-device requests this person accepted, and (for technicians) the repair jobs they are working on. */
function MyWork({ role }) {
  const accepted = useFetch((signal) => refurbApi.wanted({ as: 'accepted', limit: 5 }, signal), []);
  const jobs = useFetch((signal) => (role === 'technician' ? requestApi.list({ as: 'technician', active: 'true', limit: 1 }, signal) : Promise.resolve(null)), [role]);
  const items = accepted.data?.items || [];
  const jobCount = jobs.data?.meta?.total;
  if (!accepted.data && !jobs.data) return null;
  return (
    <GlassCard as="section" aria-labelledby="work-h" className="space-y-3">
      <h2 id="work-h" className="text-lg font-bold text-ink dark:text-white">Your work</h2>
      <dl className="grid grid-cols-2 gap-3">
        {role === 'technician' && (
          <Link to="/dashboard/requests?tab=jobs" className="glass-subtle !p-4 text-center">
            <dd className="font-numeric text-3xl font-extrabold text-primary dark:text-primary-tint">{jobCount ?? '–'}</dd>
            <dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">Active repair jobs</dt>
          </Link>
        )}
        <Link to="/dashboard/wanted" className="glass-subtle !p-4 text-center">
          <dd className="font-numeric text-3xl font-extrabold text-primary dark:text-primary-tint">{accepted.data?.meta?.total ?? '–'}</dd>
          <dt className="text-xs text-ink-muted dark:text-[#9FB2A7]">Wanted requests accepted</dt>
        </Link>
      </dl>
      {items.length > 0 && (
        <ul className="divide-y divide-black/5 dark:divide-white/10">
          {items.map((w) => (
            <li key={w._id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="text-ink dark:text-white">{w.title} <span className="text-xs text-ink-muted dark:text-[#9FB2A7]">for {w.refurbisher?.name}</span></span>
              <StatusBadge status={w.status} />
            </li>
          ))}
        </ul>
      )}
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

function VerificationCard({ vStatus, verification }) {
  return (
    <GlassCard className="flex flex-col gap-3 border-2 !border-warning/50 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <ShieldCheck aria-hidden className="mt-0.5 shrink-0 text-warning" size={22} />
        <div>
          <p className="font-semibold text-ink dark:text-white">Get verified to start <StatusBadge status={vStatus} /></p>
          <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">
            {vStatus === 'pending' && 'An administrator is reviewing your documents. You will be told as soon as you are approved.'}
            {(vStatus === 'not_submitted' || vStatus === 'resubmission_required') && 'Upload your documents so an administrator can approve your account. Until then you can look around but not take work.'}
            {vStatus === 'rejected' && (verification?.reason ? `Rejected: ${verification.reason}. You can upload new documents.` : 'Your submission was rejected. You can upload new documents.')}
          </p>
        </div>
      </div>
      {vStatus !== 'approved' && vStatus !== 'pending' && (
        <Link to="/dashboard/settings#verification" className="btn btn-primary">Submit documents</Link>
      )}
    </GlassCard>
  );
}

export default function DashboardHome() {
  const { user, isProvider, verification } = useAuth();
  if (!user) return null;
  if (user.role === 'admin') return <AdminOverview />;
  const vStatus = verification?.status || 'not_submitted';

  const needsVerification = isProvider && vStatus !== 'approved';
  // Refurbishers have no overview page; once verified they land straight on their requests.
  if (user.role === 'refurbisher' && !needsVerification) return <Navigate to="/dashboard/opportunities" replace />;
  const firstName = user.name.split(' ')[0];
  const subtitle = {
    user: 'List a device and we will help you repair it, donate it, recycle it or sell it.',
    technician: needsVerification ? 'Get verified first, then you can pick up repair requests.' : 'New repair requests from people near you appear under "Find repair requests".',
    refurbisher: needsVerification ? 'Get verified first, then you can make offers on devices.' : 'Find devices to refurbish and sell them as products.',
    recycler: needsVerification ? 'Get verified first, then you can take recycling requests.' : 'Accept recycling requests and record what you recover.',
  }[user.role];

  return (
    <div className="space-y-4">
      <GlassCard>
        <h1 className="text-2xl font-bold text-ink dark:text-white">Hello, {firstName}</h1>
        <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{subtitle}</p>
      </GlassCard>

      {!user.emailVerified && <EmailVerifyBanner email={user.email} />}
      {needsVerification && <VerificationCard vStatus={vStatus} verification={verification} />}

      <NextStep role={user.role} />

      {(user.role === 'technician' || user.role === 'user') && !needsVerification && <MyWork role={user.role} />}
      {LISTER_ROLES.includes(user.role) && <ListingCounts />}
      <QuickActions role={user.role} />
    </div>
  );
}

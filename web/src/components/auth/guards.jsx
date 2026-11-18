import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { homePathFor } from '../../store/authSlice';
import GlassCard from '../glass/GlassCard';
import PageLoader from '../ui/PageLoader';

/** Sends anonymous visitors to /login and brings them back afterwards. */
export function RequireAuth() {
  const { isChecking, isAuthenticated } = useAuth();
  const location = useLocation();
  if (isChecking) return <PageLoader label="Checking your session…" />;
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  return <Outlet />;
}

function Blocked({ title, children }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16">
      <GlassCard className="text-center">
        <ShieldAlert aria-hidden className="mx-auto text-warning" size={36} />
        <h1 className="mt-3 text-xl font-bold text-ink dark:text-white">{title}</h1>
        <div className="mt-2 text-sm text-ink-muted dark:text-[#9FB2A7]">{children}</div>
      </GlassCard>
    </div>
  );
}

/** Use inside RequireAuth. The server enforces roles too; this only keeps people out of screens that are not theirs. */
export function RequireRole({ roles }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) {
    return (
      <Blocked title="This area is not available for your account">
        <Link to="/dashboard" className="font-semibold text-secondary-strong underline dark:text-primary-tint">Back to your dashboard</Link>
      </Blocked>
    );
  }
  return <Outlet />;
}

/** Provider features (technician, refurbisher, recycler) need admin-approved verification (BR-01). */
export function RequireVerified() {
  const { isProvider, verification } = useAuth();
  if (isProvider && verification?.status !== 'approved') {
    return (
      <Blocked title="Verification required">
        <p>An administrator has to approve your documents before you can use this feature.</p>
        <Link to="/dashboard/settings#verification" className="mt-3 inline-block font-semibold text-secondary-strong underline dark:text-primary-tint">
          Go to verification
        </Link>
      </Blocked>
    );
  }
  return <Outlet />;
}

/** Login/register pages: signed-in people are redirected away. */
export function GuestOnly() {
  const { isChecking, isAuthenticated, user } = useAuth();
  const justRegistered = useSelector((s) => s.auth.justRegistered);
  const location = useLocation();
  if (isChecking) return <PageLoader />;
  if (isAuthenticated) return <Navigate to={justRegistered ? homePathFor(user.role, true) : location.state?.from || homePathFor(user.role)} replace />;
  return <Outlet />;
}

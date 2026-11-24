import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useUnreadCounts } from '../../hooks/useRealtime';
import { refreshCounts } from '../../services/unread';
import { isLockedProvider } from '../../store/authSlice';

/** The bell beside the theme button: opens the notifications and shows how many are unread. Only for signed-in people. */
export default function NotificationBell() {
  const { isAuthenticated, user } = useAuth();
  const locked = isLockedProvider(user, useSelector((state) => state.auth.verification)); // their notifications open once they are verified
  const { notifications } = useUnreadCounts();

  // Pages outside the dashboard have no live connection, so ask once for the number when the bell appears.
  useEffect(() => {
    if (isAuthenticated) refreshCounts();
  }, [isAuthenticated]);

  if (!isAuthenticated || locked) return null;
  return (
    <Link to="/dashboard/notifications" className="btn btn-glass relative !px-3" aria-label={notifications > 0 ? `Open notifications, ${notifications} unread` : 'Open notifications'}>
      <Bell size={20} aria-hidden />
      {notifications > 0 && (
        <span aria-hidden className="absolute -right-1 -top-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-danger px-1 text-[11px] font-bold text-white ring-2 ring-white dark:ring-[#1B2A22]">
          {notifications > 99 ? '99+' : notifications}
        </span>
      )}
    </Link>
  );
}

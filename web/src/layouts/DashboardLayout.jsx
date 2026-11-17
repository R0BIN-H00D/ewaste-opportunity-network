import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Activity, Award, BarChart3, Bell, BookOpen, Flag, Megaphone, MessageSquareWarning, ScrollText, Shapes, Star, ShieldCheck, Users, CalendarClock, Boxes, Factory, GraduationCap, Heart, LayoutDashboard, Leaf, LogOut, MessageCircle, PackageSearch, Recycle, ReceiptText, Settings, ShoppingBag, Store, Wrench } from 'lucide-react';
import ThemeToggle from '../components/layout/ThemeToggle';
import AnnouncementBanner from '../components/layout/AnnouncementBanner';
import { logoutUser } from '../store/authSlice';
import { useAuth } from '../hooks/useAuth';
import { useLiveSession, useUnreadCounts } from '../hooks/useRealtime';

const link = ({ isActive }) =>
  `flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-xl px-3 text-sm font-medium transition ${
    isActive ? 'bg-primary/10 text-primary dark:text-primary-tint' : 'text-ink-muted hover:text-ink dark:text-[#9FB2A7] dark:hover:text-white'
  }`;

/** A small count beside a menu item; nothing when there is nothing waiting. */
function Badge({ count, label }) {
  if (!count) return null;
  return (
    <span className="ml-auto rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white dark:bg-primary-tint dark:text-canvas-dark" aria-label={`${count} ${label}`}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

// Glass sidebar + topbar shell. Role-specific navigation is added with each role's dashboard (Phase 4-5).
export default function DashboardLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const navRef = useRef(null);
  // The live connection and the unread badges live as long as the dashboard is open.
  useLiveSession(user?._id);
  const counts = useUnreadCounts();

  // On a phone the menu is one scrolling row; keep the current page's link in view after every navigation.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  const logout = async () => {
    await dispatch(logoutUser());
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4 md:flex-row" style={{ background: 'var(--grad-hero)' }}>
      <aside className="glass-strong flex shrink-0 flex-col p-4 print:hidden md:w-64" aria-label="Dashboard navigation">
        <p className="font-display font-bold text-primary dark:text-primary-tint">E-Waste Network</p>
        {user && <p className="mt-1 truncate text-xs text-ink-muted dark:text-[#9FB2A7]">{user.name} · {user.role}</p>}
        <nav ref={navRef} className="mt-4 flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
          <NavLink to="/dashboard" end className={link}><LayoutDashboard size={18} aria-hidden /> Overview</NavLink>
          {user?.role === 'admin' && (
            <>
              <NavLink to="/dashboard/admin/verifications" className={link}><ShieldCheck size={18} aria-hidden /> Verifications</NavLink>
              <NavLink to="/dashboard/admin/users" className={link}><Users size={18} aria-hidden /> Users</NavLink>
              <NavLink to="/dashboard/admin/monitors" className={link}><Activity size={18} aria-hidden /> Monitors</NavLink>
              <NavLink to="/dashboard/admin/listings" className={link}><Boxes size={18} aria-hidden /> Listings</NavLink>
              <NavLink to="/dashboard/admin/reviews" className={link}><Star size={18} aria-hidden /> Reviews</NavLink>
              <NavLink to="/dashboard/admin/reports" className={link}><Flag size={18} aria-hidden /> Reports</NavLink>
              <NavLink to="/dashboard/admin/categories" className={link}><Shapes size={18} aria-hidden /> Categories</NavLink>
              <NavLink to="/dashboard/admin/complaints" className={link}><MessageSquareWarning size={18} aria-hidden /> Complaints</NavLink>
              <NavLink to="/dashboard/admin/announcements" className={link}><Megaphone size={18} aria-hidden /> Announcements</NavLink>
              <NavLink to="/dashboard/admin/education" className={link}><BookOpen size={18} aria-hidden /> Learning centre</NavLink>
              <NavLink to="/dashboard/admin/audit" className={link}><ScrollText size={18} aria-hidden /> Audit log</NavLink>
              <NavLink to="/dashboard/admin/analytics" className={link}><BarChart3 size={18} aria-hidden /> Analytics</NavLink>
              <NavLink to="/dashboard/admin/certificates" className={link}><Award size={18} aria-hidden /> Certificates</NavLink>
            </>
          )}
          {['user', 'technician', 'refurbisher'].includes(user?.role) && (
            <NavLink to="/dashboard/listings" className={link}><Boxes size={18} aria-hidden /> My listings</NavLink>
          )}
          {['user', 'technician', 'refurbisher'].includes(user?.role) && (
            <NavLink to="/dashboard/requests" className={link}><Wrench size={18} aria-hidden /> {user.role === 'technician' ? 'Repair jobs' : 'Repair requests'}</NavLink>
          )}
          {['user', 'technician', 'refurbisher'].includes(user?.role) && (
            <NavLink to="/dashboard/donations" className={link}><Heart size={18} aria-hidden /> Donations</NavLink>
          )}
          {user?.role === 'refurbisher' && (
            <NavLink to="/dashboard/opportunities" className={link}><PackageSearch size={18} aria-hidden /> Devices to refurbish</NavLink>
          )}
          {['user', 'technician', 'refurbisher'].includes(user?.role) && (
            <NavLink to="/dashboard/refurbishment" className={link}><Recycle size={18} aria-hidden /> Refurbishment</NavLink>
          )}
          {user?.role === 'refurbisher' && (
            <NavLink to="/dashboard/products" className={link}><Store size={18} aria-hidden /> My products</NavLink>
          )}
          {['user', 'technician', 'refurbisher'].includes(user?.role) && (
            <NavLink to="/dashboard/orders" className={link}><ShoppingBag size={18} aria-hidden /> Orders</NavLink>
          )}
          {user?.role && user.role !== 'admin' && (
            <NavLink to="/dashboard/recycling" end className={link}><Factory size={18} aria-hidden /> {user.role === 'recycler' ? 'Recycling requests' : 'Recycling'}</NavLink>
          )}
          {user?.role === 'recycler' && (
            <NavLink to="/dashboard/recycling/report" className={link}><BarChart3 size={18} aria-hidden /> Recycling report</NavLink>
          )}
          {user?.role === 'student' && (
            <NavLink to="/dashboard/learning" className={link}><GraduationCap size={18} aria-hidden /> My learning</NavLink>
          )}
          {user?.role === 'technician' && (
            <NavLink to="/dashboard/learning-tasks" className={link}><GraduationCap size={18} aria-hidden /> Student tasks</NavLink>
          )}
          {user?.role && user.role !== 'admin' && (
            <NavLink to="/dashboard/pickups" className={link}><CalendarClock size={18} aria-hidden /> Pickups</NavLink>
          )}
          {user?.role && user.role !== 'admin' && (
            <NavLink to="/dashboard/complaints" className={link}><MessageSquareWarning size={18} aria-hidden /> Complaints</NavLink>
          )}
          {user?.role && user.role !== 'admin' && (
            <NavLink to="/dashboard/impact" className={link}><Leaf size={18} aria-hidden /> Green Score</NavLink>
          )}
          {user?.role && user.role !== 'admin' && (
            <NavLink to="/dashboard/messages" className={link}><MessageCircle size={18} aria-hidden /> Messages <Badge count={counts.messages} label="unread messages" /></NavLink>
          )}
          <NavLink to="/dashboard/notifications" className={link}><Bell size={18} aria-hidden /> Notifications <Badge count={counts.notifications} label="unread notifications" /></NavLink>
          <NavLink to="/dashboard/transactions" className={link}><ReceiptText size={18} aria-hidden /> Transactions</NavLink>
          <NavLink to="/dashboard/settings" className={link}><Settings size={18} aria-hidden /> Settings</NavLink>
        </nav>
        <button type="button" onClick={logout} className="btn btn-glass mt-4 md:mt-auto">
          <LogOut size={18} aria-hidden /> Log out
        </button>
      </aside>
      <div className="flex-1">
        <div className="mb-4 flex justify-end print:hidden"><ThemeToggle /></div>
        <AnnouncementBanner />
        <main id="main" className="mt-2"><Outlet /></main>
      </div>
    </div>
  );
}

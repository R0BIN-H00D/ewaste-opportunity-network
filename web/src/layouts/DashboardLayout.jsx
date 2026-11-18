import { useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { Activity, BarChart3, Bell, BookOpen, ClipboardList, Flag, Megaphone, MessageSquareWarning, ScrollText, Shapes, Star, ShieldCheck, Users, CalendarClock, Boxes, Factory, Heart, LayoutDashboard, Leaf, LogOut, MessageCircle, PackageSearch, Recycle, ReceiptText, Search, Settings, ShoppingBag, Store, UserRound, Wrench } from 'lucide-react';
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


// The menu is short and different for each role: what that person does every day comes first; the rest is under "More".
// `tab` lets two items that share one page ("Find repair requests" and "My repair jobs") light up one at a time.
const ITEMS = {
  overview: { to: '/dashboard', end: true, icon: LayoutDashboard, label: 'Overview' },
  devices: { to: '/dashboard/listings', icon: Boxes, label: 'My devices' },
  repairs: { to: '/dashboard/requests', icon: Wrench, label: 'My repairs' },
  openRequests: { to: '/dashboard/requests?tab=board', tab: 'board', icon: Search, label: 'Find repair requests' },
  jobs: { to: '/dashboard/requests?tab=jobs', tab: 'jobs', icon: ClipboardList, label: 'My repair jobs' },
  donations: { to: '/dashboard/donations', icon: Heart, label: 'Donations' },
  recycling: { to: '/dashboard/recycling', end: true, icon: Factory, label: 'Recycling' },
  recyclingRequests: { to: '/dashboard/recycling', end: true, icon: Factory, label: 'Recycling requests' },
  recyclingReport: { to: '/dashboard/recycling/report', icon: BarChart3, label: 'Recycling report' },
  refurbish: { to: '/dashboard/opportunities', icon: PackageSearch, label: 'Devices to refurbish' },
  marketplace: { to: '/dashboard/marketplace', icon: Store, label: 'Marketplace' },
  wanted: { to: '/dashboard/wanted', icon: Search, label: 'Wanted devices' },
  refurbRequests: { to: '/dashboard/opportunities', icon: PackageSearch, label: 'Requests' },
  refurbJobs: { to: '/dashboard/refurbishment', icon: Recycle, label: 'Refurbishment jobs' },
  refurbOffers: { to: '/dashboard/refurbishment', icon: Recycle, label: 'Refurbishment offers' },
  products: { to: '/dashboard/products', icon: Store, label: 'Refurbished products' },
  orders: { to: '/dashboard/orders', icon: ShoppingBag, label: 'Orders' },
  pickups: { to: '/dashboard/pickups', icon: CalendarClock, label: 'Pickups' },
  complaints: { to: '/dashboard/complaints', icon: MessageSquareWarning, label: 'Report a problem' },
  impact: { to: '/dashboard/impact', icon: Leaf, label: 'My impact' },
  messages: { to: '/dashboard/messages', icon: MessageCircle, label: 'Messages', badge: 'messages', badgeLabel: 'unread messages' },
  notifications: { to: '/dashboard/notifications', icon: Bell, label: 'Notifications', badge: 'notifications', badgeLabel: 'unread notifications' },
  transactions: { to: '/dashboard/transactions', icon: ReceiptText, label: 'Transactions' },
  profile: { to: '/dashboard/settings', icon: UserRound, label: 'Profile' },
};
const MENU = {
  user: { main: ['profile', 'devices', 'repairs', 'marketplace', 'orders', 'wanted', 'messages', 'notifications', 'pickups', 'transactions', 'complaints'], more: [] },
  technician: { main: ['profile', 'overview', 'openRequests', 'jobs', 'messages', 'notifications'], more: ['wanted', 'devices', 'pickups', 'transactions', 'complaints'] },
  refurbisher: { main: ['profile', 'refurbRequests', 'pickups', 'products', 'orders', 'messages', 'notifications', 'transactions'], more: [] },
  recycler: { main: ['profile', 'overview', 'recyclingRequests', 'recyclingReport', 'pickups', 'messages', 'notifications'], more: ['transactions', 'complaints'] },
};

function MenuItem({ item, counts, search }) {
  const Icon = item.icon;
  const tabNow = new URLSearchParams(search).get('tab') || '';
  const className = (state) => link({ isActive: item.tab === undefined ? state.isActive : state.isActive && tabNow === item.tab });
  return (
    <NavLink to={item.to} end={item.end} className={className}>
      <Icon size={18} aria-hidden /> {item.label} {item.badge && <Badge count={counts[item.badge]} label={item.badgeLabel} />}
    </NavLink>
  );
}

function RoleMenu({ role, counts, search }) {
  const menu = MENU[role];
  if (!menu) return null;
  const render = (keys) => keys.map((k) => <MenuItem key={k} item={ITEMS[k]} counts={counts} search={search} />);
  return (
    <>
      {render(menu.main)}
      {menu.more.length > 0 && (
        <>
          <p className="hidden px-3 pt-3 text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7] md:block">More</p>
          {render(menu.more)}
        </>
      )}
    </>
  );
}

// Glass sidebar + topbar shell. Role-specific navigation is added with each role's dashboard (Phase 4-5).
export default function DashboardLayout() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
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
          {user?.role === 'admin' && <NavLink to="/dashboard" end className={link}><LayoutDashboard size={18} aria-hidden /> Overview</NavLink>}
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
            </>
          )}
          {user?.role !== 'admin' && <RoleMenu role={user?.role} counts={counts} search={search} />}
          {user?.role === 'admin' && (
            <>
              <NavLink to="/dashboard/notifications" className={link}><Bell size={18} aria-hidden /> Notifications <Badge count={counts.notifications} label="unread notifications" /></NavLink>
              <NavLink to="/dashboard/transactions" className={link}><ReceiptText size={18} aria-hidden /> Transactions</NavLink>
              <NavLink to="/dashboard/settings" className={link}><Settings size={18} aria-hidden /> Settings</NavLink>
            </>
          )}
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

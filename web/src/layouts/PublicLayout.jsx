import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, Recycle, X } from 'lucide-react';
import ThemeToggle from '../components/layout/ThemeToggle';
import DevApiBanner from '../components/layout/DevApiBanner';
import AnnouncementBanner from '../components/layout/AnnouncementBanner';
import Footer from '../components/layout/Footer';
import { useAuth } from '../hooks/useAuth';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/how-it-works', label: 'How It Works' },
  { to: '/browse', label: 'Browse Devices' },
  { to: '/services', label: 'Find Services' },
  { to: '/marketplace', label: 'Marketplace' },
  { to: '/impact', label: 'Environmental Impact' },
];

const desktopLink = ({ isActive }) =>
  `whitespace-nowrap rounded-lg px-2.5 py-2 text-sm xl:px-3 font-medium transition ${isActive ? 'bg-primary/10 text-primary dark:text-primary-tint' : 'text-ink-muted hover:text-ink dark:hover:text-white'}`;
const mobileLink = ({ isActive }) =>
  `flex min-h-[48px] items-center rounded-xl px-4 text-base font-medium ${isActive ? 'bg-primary/10 text-primary dark:text-primary-tint' : 'text-ink dark:text-white'}`;

export default function PublicLayout() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close the menu after navigating, and on Escape.
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--grad-hero)' }}>
      <a href="#main" className="sr-only z-50 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-ink focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      <header className="sticky top-4 z-40 mx-auto mt-4 max-w-7xl px-4">
        <nav aria-label="Primary" className="glass-strong flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
          <Link to="/" className="flex shrink-0 items-center gap-2 whitespace-nowrap font-display text-base font-extrabold text-primary dark:text-primary-tint sm:text-lg">
            <Recycle aria-hidden size={24} /> E-Waste<span className="hidden sm:inline">&nbsp;Network</span>
          </Link>
          <ul className="hidden items-center gap-1 xl:flex">
            {links.map((l) => (
              <li key={l.to}><NavLink to={l.to} end={l.end} className={desktopLink}>{l.label}</NavLink></li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary !px-4">Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-glass hidden sm:inline-flex">Login</Link>
                <Link to="/register" className="btn btn-primary hidden sm:inline-flex">Get Started</Link>
              </>
            )}
            <button
              type="button"
              className="btn btn-glass !px-3 xl:hidden"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
              onClick={() => setMenuOpen((o) => !o)}
            >
              {menuOpen ? <X size={20} aria-hidden /> : <Menu size={20} aria-hidden />}
            </button>
          </div>
        </nav>
        {menuOpen && (
          <div id="mobile-menu" className="glass-strong mt-2 space-y-1 p-3 xl:hidden">
            {links.map((l) => <NavLink key={l.to} to={l.to} end={l.end} className={mobileLink}>{l.label}</NavLink>)}
            {!isAuthenticated && (
              <div className="grid grid-cols-2 gap-2 pt-2">
                <Link to="/login" className="btn btn-glass">Login</Link>
                <Link to="/register" className="btn btn-primary">Get Started</Link>
              </div>
            )}
          </div>
        )}
      </header>
      <div className="mx-auto mt-4 max-w-7xl px-4 empty:hidden"><AnnouncementBanner /></div>
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <DevApiBanner />
    </div>
  );
}

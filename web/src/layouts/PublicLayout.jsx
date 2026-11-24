import TopNav from '../components/layout/TopNav';
import DevApiBanner from '../components/layout/DevApiBanner';
import AnnouncementBanner from '../components/layout/AnnouncementBanner';
import Footer from '../components/layout/Footer';
import { Outlet } from 'react-router-dom';

export default function PublicLayout() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--grad-hero)' }}>
      <TopNav />
      <div className="mx-auto mt-4 max-w-7xl px-4 empty:hidden"><AnnouncementBanner /></div>
      <main id="main">
        <Outlet />
      </main>
      <Footer />
      <DevApiBanner />
    </div>
  );
}

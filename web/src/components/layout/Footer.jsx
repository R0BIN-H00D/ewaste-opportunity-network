import { Link } from 'react-router-dom';
import { Recycle } from 'lucide-react';

const COLUMNS = [
  { title: 'Platform', links: [['Browse devices', '/browse'], ['List a device', '/list-device'], ['Find services', '/services'], ['Marketplace', '/marketplace'], ['Student opportunities', '/opportunities']] },
  { title: 'Learn', links: [['How it works', '/how-it-works'], ['Learning centre', '/learn'], ['Environmental impact', '/impact']] },
  { title: 'Company', links: [['About us', '/about'], ['Contact & support', '/contact'], ['Privacy policy', '/privacy'], ['Terms & conditions', '/terms']] },
];

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-black/5 dark:border-white/10" aria-label="Site footer">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="flex items-center gap-2 font-display text-lg font-extrabold text-primary dark:text-primary-tint"><Recycle size={22} aria-hidden /> E-Waste Network</p>
          <p className="mt-2 text-sm text-ink-muted dark:text-[#9FB2A7]">Turning electronic waste into opportunity through repair, reuse, donation and responsible recycling.</p>
        </div>
        {COLUMNS.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="text-sm font-bold text-ink dark:text-white">{c.title}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map(([label, to]) => (
                <li key={to}><Link to={to} className="text-ink-muted hover:text-ink hover:underline dark:text-[#9FB2A7] dark:hover:text-white">{label}</Link></li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <p className="border-t border-black/5 px-4 py-4 text-center text-xs text-ink-muted dark:border-white/10 dark:text-[#9FB2A7]">© {new Date().getFullYear()} E-Waste-to-Opportunity Network</p>
    </footer>
  );
}

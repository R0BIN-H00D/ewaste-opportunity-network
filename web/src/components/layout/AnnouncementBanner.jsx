import { useEffect, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { announcementApi } from '../../services/announcementApi';
import { useAuth } from '../../hooks/useAuth';

const KEY = 'dismissedAnnouncements';

// Dismissing is a small per-visit convenience, so storage is optional: if it is blocked the banner simply shows again next visit.
const readDismissed = () => {
  try {
    const value = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
};
const saveDismissed = (ids) => {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(ids));
  } catch {
    /* storage is blocked; nothing to do */
  }
};

/** Messages from the administrators. Shown to everyone; a signed-in person also sees the ones meant for their role. */
export default function AnnouncementBanner() {
  const { user } = useAuth();
  const role = user?.role || '';
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(readDismissed);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const list = await announcementApi.list();
        if (live) setItems(Array.isArray(list) ? list : []);
      } catch {
        if (live) setItems([]); // a banner that cannot load is simply not shown
      }
    })();
    return () => { live = false; };
  }, [role]);

  const dismiss = (id) => {
    const next = [...dismissed, id];
    setDismissed(next);
    saveDismissed(next);
  };

  const shown = items.filter((a) => !dismissed.includes(a._id));
  if (!shown.length) return null;
  return (
    <section aria-label="Announcements" className="space-y-2 print:hidden">
      {shown.map((a) => (
        <div key={a._id} role="status" className="glass flex items-start gap-3 rounded-2xl px-4 py-3">
          <Megaphone size={18} className="mt-0.5 shrink-0 text-primary dark:text-primary-tint" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-bold text-ink dark:text-white">{a.title}</p>
            <p className="whitespace-pre-line text-ink dark:text-[#E8F1EB]">{a.body}</p>
          </div>
          <button type="button" onClick={() => dismiss(a._id)} aria-label={`Dismiss announcement: ${a.title}`} className="flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg text-ink-muted hover:text-ink dark:text-[#9FB2A7] dark:hover:text-white">
            <X size={16} aria-hidden />
          </button>
        </div>
      ))}
    </section>
  );
}

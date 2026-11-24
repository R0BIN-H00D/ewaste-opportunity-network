import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, CalendarClock, CheckCheck, ChevronRight, CreditCard, Factory, Heart, MessageCircle, PackageSearch, Recycle, ShieldCheck, ShoppingBag, Star, Wrench } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import PageLoader from '../../components/ui/PageLoader';
import { notificationApi } from '../../services/chatApi';
import { refreshCounts, setCounts } from '../../services/unread';
import { useRealtimeEvent, useRealtimeReconnect } from '../../hooks/useRealtime';
import { toApiError } from '../../utils/errors';

// A relative time reads faster than a date: "5 min ago", "Yesterday", then the date.
function ago(value) {
  if (!value) return '';
  const then = new Date(value);
  const minutes = Math.floor((Date.now() - then.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// The icon and colour that say what a notification is about, from the start of its type ("order.placed" is an order).
const KINDS = [
  [/^(order|refurb_purchase|product)/, ShoppingBag, 'bg-primary/10 text-primary dark:text-primary-tint'],
  [/^(quotation|service|repair|request)/, Wrench, 'bg-sky-500/10 text-sky-700 dark:text-sky-300'],
  [/^(payment|transaction)/, CreditCard, 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'],
  [/^(marketplace|message|chat)/, MessageCircle, 'bg-violet-500/10 text-violet-700 dark:text-violet-300'],
  [/^(donation)/, Heart, 'bg-rose-500/10 text-rose-700 dark:text-rose-300'],
  [/^(recycling)/, Factory, 'bg-amber-500/10 text-amber-700 dark:text-amber-300'],
  [/^(refurbishment|handover)/, Recycle, 'bg-teal-500/10 text-teal-700 dark:text-teal-300'],
  [/^(pickup)/, CalendarClock, 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300'],
  [/^(wanted)/, PackageSearch, 'bg-primary/10 text-primary dark:text-primary-tint'],
  [/^(review)/, Star, 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300'],
  [/^(account|verification|listing|complaint|report)/, ShieldCheck, 'bg-orange-500/10 text-orange-700 dark:text-orange-300'],
];
const kindOf = (type = '') => KINDS.find(([re]) => re.test(type)) || [null, /(suspend|removed|rejected|cancel)/.test(type) ? AlertTriangle : Bell, 'bg-black/5 text-ink-muted dark:bg-white/10 dark:text-[#9FB2A7]'];

/** The links the server puts on notifications are in-app paths; anything else (or nothing) just marks it read. */
const target = (n) => {
  const link = n.data?.deepLink;
  return typeof link === 'string' && link.startsWith('/') ? link : null;
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [state, setState] = useState({ items: [], loading: true, error: null, page: 1, pages: 1, unread: 0, loadingMore: false });
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('all');

  const load = useCallback(async (signal) => {
    setState((s) => ({ ...s, loading: s.items.length === 0, error: null }));
    try {
      const { items, meta } = await notificationApi.list({ page: 1, limit: 20 }, signal);
      setState({ items, loading: false, error: null, page: meta.page, pages: meta.pages, unread: meta.unread ?? 0, loadingMore: false });
    } catch (err) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      setState((s) => ({ ...s, loading: false, error: toApiError(err) }));
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useRealtimeReconnect(() => load());

  // A notification the server has just created appears at the top, with the new unread total.
  useRealtimeEvent('notification:new', ({ notification, unread }) => {
    if (!notification?._id) return;
    setState((s) => (s.items.some((n) => n._id === notification._id) ? s : { ...s, items: [notification, ...s.items], unread: typeof unread === 'number' ? unread : s.unread + 1 }));
  });

  const loadMore = async () => {
    setState((s) => ({ ...s, loadingMore: true }));
    try {
      const { items, meta } = await notificationApi.list({ page: state.page + 1, limit: 20 });
      setState((s) => ({ ...s, items: [...s.items, ...items.filter((n) => !s.items.some((x) => x._id === n._id))], page: meta.page, pages: meta.pages, loadingMore: false }));
    } catch (err) {
      setState((s) => ({ ...s, loadingMore: false, error: toApiError(err) }));
    }
  };

  const open = async (n) => {
    if (!n.readAt) {
      setState((s) => ({ ...s, items: s.items.map((x) => (x._id === n._id ? { ...x, readAt: new Date().toISOString() } : x)), unread: Math.max(0, s.unread - 1) }));
      try {
        await notificationApi.markRead(n._id);
      } finally {
        refreshCounts();
      }
    }
    const to = target(n);
    if (to) navigate(to);
  };

  const readAll = async () => {
    setBusy(true);
    try {
      await notificationApi.markAllRead();
      setState((s) => ({ ...s, items: s.items.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })), unread: 0 }));
      setCounts({ notifications: 0 });
    } catch (err) {
      setState((s) => ({ ...s, error: toApiError(err) }));
    } finally {
      setBusy(false);
    }
  };

  if (state.loading) return <PageLoader label="Loading notifications" />;
  if (state.error && state.items.length === 0) return <ErrorState error={state.error} onRetry={() => load()} />;

  const shown = tab === 'unread' ? state.items.filter((n) => !n.readAt) : state.items;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section aria-label="Notifications summary" className="glass-strong flex flex-wrap items-center justify-between gap-4 rounded-3xl p-6 sm:p-8">
        <div className="flex items-center gap-4">
          <span aria-hidden className="relative grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark">
            <Bell size={26} />
            {state.unread > 0 && <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-danger ring-2 ring-white dark:ring-[#1B2A22]" />}
          </span>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-ink dark:text-white">Notifications</h1>
            <p className="mt-0.5 text-ink-muted dark:text-[#9FB2A7]">{state.unread > 0 ? `You have ${state.unread} unread ${state.unread === 1 ? 'update' : 'updates'}.` : 'You are all caught up.'}</p>
          </div>
        </div>
        {state.unread > 0 && (
          <button type="button" className="btn btn-primary" onClick={readAll} disabled={busy}>
            <CheckCheck size={16} aria-hidden /> Mark all as read
          </button>
        )}
      </section>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error.message}</p>}

      {state.items.length === 0 ? (
        <EmptyState icon={Bell} art="inbox" title="You are all caught up">Updates about your listings, requests and verification will appear here.</EmptyState>
      ) : (
        <>
          <div className="flex gap-2" role="group" aria-label="Show">
            {[['all', 'All'], ['unread', 'Unread']].map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={tab === value}
                onClick={() => setTab(value)}
                className={`rounded-full px-5 py-2 text-sm font-semibold transition ${tab === value ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'glass-subtle text-ink hover:-translate-y-0.5 dark:text-white'}`}
              >
                {label}{value === 'unread' && state.unread > 0 ? ` (${state.unread})` : ''}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="glass rounded-3xl px-6 py-12 text-center text-ink-muted dark:text-[#9FB2A7]">No unread notifications.</p>
          ) : (
            <ul className="glass divide-y divide-black/5 overflow-hidden rounded-3xl dark:divide-white/10" aria-label="Notifications">
              {shown.map((n) => {
                const [, kindIcon, tone] = kindOf(n.type);
                const Icon = kindIcon;
                const link = Boolean(target(n));
                return (
                  <li key={n._id}>
                    <button type="button" onClick={() => open(n)} className={`group flex min-h-[44px] w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-black/[0.03] dark:hover:bg-white/5 sm:px-6 ${n.readAt ? '' : 'bg-primary/[0.06]'}`}>
                      <span aria-hidden className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tone}`}><Icon size={20} /></span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-ink dark:text-white ${n.readAt ? 'font-medium' : 'font-bold'}`}>
                          {n.title}
                          {!n.readAt && <span className="sr-only"> (unread)</span>}
                        </span>
                        {n.body && <span className="mt-0.5 block text-sm leading-relaxed text-ink-muted dark:text-[#9FB2A7]">{n.body}</span>}
                        <span className="mt-1.5 block text-xs font-medium text-ink-muted dark:text-[#9FB2A7]">{ago(n.createdAt)}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 self-center">
                        {!n.readAt && <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-primary dark:bg-primary-tint" />}
                        {link && <ChevronRight size={18} aria-hidden className="text-ink-muted transition group-hover:translate-x-0.5" />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {state.page < state.pages && (
        <div className="text-center">
          <button type="button" className="btn btn-glass" onClick={loadMore} disabled={state.loadingMore}>{state.loadingMore ? 'Loading...' : 'Show more'}</button>
        </div>
      )}
    </div>
  );
}

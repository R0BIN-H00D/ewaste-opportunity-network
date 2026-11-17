import { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import EmptyState from '../../components/ui/EmptyState';
import ErrorState from '../../components/ui/ErrorState';
import GlassCard from '../../components/glass/GlassCard';
import PageLoader from '../../components/ui/PageLoader';
import { notificationApi } from '../../services/chatApi';
import { refreshCounts, setCounts } from '../../services/unread';
import { useRealtimeEvent, useRealtimeReconnect } from '../../hooks/useRealtime';
import { toApiError } from '../../utils/errors';

const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true }) : '');

/** The links the server puts on notifications are in-app paths; anything else (or nothing) just marks it read. */
const target = (n) => {
  const link = n.data?.deepLink;
  return typeof link === 'string' && link.startsWith('/') ? link : null;
};

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [state, setState] = useState({ items: [], loading: true, error: null, page: 1, pages: 1, unread: 0, loadingMore: false });
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Notifications</h1>
        {state.unread > 0 && (
          <button type="button" className="btn btn-glass" onClick={readAll} disabled={busy}>
            <CheckCheck size={16} aria-hidden /> Mark all as read
          </button>
        )}
      </div>
      {state.error && <p role="alert" className="text-sm text-danger">{state.error.message}</p>}

      {state.items.length === 0 ? (
        <EmptyState icon={Bell} title="You are all caught up">Updates about your listings, requests and verification will appear here.</EmptyState>
      ) : (
        <ul className="space-y-2" aria-label="Notifications">
          {state.items.map((n) => (
            <li key={n._id}>
              <GlassCard as="div" className="p-0">
                <button type="button" onClick={() => open(n)} className="flex min-h-[44px] w-full items-start gap-3 p-4 text-left">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-primary dark:bg-primary-tint'}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className={`block text-ink dark:text-white ${n.readAt ? 'font-medium' : 'font-bold'}`}>
                      {n.title}
                      {!n.readAt && <span className="sr-only"> (unread)</span>}
                    </span>
                    {n.body && <span className="mt-0.5 block text-sm text-ink-muted dark:text-[#9FB2A7]">{n.body}</span>}
                    <span className="mt-1 block text-xs text-ink-muted dark:text-[#9FB2A7]">{when(n.createdAt)}</span>
                  </span>
                </button>
              </GlassCard>
            </li>
          ))}
        </ul>
      )}

      {state.page < state.pages && (
        <div className="text-center">
          <button type="button" className="btn btn-glass" onClick={loadMore} disabled={state.loadingMore}>{state.loadingMore ? 'Loading...' : 'Show more'}</button>
        </div>
      )}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import GlassCard from '../glass/GlassCard';
import Skeleton from '../ui/Skeleton';
import ErrorState from '../ui/ErrorState';
import { chatApi } from '../../services/chatApi';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeEvent, useRealtimeReconnect } from '../../hooks/useRealtime';
import { chatTime, contextLabel } from '../../lib/chat';
import { toApiError } from '../../utils/errors';

/** Everyone the person has talked to, newest first, kept current by the live connection. */
export default function ConversationList({ activeId }) {
  const { user } = useAuth();
  const [state, setState] = useState({ items: [], loading: true, error: null });

  const load = useCallback(async (signal) => {
    try {
      const { items } = await chatApi.list({ limit: 50 }, signal);
      setState({ items, loading: false, error: null });
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

  // A new message moves its conversation to the top with its newest text and unread count (or adds it, if it is new).
  useRealtimeEvent('message:new', ({ conversation }) => {
    if (!conversation?._id) return;
    setState((s) => ({ ...s, items: [conversation, ...s.items.filter((c) => c._id !== conversation._id)] }));
  });

  // Reading a thread (here or on another device) clears its badge.
  useRealtimeEvent('message:read', ({ conversationId, by }) => {
    if (by !== user?._id) return;
    setState((s) => ({ ...s, items: s.items.map((c) => (c._id === conversationId ? { ...c, unread: 0 } : c)) }));
  });

  if (state.loading) return <div className="space-y-3" aria-busy="true">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>;
  if (state.error) return <ErrorState error={state.error} onRetry={() => { setState((s) => ({ ...s, loading: true, error: null })); load(); }} />;
  if (state.items.length === 0) {
    return (
      <GlassCard className="text-center">
        <MessageCircle className="mx-auto mb-2 text-primary dark:text-primary-tint" size={28} aria-hidden />
        <h2 className="font-bold text-ink dark:text-white">No messages yet</h2>
        <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">Open a repair, an order or a device and choose Message to start a conversation.</p>
      </GlassCard>
    );
  }

  return (
    <ul className="space-y-2" aria-label="Conversations">
      {state.items.map((c) => {
        const preview = c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.text}` : 'No messages yet';
        const active = c._id === activeId;
        return (
          <li key={c._id}>
            <Link
              to={`/dashboard/messages/${c._id}`}
              aria-current={active ? 'page' : undefined}
              className={`glass flex min-h-[44px] items-start gap-3 p-3 transition hover:shadow-e1 ${active ? 'ring-2 ring-primary' : ''}`}
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary font-bold text-white dark:bg-primary-tint dark:text-canvas-dark" aria-hidden>
                {(c.other?.name || '?').slice(0, 1).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate text-ink dark:text-white ${c.unread ? 'font-extrabold' : 'font-semibold'}`}>{c.other?.name || 'Someone'}</span>
                  <span className="shrink-0 text-xs text-ink-muted dark:text-[#9FB2A7]">{chatTime(c.lastMessage?.at || c.updatedAt)}</span>
                </span>
                <span className="block text-xs text-primary dark:text-primary-tint">{contextLabel(c.contextType)}</span>
                <span className="mt-0.5 flex items-center justify-between gap-2">
                  <span className={`line-clamp-2 text-sm text-ink-muted dark:text-[#9FB2A7] ${c.unread ? 'font-semibold' : ''}`}>{preview}</span>
                  {c.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-white dark:bg-primary-tint dark:text-canvas-dark" aria-label={`${c.unread} unread`}>
                      {c.unread > 99 ? '99+' : c.unread}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

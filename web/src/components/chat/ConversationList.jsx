import { useCallback, useEffect, useState } from 'react';
import { MessageCircle, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
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
  const [term, setTerm] = useState('');

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

  if (state.loading) return <div className="space-y-3 px-4 pb-4" aria-busy="true">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] !rounded-2xl" />)}</div>;
  if (state.error) return <div className="px-4 pb-4"><ErrorState error={state.error} onRetry={() => { setState((s) => ({ ...s, loading: true, error: null })); load(); }} /></div>;
  if (state.items.length === 0) {
    return (
      <div className="m-auto px-6 pb-10 text-center">
        <span aria-hidden className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary dark:text-primary-tint"><MessageCircle size={26} /></span>
        <h2 className="mt-3 font-bold text-ink dark:text-white">No messages yet</h2>
        <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">Open a repair, an order or a device and choose Message to start a conversation.</p>
      </div>
    );
  }

  const q = term.trim().toLowerCase();
  const shown = q ? state.items.filter((c) => [c.other?.name, c.lastMessage?.text, contextLabel(c.contextType)].filter(Boolean).join(' ').toLowerCase().includes(q)) : state.items;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <label className="mx-4 mb-3 flex items-center gap-2.5 rounded-full bg-black/[0.04] px-4 py-2.5 dark:bg-white/10">
        <Search size={16} aria-hidden className="shrink-0 text-ink-muted" />
        <span className="sr-only">Search conversations</span>
        <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search" className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted dark:text-white" />
      </label>
      {shown.length === 0 && <p className="px-6 py-8 text-center text-sm text-ink-muted dark:text-[#9FB2A7]">No conversation matches your search.</p>}
      <ul className="min-h-0 flex-1 overflow-y-auto pb-2" aria-label="Conversations">
        {shown.map((c) => {
          const preview = c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.text}` : 'No messages yet';
          const active = c._id === activeId;
          return (
            <li key={c._id}>
              <Link
                to={`/dashboard/messages/${c._id}`}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[44px] items-start gap-3 px-5 py-3.5 transition ${active ? 'bg-primary/10' : 'hover:bg-black/[0.03] dark:hover:bg-white/5'}`}
              >
                {active && <span aria-hidden className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary dark:bg-primary-tint" />}
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary font-bold text-white dark:bg-primary-tint dark:text-canvas-dark" aria-hidden>
                  {(c.other?.name || '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={`truncate text-ink dark:text-white ${c.unread ? 'font-extrabold' : 'font-semibold'}`}>{c.other?.name || 'Someone'}</span>
                    <span className={`shrink-0 text-xs ${c.unread ? 'font-semibold text-primary dark:text-primary-tint' : 'text-ink-muted dark:text-[#9FB2A7]'}`}>{chatTime(c.lastMessage?.at || c.updatedAt)}</span>
                  </span>
                  <span className="mt-0.5 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary dark:text-primary-tint">{contextLabel(c.contextType)}</span>
                  <span className="mt-1 flex items-center justify-between gap-2">
                    <span className={`line-clamp-1 text-sm ${c.unread ? 'font-semibold text-ink dark:text-white' : 'text-ink-muted dark:text-[#9FB2A7]'}`}>{preview}</span>
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
    </div>
  );
}

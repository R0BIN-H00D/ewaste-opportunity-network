import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import ErrorState from '../ui/ErrorState';
import PageLoader from '../ui/PageLoader';
import { chatApi } from '../../services/chatApi';
import { emitRealtime } from '../../services/realtime';
import { refreshCounts } from '../../services/unread';
import { useAuth } from '../../hooks/useAuth';
import { useRealtimeEvent, useRealtimeReconnect } from '../../hooks/useRealtime';
import { byTime, clockTime, contextLabel, dayLabel, sameDay } from '../../lib/chat';
import { toApiError } from '../../utils/errors';

const MAX = 2000;
const TYPING_PAUSE_MS = 3000;
const TYPING_SHOWN_MS = 6000;

/**
 * One conversation: the messages (newest at the bottom), a box to write in, and "typing" and "Seen" when the other person is
 * live. Sending works with no live connection; the message simply shows up for them next time they look.
 */
export default function ChatThread({ conversationId }) {
  const { user } = useAuth();
  const me = user?._id;
  const [convo, setConvo] = useState(null);
  const [state, setState] = useState({ messages: [], loading: true, error: null, hasMore: false, nextBefore: null, loadingOlder: false });
  const [text, setText] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const bottom = useRef(null);
  const tempId = useRef(0);
  const iAmTyping = useRef(false);
  const myTypingTimer = useRef(null);
  const otherTypingTimer = useRef(null);
  const stickToBottom = useRef(true);

  const messagesRef = useRef(state.messages);
  messagesRef.current = state.messages;

  const markRead = useCallback(async () => {
    if (!messagesRef.current.some((m) => m.sender !== me && !m.read)) return;
    try {
      await chatApi.markRead(conversationId);
    } catch {
      return;
    }
    setState((s) => ({ ...s, messages: s.messages.map((m) => (m.sender !== me ? { ...m, read: true } : m)) }));
    refreshCounts();
  }, [conversationId, me]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [c, page] = await Promise.all([chatApi.get(conversationId), chatApi.messages(conversationId, { limit: 30 })]);
      setConvo(c);
      messagesRef.current = page.items;
      setState({ messages: page.items, loading: false, error: null, hasMore: !!page.meta?.hasMore, nextBefore: page.meta?.nextBefore || null, loadingOlder: false });
      await markRead();
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: toApiError(err) }));
    }
  }, [conversationId, markRead]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the newest message in view, unless the person has scrolled up to read older ones.
  useEffect(() => {
    if (stickToBottom.current) bottom.current?.scrollIntoView?.({ block: 'end' });
  }, [state.messages, otherTyping]);

  const stopTyping = useCallback(() => {
    clearTimeout(myTypingTimer.current);
    if (!iAmTyping.current) return;
    iAmTyping.current = false;
    emitRealtime('typing', { conversationId, typing: false });
  }, [conversationId]);

  useEffect(() => () => {
    stopTyping();
    clearTimeout(otherTypingTimer.current);
  }, [stopTyping]);

  // ---- live events ----
  useRealtimeEvent('message:new', ({ message }) => {
    if (message?.conversation !== conversationId) return;
    setState((s) => {
      if (s.messages.some((m) => m._id === message._id)) return s;
      let list = s.messages;
      if (message.sender === me) {
        // My own message coming back from the server replaces the copy still showing as "sending".
        const i = list.findIndex((m) => m.pending && m.text === message.text);
        if (i >= 0) list = list.filter((_, k) => k !== i);
      }
      return { ...s, messages: byTime([...list, message]) };
    });
    if (message.sender !== me) {
      setOtherTyping(false);
      setTimeout(markRead, 0);
    }
  });

  useRealtimeEvent('message:read', ({ conversationId: id, by }) => {
    if (id !== conversationId || by === me) return;
    setState((s) => ({ ...s, messages: s.messages.map((m) => (m.sender === me ? { ...m, read: true } : m)) }));
  });

  useRealtimeEvent('typing', ({ conversationId: id, userId, typing }) => {
    if (id !== conversationId || userId === me) return;
    clearTimeout(otherTypingTimer.current);
    setOtherTyping(!!typing);
    // If the "stopped typing" message is lost, do not show it forever.
    if (typing) otherTypingTimer.current = setTimeout(() => setOtherTyping(false), TYPING_SHOWN_MS);
  });

  // After a gap in the connection, fetch what was missed and keep anything still being sent.
  useRealtimeReconnect(async () => {
    try {
      const page = await chatApi.messages(conversationId, { limit: 30 });
      setState((s) => {
        const known = new Set(s.messages.map((m) => m._id));
        const fresh = page.items.filter((m) => !known.has(m._id));
        const updated = s.messages.map((m) => page.items.find((p) => p._id === m._id) || m);
        return { ...s, messages: byTime([...updated, ...fresh]) };
      });
      setTimeout(markRead, 0);
    } catch {
      // The next event or reload will try again.
    }
  });

  // ---- sending ----
  const deliver = useCallback(async (temp) => {
    try {
      const saved = await chatApi.send(conversationId, temp.text);
      setState((s) => {
        const without = s.messages.filter((m) => m._id !== temp._id);
        // The live copy may have got here first; never show the message twice.
        return { ...s, messages: byTime(without.some((m) => m._id === saved._id) ? without : [...without, saved]) };
      });
    } catch {
      setState((s) => ({ ...s, messages: s.messages.map((m) => (m._id === temp._id ? { ...m, pending: false, failed: true } : m)) }));
    }
  }, [conversationId]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    const temp = { _id: `tmp-${tempId.current++}`, conversation: conversationId, sender: me, text: body, createdAt: new Date().toISOString(), read: false, pending: true };
    stickToBottom.current = true;
    setState((s) => ({ ...s, messages: [...s.messages, temp] }));
    setText('');
    stopTyping();
    deliver(temp);
  };

  const retry = (id) => {
    const failed = state.messages.find((m) => m._id === id && m.failed);
    if (!failed) return;
    const again = { ...failed, pending: true, failed: false };
    setState((s) => ({ ...s, messages: s.messages.map((m) => (m._id === id ? again : m)) }));
    deliver(again);
  };

  const discard = (id) => setState((s) => ({ ...s, messages: s.messages.filter((m) => m._id !== id) }));

  const loadOlder = async () => {
    if (state.loadingOlder || !state.hasMore || !state.nextBefore) return;
    setState((s) => ({ ...s, loadingOlder: true }));
    stickToBottom.current = false;
    try {
      const page = await chatApi.messages(conversationId, { limit: 30, before: state.nextBefore });
      setState((s) => ({ ...s, messages: [...page.items, ...s.messages], hasMore: !!page.meta?.hasMore, nextBefore: page.meta?.nextBefore || null, loadingOlder: false }));
    } catch (err) {
      setState((s) => ({ ...s, loadingOlder: false, error: toApiError(err) }));
    }
  };

  const onChange = (event) => {
    const value = event.target.value.slice(0, MAX);
    setText(value);
    clearTimeout(myTypingTimer.current);
    if (!value.trim()) return stopTyping();
    if (!iAmTyping.current) {
      iAmTyping.current = true;
      emitRealtime('typing', { conversationId, typing: true });
    }
    myTypingTimer.current = setTimeout(stopTyping, TYPING_PAUSE_MS);
    return undefined;
  };

  const onKeyDown = (event) => {
    // Enter sends; Shift+Enter makes a new line.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  };

  const onScroll = (event) => {
    const el = event.currentTarget;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };

  if (state.loading && state.messages.length === 0) return <PageLoader label="Loading messages" />;
  if (state.error && state.messages.length === 0) return <ErrorState error={state.error} onRetry={load} />;

  const lastSeenId = [...state.messages].reverse().find((m) => m.sender === me && m.read)?._id;

  const other = convo?.other?.name || 'Message';

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-black/5 px-4 py-3.5 dark:border-white/10 sm:px-6">
        <Link to="/dashboard/messages" className="btn btn-glass md:hidden" aria-label="Back to all conversations"><ArrowLeft size={16} aria-hidden /></Link>
        <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary font-bold text-white dark:bg-primary-tint dark:text-canvas-dark">{other.slice(0, 1).toUpperCase()}</span>
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-ink dark:text-white">{other}</h2>
          <p className={`text-xs ${otherTyping ? 'font-semibold text-primary dark:text-primary-tint' : 'text-ink-muted dark:text-[#9FB2A7]'}`} aria-live="polite">
            {otherTyping ? 'typing...' : convo ? contextLabel(convo.contextType) : ''}
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-black/[0.02] px-4 py-4 dark:bg-black/20 sm:px-6" onScroll={onScroll} role="log" aria-label="Messages">
        {state.hasMore && (
          <div className="pb-2 text-center">
            <button type="button" className="btn btn-glass" onClick={loadOlder} disabled={state.loadingOlder}>{state.loadingOlder ? 'Loading...' : 'Show older messages'}</button>
          </div>
        )}
        {state.messages.length === 0 && <p className="py-16 text-center text-sm text-ink-muted dark:text-[#9FB2A7]">No messages yet. Say hello.</p>}
        {state.messages.map((m, i) => {
          const mine = m.sender === me;
          const previous = state.messages[i - 1];
          const grouped = previous && previous.sender === m.sender && sameDay(previous.createdAt, m.createdAt);
          return (
            <div key={m._id} className={grouped ? '' : 'pt-2'}>
              {(!previous || !sameDay(previous.createdAt, m.createdAt)) && (
                <p className="py-3 text-center"><span className="rounded-full bg-black/5 px-3 py-1 text-xs font-medium text-ink-muted dark:bg-white/10 dark:text-[#9FB2A7]">{dayLabel(m.createdAt)}</span></p>
              )}
              <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <p
                  className={`max-w-[78%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[65%] ${
                    mine ? 'rounded-br-md bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'rounded-bl-md bg-white text-ink dark:bg-white/10 dark:text-white'
                  } ${m.pending ? 'opacity-60' : ''}`}
                >
                  {m.text}
                </p>
                {m.failed ? (
                  <span className="mt-1 flex items-center gap-2 text-xs text-danger" role="alert">
                    Not sent
                    <button type="button" className="underline" onClick={() => retry(m._id)}>Try again</button>
                    <button type="button" className="underline" onClick={() => discard(m._id)}>Delete</button>
                  </span>
                ) : (
                  <span className="mt-1 px-1 text-[11px] text-ink-muted dark:text-[#9FB2A7]">
                    {m.pending ? 'Sending...' : clockTime(m.createdAt)}
                    {m._id === lastSeenId ? ' · Seen' : ''}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <form className="flex items-end gap-3 border-t border-black/5 px-4 py-3.5 dark:border-white/10 sm:px-6" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <label className="sr-only" htmlFor="chat-box">Write a message</label>
        <textarea
          id="chat-box"
          className="max-h-32 min-h-[48px] flex-1 resize-none rounded-3xl border border-black/10 bg-white px-5 py-3 text-sm text-ink outline-none transition placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary/20 dark:border-white/10 dark:bg-white/10 dark:text-white"
          rows={1}
          maxLength={MAX}
          placeholder="Write a message"
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-primary text-white shadow-md transition hover:scale-105 disabled:opacity-40 disabled:hover:scale-100 dark:bg-primary-tint dark:text-canvas-dark" disabled={!text.trim()} aria-label="Send">
          <Send size={18} aria-hidden />
        </button>
      </form>
    </div>
  );
}

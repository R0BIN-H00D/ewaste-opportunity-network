import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render } from '@testing-library/react';
import { chatApi, notificationApi } from '../services/chatApi';
import { emitRealtime } from '../services/realtime';
import MessageButton from '../components/chat/MessageButton';
import { getCounts, resetCounts } from '../services/unread';
import { USER, renderApp, signedIn } from './helpers';

// What the server pushes is simulated through this little bus instead of a real socket.
const rt = vi.hoisted(() => {
  const handlers = new Map();
  const statusHandlers = new Set();
  return {
    handlers,
    statusHandlers,
    push: (event, payload) => handlers.get(event)?.forEach((fn) => fn(payload)),
    status: (up) => statusHandlers.forEach((fn) => fn(up)),
    reset: () => { handlers.clear(); statusHandlers.clear(); },
  };
});

vi.mock('../services/realtime', () => ({
  connectRealtime: vi.fn(),
  disconnectRealtime: vi.fn(),
  emitRealtime: vi.fn(),
  isRealtimeConnected: () => true,
  onRealtime: (event, fn) => {
    if (!rt.handlers.has(event)) rt.handlers.set(event, new Set());
    rt.handlers.get(event).add(fn);
    return () => rt.handlers.get(event)?.delete(fn);
  },
  onRealtimeStatus: (fn) => {
    rt.statusHandlers.add(fn);
    return () => rt.statusHandlers.delete(fn);
  },
}));
vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/chatApi', () => ({
  chatApi: { open: vi.fn(), get: vi.fn(), list: vi.fn(), unreadCount: vi.fn(), messages: vi.fn(), send: vi.fn(), markRead: vi.fn() },
  notificationApi: { list: vi.fn(), unreadCount: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const ME = USER._id;
const convo = (over = {}) => ({ _id: 'c1', contextType: 'service', contextId: 'r1', other: { _id: 'u2', name: 'Ravi Kumar', role: 'technician' }, lastMessage: null, unread: 0, updatedAt: '2026-11-16T09:00:00.000Z', ...over });
const msg = (id, text, over = {}) => ({ _id: id, conversation: 'c1', sender: 'u2', text, createdAt: `2026-11-16T09:0${id.replace(/\D/g, '') || 0}:00.000Z`, read: false, ...over });
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, ...meta } });
const apiError = (message, status = 500) => Object.assign(new Error(message), { response: { status, data: { message } } });

beforeEach(() => {
  vi.resetAllMocks();
  rt.reset();
  resetCounts();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  chatApi.unreadCount.mockResolvedValue(0);
  notificationApi.unreadCount.mockResolvedValue(0);
  chatApi.list.mockResolvedValue(page([]));
  chatApi.markRead.mockResolvedValue({ unread: 0 });
});

const openList = (items) => {
  chatApi.list.mockResolvedValue(page(items));
  return renderApp('/dashboard/messages', signedIn());
};

const openThread = async (messages, { conversation = convo(), meta } = {}) => {
  chatApi.list.mockResolvedValue(page([conversation]));
  chatApi.get.mockResolvedValue(conversation);
  chatApi.messages.mockResolvedValue(page(messages, meta));
  const view = renderApp('/dashboard/messages/c1', signedIn());
  await screen.findByRole('log', { name: 'Messages' });
  return view;
};

const write = (text) => fireEvent.change(screen.getByLabelText('Write a message'), { target: { value: text } });
const log = () => within(screen.getByRole('log', { name: 'Messages' }));

describe('the conversations list', () => {
  it('shows who, what about, the newest message and how many are unread', async () => {
    openList([
      convo({ lastMessage: { text: 'See you at five', at: new Date().toISOString(), mine: false }, unread: 3 }),
      convo({ _id: 'c2', contextType: 'order', other: { _id: 'u3', name: 'Meena' }, lastMessage: { text: 'Thanks!', at: new Date().toISOString(), mine: true } }),
    ]);

    const list = await screen.findByRole('list', { name: 'Conversations' });
    expect(within(list).getByText('Ravi Kumar')).toBeInTheDocument();
    expect(within(list).getByText('Repair')).toBeInTheDocument();
    expect(within(list).getByText('See you at five')).toBeInTheDocument();
    expect(within(list).getByLabelText('3 unread')).toBeInTheDocument();
    expect(within(list).getByText('Meena')).toBeInTheDocument();
    expect(within(list).getByText('Order')).toBeInTheDocument();
    expect(within(list).getByText('You: Thanks!')).toBeInTheDocument();
    expect(within(list).getByRole('link', { name: /Ravi Kumar/ })).toHaveAttribute('href', '/dashboard/messages/c1');
  });

  it('explains how to start a conversation when there are none', async () => {
    openList([]);
    expect(await screen.findByText('No messages yet')).toBeInTheDocument();
    expect(screen.getByText(/choose Message to start/)).toBeInTheDocument();
  });

  it('says so when it cannot load, and loads when retried', async () => {
    chatApi.list.mockRejectedValueOnce(apiError('The list is unavailable'));
    renderApp('/dashboard/messages', signedIn());
    expect(await screen.findByText('The list is unavailable')).toBeInTheDocument();

    chatApi.list.mockResolvedValue(page([convo({ lastMessage: { text: 'Back', at: new Date().toISOString(), mine: false } })]));
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Back')).toBeInTheDocument();
  });

  it('moves a conversation to the top when a message arrives, and clears its badge when it is read', async () => {
    openList([convo({ lastMessage: { text: 'old', at: new Date().toISOString(), mine: false } }), convo({ _id: 'c2', other: { _id: 'u3', name: 'Meena' }, lastMessage: { text: 'older', at: new Date().toISOString(), mine: false } })]);
    await screen.findByText('Meena');

    act(() => rt.push('message:new', { message: msg('m9', 'Fresh', { conversation: 'c2' }), conversation: convo({ _id: 'c2', other: { _id: 'u3', name: 'Meena' }, unread: 2, lastMessage: { text: 'Fresh', at: new Date().toISOString(), mine: false } }) }));
    const names = () => within(screen.getByRole('list', { name: 'Conversations' })).getAllByRole('link').map((l) => l.textContent);
    await waitFor(() => expect(names()[0]).toContain('Meena'));
    expect(screen.getByLabelText('2 unread')).toBeInTheDocument();

    act(() => rt.push('message:read', { conversationId: 'c2', by: ME }));
    await waitFor(() => expect(screen.queryByLabelText('2 unread')).not.toBeInTheDocument());
  });

  it('reloads after the connection comes back', async () => {
    openList([convo()]);
    await screen.findByText('Ravi Kumar');
    chatApi.list.mockResolvedValue(page([convo(), convo({ _id: 'c2', other: { _id: 'u3', name: 'Meena' } })]));
    act(() => rt.status(true));
    expect(await screen.findByText('Meena')).toBeInTheDocument();
  });
});

describe('a conversation', () => {
  it('shows the messages and who it is with, marks them read, and says "Seen" under my last read message', async () => {
    await openThread([msg('m1', 'Is it fixed yet?', { sender: ME, read: true }), msg('m2', 'Almost. Needs a battery.'), msg('m3', 'How long?', { sender: ME, read: true })]);

    expect(log().getByText('Is it fixed yet?')).toBeInTheDocument();
    expect(log().getByText('Almost. Needs a battery.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Ravi Kumar' })).toBeInTheDocument();
    expect(screen.getAllByText('Repair').length).toBeGreaterThan(0);
    await waitFor(() => expect(chatApi.markRead).toHaveBeenCalledWith('c1'));
    expect(log().getAllByText(/Seen/)).toHaveLength(1);
  });

  it('does not bother the server when there is nothing new from the other person', async () => {
    await openThread([msg('m1', 'Mine', { sender: ME }), msg('m2', 'Theirs', { read: true })]);
    expect(chatApi.markRead).not.toHaveBeenCalled();
  });

  it('invites the first message when empty', async () => {
    await openThread([]);
    expect(log().getByText('No messages yet. Say hello.')).toBeInTheDocument();
  });

  it('sends with the button or Enter, but not Shift+Enter, and never an empty message', async () => {
    await openThread([msg('m1', 'Hi', { read: true })]);
    chatApi.send.mockImplementation(async (id, text) => ({ _id: `s-${text}`, conversation: id, sender: ME, text, createdAt: new Date().toISOString(), read: false }));
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toBeDisabled();

    write('   ');
    expect(send).toBeDisabled();

    write('About two days');
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() => expect(chatApi.send).toHaveBeenCalledWith('c1', 'About two days'));
    expect(screen.getByLabelText('Write a message')).toHaveValue('');
    expect(await log().findByText('About two days')).toBeInTheDocument();

    write('Second one');
    fireEvent.keyDown(screen.getByLabelText('Write a message'), { key: 'Enter', shiftKey: true });
    expect(chatApi.send).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(screen.getByLabelText('Write a message'), { key: 'Enter' });
    await waitFor(() => expect(chatApi.send).toHaveBeenCalledWith('c1', 'Second one'));
  });

  it('shows a message as sending at once, then as sent', async () => {
    await openThread([]);
    let finish;
    chatApi.send.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    write('On my way');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(await log().findByText('On my way')).toBeInTheDocument();
    expect(log().getByText('Sending...')).toBeInTheDocument();
    await act(async () => finish({ _id: 'real1', conversation: 'c1', sender: ME, text: 'On my way', createdAt: new Date().toISOString(), read: false }));
    await waitFor(() => expect(log().queryByText('Sending...')).not.toBeInTheDocument());
    expect(log().getAllByText('On my way')).toHaveLength(1);
  });

  it('keeps a message that failed, and sends it again or lets it go', async () => {
    await openThread([]);
    chatApi.send.mockRejectedValueOnce(apiError('Cannot reach the server'));
    write('Please call me');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText('Not sent')).toBeInTheDocument();

    chatApi.send.mockResolvedValue({ _id: 'real2', conversation: 'c1', sender: ME, text: 'Please call me', createdAt: new Date().toISOString(), read: false });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByText('Not sent')).not.toBeInTheDocument());
    expect(chatApi.send).toHaveBeenCalledTimes(2);

    chatApi.send.mockRejectedValueOnce(apiError('Nope'));
    write('Never mind');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Not sent');
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.queryByText('Never mind')).not.toBeInTheDocument();
  });

  it('shows the live copy of my own message and the saved one only once', async () => {
    await openThread([]);
    let finish;
    chatApi.send.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    write('Same words');
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await log().findByText('Same words');

    const saved = { _id: 'real3', conversation: 'c1', sender: ME, text: 'Same words', createdAt: new Date().toISOString(), read: false };
    act(() => rt.push('message:new', { message: saved, conversation: convo() }));
    await act(async () => finish(saved));
    expect(log().getAllByText('Same words')).toHaveLength(1);
  });

  it('shows a message from the other person as it arrives, and ignores other conversations', async () => {
    await openThread([msg('m1', 'Hi', { read: true })]);
    act(() => rt.push('message:new', { message: msg('m4', 'Ready tomorrow!'), conversation: convo({ unread: 1 }) }));
    expect(await log().findByText('Ready tomorrow!')).toBeInTheDocument();
    await waitFor(() => expect(chatApi.markRead).toHaveBeenCalled());

    act(() => rt.push('message:new', { message: msg('m5', 'Elsewhere', { conversation: 'c9' }), conversation: convo({ _id: 'c9' }) }));
    expect(log().queryByText('Elsewhere')).not.toBeInTheDocument();
    act(() => rt.push('message:new', { message: msg('m4', 'Ready tomorrow!'), conversation: convo() }));
    expect(log().getAllByText('Ready tomorrow!')).toHaveLength(1);
  });

  it('marks my messages "Seen" when the other person reads them', async () => {
    await openThread([msg('m1', 'Mine', { sender: ME }), msg('m2', 'Theirs', { read: true })]);
    expect(log().queryByText(/Seen/)).not.toBeInTheDocument();
    act(() => rt.push('message:read', { conversationId: 'c1', by: ME })); // my own read does not count
    expect(log().queryByText(/Seen/)).not.toBeInTheDocument();
    act(() => rt.push('message:read', { conversationId: 'c1', by: 'u2' }));
    expect(await log().findByText(/Seen/)).toBeInTheDocument();
  });

  it('shows "typing..." while the other person types and drops it when their message arrives', async () => {
    await openThread([msg('m1', 'Hi', { read: true })]);
    act(() => rt.push('typing', { conversationId: 'c1', userId: 'u2', typing: true }));
    expect(await screen.findByText('typing...')).toBeInTheDocument();

    act(() => rt.push('typing', { conversationId: 'c1', userId: ME, typing: false })); // my own echo is not about them
    expect(screen.getByText('typing...')).toBeInTheDocument();

    act(() => rt.push('message:new', { message: msg('m6', 'Done'), conversation: convo() }));
    await waitFor(() => expect(screen.queryByText('typing...')).not.toBeInTheDocument());
  });

  it('tells the other person when I start typing, and when I stop', async () => {
    await openThread([]);
    write('H');
    expect(emitRealtime).toHaveBeenCalledWith('typing', { conversationId: 'c1', typing: true });
    write('Hi');
    expect(emitRealtime).toHaveBeenCalledTimes(1);
    write('');
    expect(emitRealtime).toHaveBeenLastCalledWith('typing', { conversationId: 'c1', typing: false });
  });

  it('loads older messages on request and stops when there are none left', async () => {
    await openThread([msg('m3', 'Newest')], { meta: { hasMore: true, nextBefore: 'm3' } });
    chatApi.messages.mockResolvedValueOnce(page([msg('m1', 'Oldest'), msg('m2', 'Older')], { hasMore: false, nextBefore: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Show older messages' }));

    expect(await log().findByText('Oldest')).toBeInTheDocument();
    expect(chatApi.messages).toHaveBeenLastCalledWith('c1', { limit: 30, before: 'm3' });
    expect(screen.queryByRole('button', { name: 'Show older messages' })).not.toBeInTheDocument();
  });

  it('catches up on what it missed when the connection returns', async () => {
    await openThread([msg('m1', 'Before', { read: true })]);
    chatApi.messages.mockResolvedValue(page([msg('m1', 'Before', { read: true }), msg('m7', 'While you were away')]));
    act(() => rt.status(true));
    expect(await log().findByText('While you were away')).toBeInTheDocument();
    expect(log().getAllByText('Before')).toHaveLength(1);
  });

  it('says why a thread cannot load and loads when retried', async () => {
    chatApi.list.mockResolvedValue(page([convo()]));
    chatApi.get.mockRejectedValueOnce(apiError('Conversation not found', 404));
    chatApi.messages.mockResolvedValue(page([]));
    renderApp('/dashboard/messages/c1', signedIn());
    expect(await screen.findByText('Conversation not found')).toBeInTheDocument();

    chatApi.get.mockResolvedValue(convo());
    chatApi.messages.mockResolvedValue(page([msg('m1', 'Back online', { read: true })]));
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Back online')).toBeInTheDocument();
  });

  it('stops the box at 2000 characters', async () => {
    await openThread([]);
    write('x'.repeat(2100));
    expect(screen.getByLabelText('Write a message').value.length).toBe(2000);
  });
});

describe('the Message button', () => {
  const renderButton = (props) => render(
    <MemoryRouter initialEntries={['/']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<MessageButton {...props} />} />
        <Route path="/dashboard/messages/:id" element={<p>THREAD OPENED</p>} />
      </Routes>
    </MemoryRouter>,
  );

  it('asks for the thread by what it is about, then opens it', async () => {
    chatApi.open.mockResolvedValue(convo({ _id: 'c77' }));
    renderButton({ contextType: 'order', contextId: 'o5', label: 'Message Meena' });
    fireEvent.click(screen.getByRole('button', { name: /Message Meena/ }));
    expect(await screen.findByText('THREAD OPENED')).toBeInTheDocument();
    expect(chatApi.open).toHaveBeenCalledWith('order', 'o5');
  });

  it('says why when there is nobody to message, and can be tried again', async () => {
    chatApi.open.mockRejectedValue(apiError('There is nobody to message here', 404));
    renderButton({ contextType: 'service', contextId: 'r1' });
    fireEvent.click(screen.getByRole('button', { name: /Message/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('There is nobody to message here');
    expect(screen.getByRole('button', { name: /Message/ })).toBeEnabled();
  });
});

describe('the sidebar', () => {
  it('shows how many messages and notifications are waiting, and follows live changes', async () => {
    chatApi.unreadCount.mockResolvedValue(5);
    notificationApi.unreadCount.mockResolvedValue(2);
    renderApp('/dashboard/messages', signedIn());

    expect(await screen.findByLabelText('5 unread messages')).toBeInTheDocument();
    expect(screen.getByLabelText('2 unread notifications')).toBeInTheDocument();
    expect(getCounts()).toEqual({ notifications: 2, messages: 5 });

    act(() => rt.push('notification:new', { notification: { _id: 'n1', type: 'a', title: 'New' }, unread: 3 }));
    expect(await screen.findByLabelText('3 unread notifications')).toBeInTheDocument();

    chatApi.unreadCount.mockResolvedValue(6);
    act(() => rt.push('message:new', { message: msg('m1', 'x'), conversation: convo() }));
    expect(await screen.findByLabelText('6 unread messages')).toBeInTheDocument();
  });

  it('shows no badge when nothing is waiting', async () => {
    renderApp('/dashboard/messages', signedIn());
    await screen.findByRole('heading', { name: 'Messages' });
    expect(screen.queryByLabelText(/unread/)).not.toBeInTheDocument();
  });

  it('has a Messages link for members and none for administrators', async () => {
    notificationApi.list.mockResolvedValue(page([]));
    const member = renderApp('/dashboard/notifications', signedIn());
    await screen.findByRole('heading', { name: 'Notifications' });
    expect(within(screen.getByRole('complementary', { name: 'Dashboard navigation' })).getByRole('link', { name: /Messages/ })).toHaveAttribute('href', '/dashboard/messages');
    member.unmount();

    renderApp('/dashboard/notifications', signedIn({ ...USER, role: 'admin' }));
    await screen.findByRole('heading', { name: 'Notifications' });
    expect(within(screen.getByRole('complementary', { name: 'Dashboard navigation' })).queryByRole('link', { name: /Messages/ })).not.toBeInTheDocument();
  });
});

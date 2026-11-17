import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { chatApi, notificationApi } from '../services/chatApi';
import { getCounts, resetCounts } from '../services/unread';
import { renderApp, signedIn } from './helpers';

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

const note = (id, over = {}) => ({ _id: id, type: 'quotation.new', title: `Title ${id}`, body: `Body ${id}`, data: {}, readAt: null, createdAt: '2026-11-16T09:00:00.000Z', ...over });
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 20, unread: items.filter((n) => !n.readAt).length, ...meta } });
const apiError = (message, status = 500) => Object.assign(new Error(message), { response: { status, data: { message } } });
const list = () => screen.getByRole('list', { name: 'Notifications' });

beforeEach(() => {
  vi.resetAllMocks();
  rt.reset();
  resetCounts();
  chatApi.unreadCount.mockResolvedValue(0);
  notificationApi.unreadCount.mockResolvedValue(0);
  notificationApi.markRead.mockResolvedValue({});
  notificationApi.markAllRead.mockResolvedValue({ updated: 2, unread: 0 });
});

const open = (items, meta) => {
  notificationApi.list.mockResolvedValue(page(items, meta));
  return renderApp('/dashboard/notifications', signedIn());
};

describe('the notifications page', () => {
  it('lists them newest first with the unread ones marked', async () => {
    open([note('n2', { title: 'New quote' }), note('n1', { title: 'Old news', readAt: '2026-11-16T10:00:00.000Z' })]);
    expect(await within(await screen.findByRole('list', { name: 'Notifications' })).findByText('New quote')).toBeInTheDocument();

    expect(within(list()).getByText(/\(unread\)/)).toBeInTheDocument();
    expect(within(list()).getAllByText(/\(unread\)/)).toHaveLength(1);
    expect(within(list()).getByText('Body n2')).toBeInTheDocument();
    expect(within(list()).getByText('Old news')).toBeInTheDocument();
  });

  it('is an empty page that says so', async () => {
    open([]);
    expect(await screen.findByText('You are all caught up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Mark all as read/ })).not.toBeInTheDocument();
  });

  it('says why it cannot load, and loads when retried', async () => {
    notificationApi.list.mockRejectedValueOnce(apiError('The server is busy'));
    renderApp('/dashboard/notifications', signedIn());
    expect(await screen.findByText('The server is busy')).toBeInTheDocument();

    notificationApi.list.mockResolvedValue(page([note('n1')]));
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Title n1')).toBeInTheDocument();
  });

  it('marks one as read when opened, updates the badge, and follows its link', async () => {
    notificationApi.unreadCount.mockResolvedValue(1);
    const view = open([note('n1', { title: 'Quote ready', data: { deepLink: '/dashboard/settings' } })]);
    fireEvent.click(await screen.findByRole('button', { name: /Quote ready/ }));

    await waitFor(() => expect(notificationApi.markRead).toHaveBeenCalledWith('n1'));
    await waitFor(() => expect(view.router.state.location.pathname).toBe('/dashboard/settings'));
  });

  it('only marks it read when it has no link', async () => {
    open([note('n1', { title: 'No link', data: {} })]);
    fireEvent.click(await screen.findByRole('button', { name: /No link/ }));
    await waitFor(() => expect(notificationApi.markRead).toHaveBeenCalledWith('n1'));
    expect(screen.queryByText(/\(unread\)/)).not.toBeInTheDocument();
  });

  it('ignores a link that leaves the app', async () => {
    const view = open([note('n1', { title: 'Outside', data: { deepLink: 'https://elsewhere.example/phish' } })]);
    fireEvent.click(await screen.findByRole('button', { name: /Outside/ }));
    await waitFor(() => expect(notificationApi.markRead).toHaveBeenCalled());
    expect(view.router.state.location.pathname).toBe('/dashboard/notifications');
  });

  it('does not ask the server again for one that is already read', async () => {
    open([note('n1', { title: 'Seen already', readAt: '2026-11-16T10:00:00.000Z' })]);
    fireEvent.click(await screen.findByRole('button', { name: /Seen already/ }));
    expect(notificationApi.markRead).not.toHaveBeenCalled();
  });

  it('marks everything read in one go and zeroes the badge', async () => {
    notificationApi.unreadCount.mockResolvedValue(2);
    open([note('n1'), note('n2')]);
    fireEvent.click(await screen.findByRole('button', { name: /Mark all as read/ }));

    await waitFor(() => expect(notificationApi.markAllRead).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText(/\(unread\)/)).not.toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Mark all as read/ })).not.toBeInTheDocument();
    expect(getCounts().notifications).toBe(0);
  });

  it('shows a new one at the top the moment the server pushes it, once', async () => {
    open([note('n1', { title: 'Earlier' })]);
    await screen.findByText('Earlier');

    const fresh = note('n2', { title: 'Just now' });
    act(() => rt.push('notification:new', { notification: fresh, unread: 2 }));
    await waitFor(() => expect(within(list()).getAllByRole('listitem')[0]).toHaveTextContent('Just now'));
    act(() => rt.push('notification:new', { notification: fresh, unread: 2 }));
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);
  });

  it('brings in more with Show more, without repeating any', async () => {
    notificationApi.list.mockResolvedValueOnce(page([note('n1', { title: 'First page' })], { page: 1, pages: 2 }));
    renderApp('/dashboard/notifications', signedIn());
    await screen.findByText('First page');

    notificationApi.list.mockResolvedValueOnce(page([note('n1', { title: 'First page' }), note('n0', { title: 'Second page' })], { page: 2, pages: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    expect(await screen.findByText('Second page')).toBeInTheDocument();
    expect(notificationApi.list).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    expect(within(list()).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('reloads after the connection comes back', async () => {
    open([note('n1', { title: 'Before' })]);
    await screen.findByText('Before');
    notificationApi.list.mockResolvedValue(page([note('n3', { title: 'Missed one' }), note('n1', { title: 'Before' })]));
    act(() => rt.status(true));
    expect(await screen.findByText('Missed one')).toBeInTheDocument();
  });
});

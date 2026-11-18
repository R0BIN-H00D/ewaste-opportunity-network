import { screen, within } from '@testing-library/react';
import { deviceApi } from '../services/deviceApi';
import { requestApi } from '../services/repairApi';
import { TECH, USER, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/chatApi', () => ({
  chatApi: { unreadCount: vi.fn().mockResolvedValue(0), list: vi.fn() },
  notificationApi: { unreadCount: vi.fn().mockResolvedValue(0), list: vi.fn() },
}));
vi.mock('../services/realtime', () => ({
  connectRealtime: vi.fn(), disconnectRealtime: vi.fn(), emitRealtime: vi.fn(), isRealtimeConnected: () => true, onRealtime: () => () => {}, onRealtimeStatus: () => () => {},
}));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn().mockResolvedValue([]) },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/repairApi', () => ({
  requestApi: { list: vi.fn(), get: vi.fn() },
  technicianApi: { setAvailability: vi.fn() },
}));
vi.mock('../services/announcementApi', () => ({ announcementApi: { list: vi.fn().mockResolvedValue([]) } }));

const page = (total) => ({ items: [], meta: { total, page: 1, pages: 1, limit: 1 } });
const TECH_ACTIVE = { ...TECH, status: 'active' };
const approved = { verification: { status: 'approved' } };

beforeEach(() => {
  vi.resetAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  deviceApi.list.mockResolvedValue(page(0));
  requestApi.list.mockResolvedValue(page(3));
});

const menu = () => within(screen.getByRole('complementary', { name: 'Dashboard navigation' }));

describe('the menu is different for each role', () => {
  it('gives a technician requests first, and leaves out what they do not use', async () => {
    renderApp('/dashboard', signedIn(TECH_ACTIVE, approved));
    await screen.findByText(/Hello, Asha/);
    const links = menu().getAllByRole('link').map((a) => a.textContent.trim());
    expect(links.slice(0, 4)).toEqual(['Profile', 'Overview', 'Find repair requests', 'My repair jobs']);
    expect(links).not.toContain('Settings');
    expect(menu().getByRole('link', { name: /Find repair requests/ })).toHaveAttribute('href', '/dashboard/requests?tab=board');
    expect(menu().queryByRole('link', { name: /^Orders/ })).not.toBeInTheDocument();
    expect(menu().queryByRole('link', { name: /Refurbishment/ })).not.toBeInTheDocument();
  });

  it('gives a member a short menu: devices, repairs, marketplace, orders, wanted devices and the rest', async () => {
    renderApp('/dashboard', signedIn(USER));
    await screen.findByText(/Hello, Asha/);
    const links = menu().getAllByRole('link').map((a) => a.textContent.trim());
    expect(links).toEqual(['Profile', 'My devices', 'My repairs', 'Marketplace', 'Orders', 'Wanted devices', 'Messages', 'Notifications', 'Pickups', 'Transactions', 'Report a problem']);
    expect(menu().queryByText('More')).not.toBeInTheDocument();
    expect(menu().getByRole('link', { name: 'Marketplace' })).toHaveAttribute('href', '/dashboard/marketplace');
  });
});

describe('the start page tells a new person what to do next', () => {
  it('sends a member with no devices to list their first one', async () => {
    renderApp('/dashboard', signedIn(USER));
    expect(await screen.findByRole('heading', { name: 'Start by listing your first device' })).toBeInTheDocument();
    screen.getAllByRole('link', { name: /List a device/ }).forEach((a) => expect(a).toHaveAttribute('href', '/list-device'));
  });

  it('does not put a "requests are waiting" box on the technician overview', async () => {
    renderApp('/dashboard', signedIn(TECH_ACTIVE, approved));
    await screen.findByText(/Hello, Asha/);
    expect(screen.queryByRole('heading', { name: /repair requests? (is|are) waiting for you/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /See open requests/ })).not.toBeInTheDocument();
    expect(requestApi.list).not.toHaveBeenCalledWith({ as: 'board', limit: 1 }, expect.anything());
  });

  it('asks an unverified technician to get verified first, and does not ask for requests', async () => {
    renderApp('/dashboard', signedIn(TECH, { verification: { status: 'not_submitted' } }));
    expect(await screen.findByText(/Get verified to start/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Submit documents' })).toBeInTheDocument();
    expect(requestApi.list).not.toHaveBeenCalled();
  });
});

describe('the Profile link', () => {
  it.each([['user', USER], ['technician', TECH_ACTIVE], ['refurbisher', { ...USER, role: 'refurbisher' }], ['recycler', { ...USER, role: 'recycler' }]])(
    'is the first thing in the side panel for a %s, and replaces Settings',
    async (_role, who) => {
      renderApp('/dashboard/messages', signedIn(who, approved));
      await screen.findByRole('complementary', { name: 'Dashboard navigation' });
      const links = menu().getAllByRole('link');
      expect(links[0]).toHaveTextContent('Profile');
      expect(links[0]).toHaveAttribute('href', '/dashboard/settings');
      expect(menu().queryByRole('link', { name: /Settings/ })).not.toBeInTheDocument();
    },
  );
});

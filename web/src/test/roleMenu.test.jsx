import { screen, waitFor, within } from '@testing-library/react';
import { deviceApi } from '../services/deviceApi';
import { requestApi } from '../services/repairApi';
import { homePathFor, isLockedProvider } from '../store/authSlice';
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
    expect(links.slice(0, 4)).toEqual(['Overview', 'Find repair requests', 'My repair jobs', 'Profile']); // Profile sits under My repair jobs
    expect(links).not.toContain('Settings');
    expect(links).not.toContain('My devices'); // a technician has no devices of their own to list
    expect(menu().getByRole('link', { name: /Find repair requests/ })).toHaveAttribute('href', '/dashboard/find-requests');
    expect(menu().queryByRole('link', { name: /^Orders/ })).not.toBeInTheDocument();
    expect(menu().queryByRole('link', { name: /Refurbishment/ })).not.toBeInTheDocument();
  });

  it('gives a member a short menu: devices, repairs, marketplace, orders, wanted devices and the rest', async () => {
    renderApp('/dashboard', signedIn(USER));
    await screen.findByText(/Hello, Asha/);
    const links = menu().getAllByRole('link').map((a) => a.textContent.trim());
    expect(links).toEqual(['My devices', 'My repairs', 'Marketplace', 'Orders', 'Wanted devices', 'Profile', 'Messages', 'Notifications', 'Pickups', 'Transactions', 'Report a problem']);
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

});

describe('where people land, and who is locked', () => {
  it('sends a new technician, refurbisher or recycler to the verification box after sign-up, and a new member to their profile', () => {
    for (const role of ['technician', 'refurbisher', 'recycler']) expect(homePathFor(role, true)).toBe('/dashboard/settings#verification');
    expect(homePathFor('user', true)).toBe('/dashboard/settings#profile');
  });

  it('sends everyone to the dashboard when they log in, so a verified provider is never taken to the profile page', () => {
    for (const role of ['user', 'technician', 'refurbisher', 'recycler', 'admin']) expect(homePathFor(role)).toBe('/dashboard');
  });

  it('locks only a provider that is not approved', () => {
    expect(isLockedProvider({ role: 'technician' }, { status: 'pending' })).toBe(true);
    expect(isLockedProvider({ role: 'recycler' }, null)).toBe(true);
    expect(isLockedProvider({ role: 'refurbisher' }, { status: 'approved' })).toBe(false);
    expect(isLockedProvider({ role: 'user' }, null)).toBe(false);
    expect(isLockedProvider({ role: 'admin' }, null)).toBe(false);
  });
});

describe('an account that is not verified yet (technician, refurbisher, recycler)', () => {
  const PROVIDERS = [['technician', { ...TECH }], ['refurbisher', { ...TECH, role: 'refurbisher' }], ['recycler', { ...TECH, role: 'recycler' }]];
  const waiting = (who, status = 'not_submitted') => signedIn(who, { verification: { status } });

  it.each(PROVIDERS)('sends a %s who opens the dashboard to the profile page to verify', async (_role, who) => {
    const { router } = renderApp('/dashboard', waiting(who));
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard/settings');
    expect(requestApi.list).not.toHaveBeenCalled();
  });

  it.each(PROVIDERS)('locks the side menu of a %s except Profile and Report a problem', async (_role, who) => {
    renderApp('/dashboard/settings', waiting(who));
    await screen.findByRole('heading', { level: 1, name: 'Profile' });
    const links = menu().getAllByRole('link').map((a) => a.textContent.trim());
    expect(links).toEqual(['Profile', 'Report a problem']);
    const locked = menu().getAllByText(/locked until your account is verified/);
    expect(locked.length).toBeGreaterThan(2);
    locked.forEach((el) => expect(el.closest('[aria-disabled="true"]')).not.toBeNull());
  });

  it('keeps a locked account away from the pages that are locked, even by typing the address', async () => {
    const { router } = renderApp('/dashboard/my-jobs', waiting(TECH));
    await screen.findByRole('heading', { level: 1, name: 'Profile' });
    expect(router.state.location.pathname).toBe('/dashboard/settings');
    expect(requestApi.list).not.toHaveBeenCalled();
  });

  it('still lets a locked account report a problem', async () => {
    const { router } = renderApp('/dashboard/complaints', waiting(TECH));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard/complaints'));
  });

  it('explains on the profile page why most of the dashboard is locked, and what is being waited for', async () => {
    const first = renderApp('/dashboard/settings', waiting(TECH));
    expect(await screen.findByText(/Until then only your profile and Report a problem are open/)).toBeInTheDocument();
    first.unmount();
    renderApp('/dashboard/settings', waiting(TECH, 'pending'));
    expect(await screen.findByText(/Your documents are being reviewed/)).toBeInTheDocument();
  });

  it('shows no notification bell while locked', async () => {
    renderApp('/dashboard/settings', waiting(TECH));
    await screen.findByRole('heading', { level: 1, name: 'Profile' });
    expect(screen.queryByRole('link', { name: /Open notifications/ })).not.toBeInTheDocument();
  });

  it.each(PROVIDERS)('opens everything for a %s once an administrator has approved them, with no detour to the profile page', async (_role, who) => {
    const { router } = renderApp('/dashboard/messages', signedIn({ ...who, status: 'active' }, { verification: { status: 'approved' } }));
    await waitFor(() => expect(menu().getAllByRole('link').length).toBeGreaterThan(4));
    expect(menu().queryByText(/locked until your account is verified/)).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/dashboard/messages'); // not sent to the profile page
  });
});

describe('the Profile link', () => {
  it.each([['user', USER], ['technician', TECH_ACTIVE], ['refurbisher', { ...USER, role: 'refurbisher' }], ['recycler', { ...USER, role: 'recycler' }]])(
    'has a Profile link in the side panel for a %s, and replaces Settings',
    async (_role, who) => {
      renderApp('/dashboard/messages', signedIn(who, approved));
      await screen.findByRole('complementary', { name: 'Dashboard navigation' });
      expect(menu().getByRole('link', { name: 'Profile' })).toHaveAttribute('href', '/dashboard/settings');
      expect(menu().queryByRole('link', { name: /Settings/ })).not.toBeInTheDocument();
    },
  );
});

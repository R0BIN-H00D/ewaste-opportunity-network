import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { deviceApi } from '../services/deviceApi';
import { adminDashboardApi, adminMonitorApi } from '../services/adminApi';
import { monitorStatusLabel, monitorStatusTone } from '../lib/admin';
import { USER, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/adminApi', () => ({
  adminDashboardApi: { get: vi.fn() },
  adminMonitorApi: { list: vi.fn() },
  adminListingApi: { list: vi.fn(), moderate: vi.fn() },
  adminReviewApi: { list: vi.fn(), setStatus: vi.fn() },
  adminReportApi: { list: vi.fn(), get: vi.fn(), decide: vi.fn() },
  adminCategoryApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), remove: vi.fn() },
  adminUserApi: { list: vi.fn(), get: vi.fn(), setStatus: vi.fn() },
  adminVerificationApi: { list: vi.fn(), get: vi.fn(), decide: vi.fn(), document: vi.fn() },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const ADMIN = { ...USER, _id: 'a1', name: 'Chief Admin', role: 'admin' };
const flow = (total, open, completed, stopped = 0) => ({ total, open, completed, stopped });
const overview = (over = {}) => ({
  generatedAt: '2026-11-15T10:00:00.000Z',
  people: { total: 42, active: 36, suspended: 2, waitingForVerification: 4, newThisMonth: 7, byRole: { user: 20, technician: 9, refurbisher: 4, recycler: 3 } },
  centres: { total: 3, authorised: 2 },
  listings: { total: 31, listed: 20, inService: 5, byStatus: { listed: 20, in_service: 5, withdrawn: 6 } },
  services: { repairs: flow(12, 5, 6, 1), donations: flow(8, 3, 5), refurbishment: flow(4, 2, 2), recycling: flow(6, 1, 4, 1), completed: 17 },
  marketplace: { activeProducts: 9, orders: 11 },
  attention: { pendingVerifications: { providers: 3, recipients: 1, total: 4 }, openReports: 2, openComplaints: 5 },
  recentActivity: [
    { _id: 'l1', action: 'user.suspended', reason: 'Repeated no-shows', at: '2026-11-15T09:00:00.000Z', admin: { _id: 'a1', name: 'Chief Admin' }, targetType: 'User', targetId: 'u1' },
    { _id: 'l2', action: 'verification.approved', reason: '', at: '2026-11-14T09:00:00.000Z', admin: null, targetType: 'User', targetId: 'u2' },
  ],
  ...over,
});

const STATUSES = ['request_submitted', 'repair_in_progress', 'service_completed', 'cancelled'];
const entry = (over = {}) => ({
  _id: 'r1', kind: 'repairs', reference: 'REQ-A1B2C3', title: 'Dell monitor', status: 'repair_in_progress',
  createdAt: '2026-11-10T08:00:00.000Z', updatedAt: '2026-11-11T08:00:00.000Z',
  parties: [{ role: 'Customer', name: 'Asha Rao', id: 'u1' }, { role: 'Technician', name: 'Meera Nair', id: 'u2' }], ...over,
});
const list = (items, meta = {}) => ({
  items,
  meta: { total: items.length, page: 1, pages: 1, limit: 10, statuses: STATUSES, byStatus: { request_submitted: 1, repair_in_progress: 2, service_completed: 0, cancelled: 3 }, ...meta },
});
const apiError = (message, status = 500) => Object.assign(new Error(message), { response: { status, data: { message } } });

beforeEach(() => {
  vi.resetAllMocks();
  setAccessToken(null);
  deviceApi.list.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pages: 1, limit: 1 } });
  adminDashboardApi.get.mockResolvedValue(overview());
  adminMonitorApi.list.mockResolvedValue(list([entry()]));
});

describe('monitor words', () => {
  it('writes statuses in plain words and colours them by outcome', () => {
    expect(monitorStatusLabel('device_delivery_pending')).toBe('Device delivery pending');
    expect(monitorStatusLabel('')).toBe('');
    expect(monitorStatusTone('service_completed')).toBe('green');
    expect(monitorStatusTone('cancelled')).toBe('red');
    expect(monitorStatusTone('disputed')).toBe('red');
    expect(monitorStatusTone('repair_in_progress')).toBe('blue');
  });
});

describe('admin overview', () => {
  it('is the admin home, with the new Monitors link in the menu', async () => {
    renderApp('/dashboard', signedIn(ADMIN));
    expect(await screen.findByRole('heading', { name: 'Platform overview' })).toBeInTheDocument();
    const nav = screen.getByRole('complementary', { name: 'Dashboard navigation' });
    expect(within(nav).getByRole('link', { name: /Monitors/ })).toHaveAttribute('href', '/dashboard/admin/monitors');
    expect(screen.queryByText(/Quick actions/)).not.toBeInTheDocument();
  });

  it('shows what needs attention, with the verification tile leading to the queue', async () => {
    renderApp('/dashboard', signedIn(ADMIN));
    const tile = await screen.findByRole('link', { name: /Verifications waiting/ });
    expect(tile).toHaveAttribute('href', '/dashboard/admin/verifications');
    expect(tile).toHaveTextContent('4');
    expect(tile).toHaveTextContent('3 providers · 1 recipient organisation');
    const reports = screen.getByRole('link', { name: /^Open reports/ });
    expect(reports).toHaveAttribute('href', '/dashboard/admin/reports');
    expect(reports).toHaveTextContent('2');
    const complaints = screen.getByRole('link', { name: /^Open complaints/ });
    expect(complaints).toHaveAttribute('href', '/dashboard/admin/complaints');
    expect(complaints).toHaveTextContent('5');
  });

  it('shows the people tiles, each leading to the filtered user list', async () => {
    renderApp('/dashboard', signedIn(ADMIN));
    const accounts = await screen.findByRole('link', { name: /^Accounts/ });
    expect(accounts).toHaveAttribute('href', '/dashboard/admin/users');
    expect(accounts).toHaveTextContent('42');
    expect(accounts).toHaveTextContent('7 joined this month');
    expect(screen.getByRole('link', { name: /^Active/ })).toHaveAttribute('href', '/dashboard/admin/users?status=active');
    expect(screen.getByRole('link', { name: /^Suspended/ })).toHaveAttribute('href', '/dashboard/admin/users?status=suspended');
    expect(screen.getByRole('link', { name: /^Waiting for verification/ })).toHaveAttribute('href', '/dashboard/admin/users?status=pending_verification');
    const technicians = screen.getByRole('link', { name: /^Technicians/ });
    expect(technicians).toHaveAttribute('href', '/dashboard/admin/users?role=technician');
    expect(technicians).toHaveTextContent('9');
    const centres = screen.getByRole('link', { name: /^Recycling centres/ });
    expect(centres).toHaveAttribute('href', '/dashboard/admin/users?role=recycler');
    expect(centres).toHaveTextContent('2 authorised');
  });

  it('shows listings and the four services, each with open and completed counts and a link to its monitor', async () => {
    renderApp('/dashboard', signedIn(ADMIN));
    const repairs = await screen.findByRole('link', { name: /^Repairs/ });
    expect(repairs).toHaveAttribute('href', '/dashboard/admin/monitors/repairs');
    expect(repairs).toHaveTextContent('12');
    expect(repairs).toHaveTextContent('5 open · 6 completed');
    expect(screen.getByRole('link', { name: /^Donations/ })).toHaveAttribute('href', '/dashboard/admin/monitors/donations');
    expect(screen.getByRole('link', { name: /^Refurbishment jobs/ })).toHaveAttribute('href', '/dashboard/admin/monitors/refurbishment');
    expect(screen.getByRole('link', { name: /^Recycling requests/ })).toHaveAttribute('href', '/dashboard/admin/monitors/recycling');
    expect(screen.getByText('Device listings').closest('li')).toHaveTextContent('20 live · 5 in service');
    expect(screen.getByText('Completed services').closest('li')).toHaveTextContent('17');
    expect(screen.getByText('Marketplace').closest('li')).toHaveTextContent('9products for sale · 11 orders');
  });

  it('lists the latest admin actions in plain words, with the reason and who did it', async () => {
    renderApp('/dashboard', signedIn(ADMIN));
    const section = (await screen.findByRole('heading', { name: 'Latest admin actions' })).closest('section');
    expect(within(section).getByText('Suspended the account')).toBeInTheDocument();
    expect(within(section).getByText('Repeated no-shows')).toBeInTheDocument();
    expect(within(section).getByText(/Chief Admin/)).toBeInTheDocument();
    expect(within(section).getByText('Approved the submission')).toBeInTheDocument();
  });

  it('says so when no administrator action has been recorded', async () => {
    adminDashboardApi.get.mockResolvedValue(overview({ recentActivity: [] }));
    renderApp('/dashboard', signedIn(ADMIN));
    expect(await screen.findByText('No administrator action has been recorded yet.')).toBeInTheDocument();
  });

  it('refreshes the numbers on request', async () => {
    renderApp('/dashboard', signedIn(ADMIN));
    await screen.findByRole('heading', { name: 'Platform overview' });
    adminDashboardApi.get.mockResolvedValue(overview({ attention: { pendingVerifications: { providers: 0, recipients: 0, total: 0 }, openReports: 0, openComplaints: 0 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(screen.getByRole('link', { name: /Verifications waiting/ })).toHaveTextContent('0 providers · 0 recipient organisations'));
    expect(adminDashboardApi.get).toHaveBeenCalledTimes(2);
  });

  it('offers a retry when the overview cannot load', async () => {
    adminDashboardApi.get.mockRejectedValueOnce(apiError('Server went away'));
    renderApp('/dashboard', signedIn(ADMIN));
    expect(await screen.findByText('Could not load the overview')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Platform overview' })).toBeInTheDocument();
  });

  it('is not shown to anyone but an administrator', async () => {
    renderApp('/dashboard', signedIn(USER));
    expect(await screen.findByText(/Quick actions/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Platform overview' })).not.toBeInTheDocument();
    expect(adminDashboardApi.get).not.toHaveBeenCalled();
    expect(screen.queryByRole('link', { name: /Monitors/ })).not.toBeInTheDocument();
  });
});

describe('monitors', () => {
  it('opens on repairs and shows each entry with its reference, people and status', async () => {
    renderApp('/dashboard/admin/monitors', signedIn(ADMIN));
    const row = (await screen.findByText('Dell monitor')).closest('article');
    expect(within(row).getByText('REQ-A1B2C3')).toBeInTheDocument();
    expect(within(row).getByText('Repair in progress')).toBeInTheDocument();
    expect(within(row).getByText('Customer: Asha Rao · Technician: Meera Nair')).toBeInTheDocument();
    expect(adminMonitorApi.list).toHaveBeenCalledWith('repairs', expect.objectContaining({ page: 1, limit: 10 }), expect.anything());
    expect(screen.getByRole('status')).toHaveTextContent('1 entry');
  });

  it('offers a tab for every flow and loads the one chosen', async () => {
    renderApp('/dashboard/admin/monitors', signedIn(ADMIN));
    await screen.findByText('Dell monitor');
    const tabs = within(screen.getByRole('navigation', { name: 'Monitors' }));
    expect(tabs.getAllByRole('link').map((a) => a.textContent)).toEqual(['Repairs', 'Donations', 'Refurbishment', 'Recycling', 'Payments']);
    adminMonitorApi.list.mockResolvedValue(list([entry({ _id: 'd1', kind: 'donations', reference: 'DON-2026-ABC123', title: 'Old laptop', status: 'completed', parties: [{ role: 'Donor', name: 'Asha Rao' }, { role: 'Recipient', name: 'Sunrise School' }] })], { statuses: ['open', 'completed'], byStatus: { open: 0, completed: 1 } }));
    fireEvent.click(tabs.getByRole('link', { name: 'Donations' }));
    expect(await screen.findByText('Old laptop')).toBeInTheDocument();
    expect(screen.getByText('Donor: Asha Rao · Recipient: Sunrise School')).toBeInTheDocument();
    expect(adminMonitorApi.list).toHaveBeenLastCalledWith('donations', expect.anything(), expect.anything());
  });

  it('shows the amount and how a payment was made', async () => {
    adminMonitorApi.list.mockResolvedValue(list([entry({ kind: 'transactions', reference: 'UPI-5521', title: 'Repair', status: 'confirmed', amount: 1200, method: 'cod', parties: [{ role: 'Payer', name: 'Asha Rao' }, { role: 'Payee', name: 'Meera Nair' }] })], { statuses: ['recorded', 'confirmed', 'disputed'], byStatus: { recorded: 0, confirmed: 1, disputed: 0 } }));
    renderApp('/dashboard/admin/monitors/transactions', signedIn(ADMIN));
    const row = (await screen.findByText('UPI-5521')).closest('article');
    expect(row).toHaveTextContent('1,200');
    expect(row).toHaveTextContent('cash on delivery');
    expect(row).toHaveTextContent('Confirmed');
  });

  it('says "No payment" for a free hand-over instead of showing a zero', async () => {
    adminMonitorApi.list.mockResolvedValue(list([entry({ kind: 'transactions', reference: 'TXN-1AE42C', title: 'Donation', status: 'confirmed', amount: 0, method: 'offline' })], { statuses: ['recorded', 'confirmed', 'disputed'], byStatus: { recorded: 0, confirmed: 1, disputed: 0 } }));
    renderApp('/dashboard/admin/monitors/transactions', signedIn(ADMIN));
    const row = (await screen.findByText('TXN-1AE42C')).closest('article');
    expect(row).toHaveTextContent('No payment');
    expect(row).not.toHaveTextContent('paid offline');
  });

  it('shows status chips with counts, hides empty ones, and filters when one is chosen', async () => {
    renderApp('/dashboard/admin/monitors', signedIn(ADMIN));
    await screen.findByText('Dell monitor');
    const group = within(screen.getByRole('group', { name: 'Filter by status' }));
    expect(group.getByRole('button', { name: 'All' })).toHaveAttribute('aria-pressed', 'true');
    expect(group.getByRole('button', { name: 'Repair in progress (2)' })).toBeInTheDocument();
    expect(group.getByRole('button', { name: 'Cancelled (3)' })).toBeInTheDocument();
    expect(group.queryByRole('button', { name: /Service completed/ })).not.toBeInTheDocument();
    fireEvent.click(group.getByRole('button', { name: 'Cancelled (3)' }));
    await waitFor(() => expect(adminMonitorApi.list).toHaveBeenLastCalledWith('repairs', expect.objectContaining({ status: 'cancelled' }), expect.anything()));
    expect(await screen.findByRole('button', { name: 'Cancelled (3)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    await waitFor(() => expect(adminMonitorApi.list).toHaveBeenLastCalledWith('repairs', expect.objectContaining({ status: '' }), expect.anything()));
  });

  it('filters by date and clears the filters', async () => {
    renderApp('/dashboard/admin/monitors', signedIn(ADMIN));
    await screen.findByText('Dell monitor');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    await waitFor(() => expect(adminMonitorApi.list).toHaveBeenLastCalledWith('repairs', expect.objectContaining({ from: '2026-11-01' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-30' } });
    await waitFor(() => expect(adminMonitorApi.list).toHaveBeenLastCalledWith('repairs', expect.objectContaining({ from: '2026-11-01', to: '2026-11-30' }), expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(adminMonitorApi.list).toHaveBeenLastCalledWith('repairs', expect.objectContaining({ from: '', to: '' }), expect.anything()));
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
  });

  it('does not ask the server when the end date is before the start date', async () => {
    renderApp('/dashboard/admin/monitors', signedIn(ADMIN));
    await screen.findByText('Dell monitor');
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-20' } });
    await waitFor(() => expect(adminMonitorApi.list).toHaveBeenLastCalledWith('repairs', expect.objectContaining({ from: '2026-11-20' }), expect.anything()));
    const calls = adminMonitorApi.list.mock.calls.length;
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('The end date must not be before the start date.');
    expect(adminMonitorApi.list.mock.calls.length).toBe(calls);
  });

  it('says so when a filter matches nothing, and when the list is empty', async () => {
    adminMonitorApi.list.mockResolvedValue(list([], { byStatus: {} }));
    renderApp('/dashboard/admin/monitors/recycling?status=cancelled', signedIn(ADMIN));
    expect(await screen.findByText('Nothing matches these filters')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });

  it('moves between pages', async () => {
    adminMonitorApi.list.mockResolvedValue(list([entry()], { total: 25, pages: 3 }));
    renderApp('/dashboard/admin/monitors', signedIn(ADMIN));
    await screen.findByText('Dell monitor');
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(adminMonitorApi.list).toHaveBeenLastCalledWith('repairs', expect.objectContaining({ page: 2 }), expect.anything()));
  });

  it('offers a retry when the list cannot load', async () => {
    adminMonitorApi.list.mockRejectedValueOnce(apiError('Server went away'));
    renderApp('/dashboard/admin/monitors', signedIn(ADMIN));
    expect(await screen.findByText('Could not load this list')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Dell monitor')).toBeInTheDocument();
  });

  it('is blocked for people who are not administrators', async () => {
    renderApp('/dashboard/admin/monitors', signedIn(USER));
    expect(await screen.findByText('This area is not available for your account')).toBeInTheDocument();
    expect(adminMonitorApi.list).not.toHaveBeenCalled();
  });
});

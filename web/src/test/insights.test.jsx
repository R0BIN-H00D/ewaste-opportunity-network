import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { deviceApi } from '../services/deviceApi';
import { announcementApi } from '../services/announcementApi';
import { adminAnalyticsApi, adminDashboardApi, adminExportApi } from '../services/adminApi';
import { saveBlob } from '../lib/download';
import { actionLabel, auditTargetLabel, auditTargetLink } from '../lib/admin';
import { kg, monthLabel, number, percent } from '../lib/analytics';
import { USER, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/adminApi', () => ({
  adminDashboardApi: { get: vi.fn() },
  adminAnalyticsApi: { get: vi.fn() },
  adminExportApi: { download: vi.fn() },
}));
vi.mock('../lib/download', () => ({ saveBlob: vi.fn() }));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));
// Recharts measures real layout, which jsdom does not have. The numbers are checked through the table view instead.
vi.mock('recharts', () => {
  const Nothing = () => null;
  return { Bar: Nothing, BarChart: Nothing, CartesianGrid: Nothing, LabelList: Nothing, Line: Nothing, LineChart: Nothing, ResponsiveContainer: Nothing, Tooltip: Nothing, XAxis: Nothing, YAxis: Nothing };
});

const ADMIN = { ...USER, _id: 'a1', name: 'Chief Admin', role: 'admin' };
const apiError = (message, status = 409, code) => Object.assign(new Error(message), { response: { status, data: { message, code } } });

const analytics = (o = {}) => ({
  period: { months: 12, from: '2026-09', to: '2026-11' },
  registrations: {
    total: 14, byRole: {},
    series: [{ month: '2026-09', members: 3, providers: 1, total: 4 }, { month: '2026-10', members: 4, providers: 2, total: 6 }, { month: '2026-11', members: 3, providers: 1, total: 4 }],
  },
  growth: [{ month: '2026-09', total: 104 }, { month: '2026-10', total: 110 }, { month: '2026-11', total: 114 }],
  activity: [{ month: '2026-09', repairs: 5, donations: 2, refurbishment: 1, recycling: 2 }, { month: '2026-10', repairs: 7, donations: 3, refurbishment: 2, recycling: 2 }, { month: '2026-11', repairs: 8, donations: 3, refurbishment: 2, recycling: 2 }],
  services: { repairs: { created: 20, completed: 10 }, donations: { created: 8, completed: 4 }, refurbishment: { created: 5, completed: 0 }, recycling: { created: 6, completed: 3 } },
  categories: [{ name: 'Laptops', count: 7 }, { name: 'Phones', count: 3 }],
  donations: { offered: 8, completed: 4, series: [{ month: '2026-09', offered: 2, completed: 1 }, { month: '2026-10', offered: 3, completed: 1 }, { month: '2026-11', offered: 3, completed: 2 }] },
  recycling: { requests: 6, completed: 3, devices: 9, series: [{ month: '2026-09', requests: 2, completed: 1 }, { month: '2026-10', requests: 2, completed: 1 }, { month: '2026-11', requests: 2, completed: 1 }] },
  impact: { events: 3, devices: 9, weighedKg: 12.5, estimatedKg: 30, co2eEstimateKg: 40 },
  generatedAt: '2026-11-15T08:00:00.000Z',
  ...o,
});

beforeEach(() => {
  vi.resetAllMocks();
  setAccessToken(null);
  sessionStorage.clear();
  deviceApi.list.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pages: 1, limit: 1 } });
  adminDashboardApi.get.mockReturnValue(new Promise(() => {}));
  announcementApi.list.mockResolvedValue([]);
  adminAnalyticsApi.get.mockResolvedValue(analytics());
});

describe('words and numbers', () => {
  it('labels the new audit entries', () => {
    expect(actionLabel('export.downloaded')).toBe('Downloaded a data file');
    expect(auditTargetLabel('Export')).toBe('Data file');
    expect(auditTargetLink('Export', 'x')).toBe('');
  });

  it('formats months, counts, weights and rates', () => {
    expect(monthLabel('2026-11', 'long')).toBe('November 2026');
    expect(monthLabel('2026-01')).toBe('Jan ’26');
    expect(number(1234567)).toBe('12,34,567');
    expect(kg(12.5)).toBe('12.5 kg');
    expect(percent(1, 4)).toBe('25%');
    expect(percent(0, 0)).toBe('—');
  });
});

describe('access', () => {
  it('adds Analytics to the administrator menu', async () => {
    renderApp('/dashboard/admin/analytics', signedIn(ADMIN));
    const menu = within(await screen.findByRole('complementary', { name: 'Dashboard navigation' }));
    expect(menu.getByRole('link', { name: /Analytics/ })).toHaveAttribute('href', '/dashboard/admin/analytics');
  });

  it.each(['analytics'])('keeps everyone else out of /dashboard/admin/%s', async (path) => {
    renderApp(`/dashboard/admin/${path}`, signedIn(USER));
    expect(await screen.findByRole('heading', { name: 'This area is not available for your account' })).toBeInTheDocument();
    expect(adminAnalyticsApi.get).not.toHaveBeenCalled();
  });
});

describe('analytics page', () => {
  it('shows the headline numbers and keeps weighed and estimated amounts apart', async () => {
    renderApp('/dashboard/admin/analytics', signedIn(ADMIN));
    expect(await screen.findByRole('heading', { name: 'Analytics' })).toBeInTheDocument();
    const tiles = within(await screen.findByRole('list', { name: 'Headline numbers' }));
    expect(tiles.getByText('New sign-ups').parentElement).toHaveTextContent('14');
    expect(tiles.getByText('People on the platform').parentElement).toHaveTextContent('114');
    expect(tiles.getByText('Services completed').parentElement).toHaveTextContent('17');
    expect(tiles.getByText('Services completed').parentElement).toHaveTextContent('of 39 started');
    expect(tiles.getByText('Devices recycled').parentElement).toHaveTextContent('9');

    const impact = within(screen.getByRole('region', { name: 'Verified environmental impact' }));
    expect(impact.getByText('Weighed materials').nextSibling).toHaveTextContent('12.5 kg');
    expect(impact.getByText('Estimated materials').nextSibling).toHaveTextContent('30 kg');
    expect(impact.getByText('CO₂e (estimate)')).toBeInTheDocument();
  });

  it('asks for 12 months first and again when the period changes', async () => {
    renderApp('/dashboard/admin/analytics', signedIn(ADMIN));
    await screen.findByRole('list', { name: 'Headline numbers' });
    expect(adminAnalyticsApi.get.mock.calls[0][0]).toEqual({ months: 12 });
    fireEvent.change(screen.getByLabelText('Period'), { target: { value: '6' } });
    await waitFor(() => expect(adminAnalyticsApi.get.mock.calls.some((c) => c[0].months === 6)).toBe(true));
  });

  it('offers every chart as a table with the same numbers', async () => {
    renderApp('/dashboard/admin/analytics', signedIn(ADMIN));
    const card = (await screen.findByRole('heading', { name: 'New sign-ups by month' })).closest('section');
    fireEvent.click(within(card).getByRole('button', { name: 'Show as a table' }));
    const row = within(card).getByRole('row', { name: /October 2026/ });
    expect(row).toHaveTextContent('4');
    expect(row).toHaveTextContent('6');
    fireEvent.click(within(card).getByRole('button', { name: 'Show the chart' }));
    expect(within(card).queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows a completion rate for each service', async () => {
    renderApp('/dashboard/admin/analytics', signedIn(ADMIN));
    const table = await screen.findByRole('table', { name: /How many services reach the end/ });
    expect(within(table).getByRole('row', { name: /Repairs/ })).toHaveTextContent('50%');
    expect(within(table).getByRole('row', { name: /Refurbishment/ })).toHaveTextContent('0%');
  });

  it('says so when nothing was listed', async () => {
    adminAnalyticsApi.get.mockResolvedValue(analytics({ categories: [] }));
    renderApp('/dashboard/admin/analytics', signedIn(ADMIN));
    expect(await screen.findByText(/No devices were listed/)).toBeInTheDocument();
  });

  it('offers a retry when the numbers cannot be loaded', async () => {
    adminAnalyticsApi.get.mockRejectedValueOnce(apiError('Server error', 500));
    renderApp('/dashboard/admin/analytics', signedIn(ADMIN));
    expect(await screen.findByText('Could not load the analytics')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('list', { name: 'Headline numbers' })).toBeInTheDocument();
  });
});

describe('data downloads', () => {
  const blob = new Blob(['a,b']);
  const open = async () => {
    renderApp('/dashboard/admin/analytics', signedIn(ADMIN));
    return screen.findByRole('region', { name: 'Download data' });
  };

  it('downloads the people file with the chosen filters and saves it', async () => {
    adminExportApi.download.mockResolvedValue({ blob, filename: 'users-2026-11-15.csv', rows: 12, truncated: false });
    const panel = within(await open());
    fireEvent.change(panel.getByLabelText('Role'), { target: { value: 'technician' } });
    fireEvent.change(panel.getByLabelText('From'), { target: { value: '2026-10-01' } });
    fireEvent.click(panel.getByRole('button', { name: /Download CSV/ }));
    expect(await panel.findByText(/Downloaded users-2026-11-15\.csv with 12 rows/)).toBeInTheDocument();
    expect(adminExportApi.download).toHaveBeenCalledWith('users', { role: 'technician', status: '', from: '2026-10-01', to: '' });
    expect(saveBlob).toHaveBeenCalledWith(blob, 'users-2026-11-15.csv');
    expect(panel.queryByText(/Only the first/)).not.toBeInTheDocument();
  });

  it('offers only the filters a file can use', async () => {
    const panel = within(await open());
    expect(panel.getByLabelText('Role')).toBeInTheDocument();
    fireEvent.change(panel.getByLabelText('What to download'), { target: { value: 'recycling' } });
    expect(panel.queryByLabelText('Role')).not.toBeInTheDocument();
    expect(panel.queryByLabelText('Status')).not.toBeInTheDocument();
    expect(panel.getByLabelText('From')).toBeInTheDocument();
    fireEvent.change(panel.getByLabelText('What to download'), { target: { value: 'listings' } });
    expect(panel.getByLabelText('Status')).toBeInTheDocument();
    expect(panel.queryByLabelText('Role')).not.toBeInTheDocument();
  });

  it('does not send filters the chosen file does not take', async () => {
    adminExportApi.download.mockResolvedValue({ blob, filename: 'recycling-2026-11-15.csv', rows: 1, truncated: false });
    const panel = within(await open());
    fireEvent.change(panel.getByLabelText('Role'), { target: { value: 'refurbisher' } });
    fireEvent.change(panel.getByLabelText('What to download'), { target: { value: 'recycling' } });
    fireEvent.click(panel.getByRole('button', { name: /Download CSV/ }));
    expect(await panel.findByText(/Downloaded recycling-2026-11-15\.csv with 1 row\./)).toBeInTheDocument();
    expect(adminExportApi.download).toHaveBeenCalledWith('recycling', { from: '', to: '' });
  });

  it('refuses an end date before the start date without asking the server', async () => {
    const panel = within(await open());
    fireEvent.change(panel.getByLabelText('From'), { target: { value: '2026-11-10' } });
    fireEvent.change(panel.getByLabelText('To'), { target: { value: '2026-11-01' } });
    fireEvent.click(panel.getByRole('button', { name: /Download CSV/ }));
    expect(await panel.findByText('The end date must not be before the start date.')).toBeInTheDocument();
    expect(adminExportApi.download).not.toHaveBeenCalled();
    expect(saveBlob).not.toHaveBeenCalled();
  });

  it('tells the administrator when a file was cut short', async () => {
    adminExportApi.download.mockResolvedValue({ blob, filename: 'users-2026-11-15.csv', rows: 10000, truncated: true });
    const panel = within(await open());
    fireEvent.click(panel.getByRole('button', { name: /Download CSV/ }));
    expect(await panel.findByText(/Only the first 10,000 rows/)).toBeInTheDocument();
  });

  it('shows the server’s reason when a download fails and saves nothing', async () => {
    adminExportApi.download.mockRejectedValue(apiError('This export does not use that filter', 422));
    const panel = within(await open());
    fireEvent.click(panel.getByRole('button', { name: /Download CSV/ }));
    expect(await panel.findByText(/does not use that filter/)).toBeInTheDocument();
    expect(saveBlob).not.toHaveBeenCalled();
  });
});

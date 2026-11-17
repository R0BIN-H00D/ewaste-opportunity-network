import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { categoryItems, hasValues, yearlyItems } from '../lib/impact';
import { impactApi } from '../services/impactApi';
import GreenRing from '../components/impact/GreenRing';
import ImpactStrip from '../components/impact/ImpactStrip';
import { MemoryRouter } from 'react-router-dom';
import { badgeProgress, isEmptyImpact, monthlyRows, monthlyTable, nextLevelText, signedPoints, typeSeries } from '../lib/impact';
import { USER, anonymous, renderApp, signedIn } from './helpers';

// jsdom has no ResizeObserver, which Recharts needs. The numbers are checked through the chart's table instead.
vi.mock('recharts', () => {
  const Nothing = () => null;
  return { Bar: Nothing, BarChart: Nothing, CartesianGrid: Nothing, LabelList: Nothing, Line: Nothing, LineChart: Nothing, ResponsiveContainer: Nothing, Tooltip: Nothing, XAxis: Nothing, YAxis: Nothing };
});
vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/chatApi', () => ({
  chatApi: { unreadCount: vi.fn().mockResolvedValue(0), list: vi.fn() },
  notificationApi: { unreadCount: vi.fn().mockResolvedValue(0), list: vi.fn() },
}));
vi.mock('../services/realtime', () => ({
  connectRealtime: vi.fn(), disconnectRealtime: vi.fn(), emitRealtime: vi.fn(), isRealtimeConnected: () => true, onRealtime: () => () => {}, onRealtimeStatus: () => () => {},
}));
vi.mock('../services/impactApi', () => ({ impactApi: { platform: vi.fn(), rules: vi.fn(), monthly: vi.fn(), yearly: vi.fn(), byCategory: vi.fn(), mine: vi.fn(), score: vi.fn() } }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn().mockResolvedValue([]) },
  deviceApi: { list: vi.fn().mockResolvedValue({ items: [], meta: { total: 0, page: 1, pages: 1, limit: 12 } }), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const apiError = (message, status = 500) => Object.assign(new Error(message), { response: { status, data: { message } } });

const platform = (over = {}) => ({
  devicesListed: 40,
  devices: { repaired: 12, reused: 1, donated: 8, refurbished: 5, recycled: 20, diverted: 46 },
  materials: { measuredKg: 31.5, estimatedKg: 12 },
  co2e: { kgEstimated: 2300, isEstimate: true },
  activeTechnicians: 9, studentParticipants: 14, completedDonations: 7, verifiedActivities: 33,
  updatedAt: '2026-11-17T09:00:00.000Z', factorsProvisional: true, method: 'Counts are actual. Everything else is an estimate from placeholder factors.',
  ...over,
});
const emptyPlatform = () => platform({ devices: { repaired: 0, reused: 0, donated: 0, refurbished: 0, recycled: 0, diverted: 0 }, materials: { measuredKg: 0, estimatedKg: 0 }, co2e: { kgEstimated: 0, isEstimate: true }, verifiedActivities: 0, devicesListed: 5 });
const months = () => [
  { month: '2026-09', devices: 0, byType: {} },
  { month: '2026-10', devices: 1, byType: { repair: 1 } },
  { month: '2026-11', devices: 4, byType: { donation: 3, recycling: 1 } },
];
const rules = () => ({
  rules: [{ key: 'repair_completed', points: 50, label: 'A repair you asked for was completed', who: 'x' }, { key: 'review_left', points: 2, label: 'You reviewed a completed service', who: 'y' }],
  dailyCap: 10, levels: [{ key: 'seed', name: 'Seed', min: 0 }, { key: 'sprout', name: 'Sprout', min: 100 }],
  badges: [], notes: ['Points come only from activities the other side has confirmed as done.'], method: 'm', factorsProvisional: true,
});
const score = (over = {}) => ({
  score: 92,
  level: { key: 'seed', name: 'Seed', min: 0, next: { key: 'sprout', name: 'Sprout', min: 100 }, progress: 0.92 },
  badges: [
    { key: 'first_repair', name: 'First repair', description: 'Take part in one completed repair.', earned: true, progress: { done: 1, needed: 1 } },
    { key: 'donor', name: 'Donor', description: 'Donate one device.', earned: false, progress: { done: 0, needed: 1 } },
    { key: 'material_saver', name: 'Material saver', description: 'Have 10 kg of materials measured.', earned: false, progress: { done: 2.5, needed: 10 } },
  ],
  ledger: [
    { _id: 'l2', points: 40, rule: 'donation_completed', label: 'You donated a device', createdAt: '2026-11-16T09:00:00.000Z' },
    { _id: 'l1', points: 50, rule: 'repair_completed', label: 'A repair you asked for was completed', createdAt: '2026-11-15T09:00:00.000Z' },
  ],
  meta: { page: 1, pages: 1, total: 2, limit: 20 },
  ...over,
});
const mine = (over = {}) => ({
  events: 2, devices: { total: 3, byType: { repair: 1, reuse: 0, donation: 2, refurbishment: 0, recycling: 0 } },
  materials: { measuredKg: 1.5, estimatedKg: 2 }, co2e: { kgEstimated: 150, isEstimate: true }, factorsProvisional: true, method: 'Counts are actual. Everything else is an estimate.', ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  impactApi.platform.mockResolvedValue(platform());
  impactApi.rules.mockResolvedValue(rules());
  impactApi.monthly.mockResolvedValue({ months: months(), factorsProvisional: true, method: 'm' });
  impactApi.yearly.mockResolvedValue({ years: [{ year: 2025, devices: 0, byType: {} }, { year: 2026, devices: 7, byType: { repair: 4, recycling: 3 } }], factorsProvisional: true, method: 'm' });
  impactApi.byCategory.mockResolvedValue({ categories: [{ category: { _id: 'c1', name: 'Laptop', slug: 'laptop' }, devices: 5, byType: { repair: 4, donation: 1 } }, { category: null, devices: 2, byType: { recycling: 2 } }], factorsProvisional: true, method: 'm' });
  impactApi.mine.mockResolvedValue(mine());
  impactApi.score.mockResolvedValue(score());
});

describe('the impact helpers', () => {
  it('says how far to the next level, or that you are at the top', () => {
    expect(nextLevelText({ next: { name: 'Sprout', min: 100 } }, 92)).toBe('8 more points to reach Sprout.');
    expect(nextLevelText({ next: { name: 'Sprout', min: 100 } }, 150)).toBe('0 more points to reach Sprout.');
    expect(nextLevelText({ next: null }, 5000)).toBe('You have reached the highest level.');
  });
  it('shows points with a sign and badge progress with at most one decimal', () => {
    expect([signedPoints(40), signedPoints(-50), signedPoints(0)]).toEqual(['+40', '-50', '0']);
    expect(badgeProgress({ progress: { done: 2.5, needed: 10 } })).toBe('2.5 of 10');
    expect(badgeProgress({ progress: { done: 1, needed: 1 } })).toBe('1 of 1');
  });
  it('turns the monthly series into chart rows and table rows, every kind present', () => {
    const rows = monthlyRows(months());
    expect(rows[2]).toEqual({ month: '2026-11', repair: 0, reuse: 0, donation: 3, refurbishment: 0, recycling: 1 });
    expect(monthlyTable(months())[1]).toEqual(['October 2026', 1, 0, 0, 0, 0]);
    expect(typeSeries.map((s) => s.name)).toEqual(['Repaired', 'Reused', 'Donated', 'Refurbished', 'Recycled']);
  });
  it('knows when there is nothing at all', () => {
    expect(isEmptyImpact(null)).toBe(true);
    expect(isEmptyImpact({ devices: { total: 0 }, materials: { measuredKg: 0, estimatedKg: 0 } })).toBe(true);
    expect(isEmptyImpact({ devices: { total: 0 }, materials: { measuredKg: 0.5, estimatedKg: 0 } })).toBe(false);
    expect(isEmptyImpact(emptyPlatform())).toBe(true);
    expect(isEmptyImpact(platform())).toBe(false);
  });
});

describe('the Green Score ring', () => {
  const level = { name: 'Seed', progress: 0.5, next: { name: 'Sprout', min: 100 } };
  it('says its meaning in words and draws the right share of the circle', () => {
    render(<GreenRing score={50} level={level} />);
    expect(screen.getByRole('img', { name: 'Green Score 50, level Seed, 50 points to Sprout' })).toBeInTheDocument();
    const [drawn, whole] = screen.getByTestId('ring-progress').getAttribute('stroke-dasharray').split(' ').map(Number);
    expect(drawn / whole).toBeCloseTo(0.5, 2);
  });
  it('is full at the top level and says so', () => {
    render(<GreenRing score={1200} level={{ name: 'Forest', progress: 1, next: null }} />);
    expect(screen.getByRole('img', { name: /the highest level/ })).toBeInTheDocument();
  });
  it('never draws less than nothing or more than everything', () => {
    const { unmount } = render(<GreenRing score={1} level={{ name: 'Seed', progress: 7, next: null }} />);
    const [a, b] = screen.getByTestId('ring-progress').getAttribute('stroke-dasharray').split(' ').map(Number);
    expect(a).toBeCloseTo(b, 2);
    unmount();
    render(<GreenRing score={1} level={{ name: 'Seed', progress: -3, next: null }} />);
    expect(Number(screen.getByTestId('ring-progress').getAttribute('stroke-dasharray').split(' ')[0])).toBe(0);
  });
});

describe('the public impact page', () => {
  const open = () => renderApp('/impact', anonymous());

  it('shows recorded figures, each marked as counted, weighed or estimated', async () => {
    open();
    expect(await screen.findByText('Devices kept out of the waste stream')).toBeInTheDocument();
    expect(screen.getByText('46')).toBeInTheDocument();
    expect(screen.getByText('31.5 kg')).toBeInTheDocument();
    expect(screen.getByText('12 kg')).toBeInTheDocument();
    expect(screen.getByText('2,300 kg')).toBeInTheDocument();
    expect(screen.getAllByText('Actual').length).toBeGreaterThanOrEqual(8);
    expect(screen.getByText('Measured')).toBeInTheDocument();
    expect(screen.getAllByText('Estimate')).toHaveLength(2); // the weight not weighed, and the CO2e
    expect(screen.getByText(/placeholder figures that have not been sourced yet/)).toBeInTheDocument();
    expect(screen.getByText('Counts are actual. Everything else is an estimate from placeholder factors.')).toBeInTheDocument();
  });

  it('says so, instead of showing zeros, when nothing has been verified', async () => {
    impactApi.platform.mockResolvedValue(emptyPlatform());
    open();
    expect(await screen.findByText('No verified activity yet')).toBeInTheDocument();
    expect(screen.getByText(/5 devices have been listed so far/)).toBeInTheDocument();
    expect(screen.queryByText('Devices kept out of the waste stream')).not.toBeInTheDocument();
  });

  it('says why when the figures cannot load, and loads them when retried', async () => {
    impactApi.platform.mockRejectedValueOnce(apiError('The figures are down'));
    open();
    expect(await screen.findByText('The figures are down')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByText('Devices kept out of the waste stream')).toBeInTheDocument();
  });

  it('offers the monthly chart as a table with every kind of activity', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Show as a table' }));
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Donated' })).toBeInTheDocument();
    expect(within(table).getByRole('row', { name: /November 2026/ })).toHaveTextContent('3');
    expect(screen.getByRole('list', { name: /Legend for/ })).toBeInTheDocument();
  });

  it('leaves the chart out when there has been no activity in the months shown', async () => {
    impactApi.monthly.mockResolvedValue({ months: [{ month: '2026-11', devices: 0, byType: {} }] });
    open();
    await screen.findByText('Devices kept out of the waste stream');
    expect(screen.queryByRole('button', { name: 'Show as a table' })).not.toBeInTheDocument();
  });

  it('explains how points are earned, from the server\'s own rules', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'How the Green Score works' })).toBeInTheDocument();
    expect(screen.getByText('A repair you asked for was completed')).toBeInTheDocument();
    expect(screen.getByText('+50')).toBeInTheDocument();
    expect(screen.getByText(/Seed from 0, Sprout from 100/)).toBeInTheDocument();
  });

  it('still works when the rules cannot be fetched', async () => {
    impactApi.rules.mockRejectedValue(apiError('no'));
    open();
    await screen.findByText('Devices kept out of the waste stream');
    expect(screen.queryByRole('heading', { name: 'How the Green Score works' })).not.toBeInTheDocument();
  });
});

describe('the landing page figures', () => {
  const strip = () => render(<MemoryRouter><ImpactStrip /></MemoryRouter>);

  it('show a few live figures with a link to all of them', async () => {
    strip();
    expect(await screen.findByText('Devices kept in use')).toBeInTheDocument();
    expect(screen.getByText('46')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /See all the figures/ })).toHaveAttribute('href', '/impact');
  });

  it('say that nothing has been confirmed yet rather than showing zeros', async () => {
    impactApi.platform.mockResolvedValue(emptyPlatform());
    strip();
    expect(await screen.findByText(/No activity has been confirmed yet/)).toBeInTheDocument();
    expect(screen.queryByText('Devices kept in use')).not.toBeInTheDocument();
  });

  it('show nothing at all when the figures cannot be fetched', async () => {
    impactApi.platform.mockRejectedValue(apiError('down'));
    const { container } = strip();
    await waitFor(() => expect(impactApi.platform).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});

describe('my Green Score page', () => {
  const open = (user = USER) => renderApp('/dashboard/impact', signedIn(user));

  it('shows the ring, level, what is needed next, and the badges with progress', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Seed' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Green Score 92, level Seed, 8 points to Sprout' })).toBeInTheDocument();
    expect(screen.getByText('8 more points to reach Sprout.')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 earned')).toBeInTheDocument();
    const badges = screen.getByRole('heading', { name: 'Badges' }).closest('section');
    expect(within(badges).getByText('First repair').parentElement).toHaveTextContent('earned');
    expect(within(badges).getByText('Donor').parentElement).toHaveTextContent('not yet earned');
    expect(within(badges).getByText('2.5 of 10')).toBeInTheDocument();
  });

  it('keeps actual, measured and estimated figures apart and labels each', async () => {
    open();
    await screen.findByRole('heading', { name: 'Your impact' });
    expect(await screen.findByText('Devices kept in use')).toBeInTheDocument();
    expect(screen.getByText('1.5 kg')).toBeInTheDocument();
    expect(screen.getByText('150 kg')).toBeInTheDocument();
    expect(screen.getByText('Measured')).toBeInTheDocument();
    expect(screen.getAllByText('Estimate')).toHaveLength(2);
    const byKind = within(screen.getByRole('list', { name: 'Devices by kind of activity' }));
    expect(byKind.getByText('Repaired 1')).toBeInTheDocument();
    expect(byKind.getByText('Donated 2')).toBeInTheDocument();
    expect(byKind.queryByText(/Reused/)).not.toBeInTheDocument(); // kinds with nothing are left out
  });

  it('lists how points were earned, newest first, and shows a reversal as a loss', async () => {
    impactApi.score.mockResolvedValue(score({ ledger: [{ _id: 'l3', points: -50, rule: 'reversal', label: 'Removed: a complaint about this was upheld', createdAt: '2026-11-17T09:00:00.000Z' }, { _id: 'l1', points: 50, rule: 'repair_completed', label: 'A repair you asked for was completed', createdAt: '2026-11-15T09:00:00.000Z' }] }));
    open();
    const history = await screen.findByRole('list', { name: 'Score history' });
    const rows = within(history).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('-50');
    expect(rows[0]).toHaveTextContent('Removed: a complaint about this was upheld');
    expect(rows[1]).toHaveTextContent('+50');
  });

  it('brings in older history with Show more, without repeating any', async () => {
    impactApi.score.mockResolvedValueOnce(score({ meta: { page: 1, pages: 2, total: 3, limit: 20 } }));
    open();
    await screen.findByRole('list', { name: 'Score history' });
    impactApi.score.mockResolvedValueOnce(score({ ledger: [score().ledger[1], { _id: 'l0', points: 2, rule: 'review_left', label: 'You reviewed a completed service', createdAt: '2026-11-01T09:00:00.000Z' }], meta: { page: 2, pages: 2, total: 3, limit: 20 } }));
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));

    expect(await screen.findByText('You reviewed a completed service')).toBeInTheDocument();
    expect(impactApi.score).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    expect(within(screen.getByRole('list', { name: 'Score history' })).getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Show more' })).not.toBeInTheDocument();
  });

  it('tells a new person honestly that there is nothing yet', async () => {
    impactApi.score.mockResolvedValue(score({ score: 0, badges: [], ledger: [], meta: { page: 1, pages: 1, total: 0, limit: 20 }, level: { key: 'seed', name: 'Seed', min: 0, next: { name: 'Sprout', min: 100 }, progress: 0 } }));
    impactApi.mine.mockResolvedValue(mine({ devices: { total: 0, byType: {} }, materials: { measuredKg: 0, estimatedKg: 0 }, co2e: { kgEstimated: 0, isEstimate: true } }));
    impactApi.monthly.mockResolvedValue({ months: [{ month: '2026-11', devices: 0, byType: {} }] });
    open();
    expect(await screen.findByText('Nothing earned yet.')).toBeInTheDocument();
    expect(screen.getByText(/Nothing yet\. When a repair, donation, sale or recycling/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show as a table' })).not.toBeInTheDocument();
  });

  it('says why the score cannot load, and loads it when retried', async () => {
    impactApi.score.mockRejectedValueOnce(apiError('Score unavailable'));
    open();
    expect(await screen.findByText('Score unavailable')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    expect(await screen.findByRole('heading', { name: 'Seed' })).toBeInTheDocument();
  });

  it('shows the monthly chart for me only, and asks for it that way', async () => {
    open();
    await screen.findByRole('heading', { name: 'Seed' });
    await screen.findByRole('button', { name: 'Show as a table' });
    expect(impactApi.monthly).toHaveBeenCalledWith({ scope: 'me', months: 12 }, expect.anything());
  });

  it('has a Green Score link in the sidebar for members and none for administrators', async () => {
    const member = open();
    await screen.findByRole('heading', { name: 'Seed' });
    expect(within(screen.getByRole('complementary', { name: 'Dashboard navigation' })).getByRole('link', { name: /Green Score/ })).toHaveAttribute('href', '/dashboard/impact');
    member.unmount();

    open({ ...USER, role: 'admin' });
    await screen.findByRole('heading', { name: 'Green Score' });
    expect(within(screen.getByRole('complementary', { name: 'Dashboard navigation' })).queryByRole('link', { name: /Green Score/ })).not.toBeInTheDocument();
  });
});

describe('the year-by-year and by-device breakdowns', () => {
  it('turns the series into bar rows with what each was made of', () => {
    expect(yearlyItems([{ year: 2026, devices: 7, byType: { repair: 4, recycling: 3 } }])).toEqual([{ key: '2026', label: '2026', value: 7, detail: 'Repaired 4 · Recycled 3' }]);
    expect(categoryItems([{ category: { _id: 'c1', name: 'Laptop' }, devices: 5, byType: { repair: 5 } }, { category: null, devices: 1, byType: {} }])).toEqual([
      { key: 'c1', label: 'Laptop', value: 5, detail: 'Repaired 5' },
      { key: 'other', label: 'Other', value: 1, detail: '' },
    ]);
    expect(hasValues(yearlyItems([{ year: 2026, devices: 0, byType: {} }]))).toBe(false);
    expect(hasValues([])).toBe(false);
  });

  it('shows both on the public page, with every number as text', async () => {
    renderApp('/impact', anonymous());
    const year = await screen.findByRole('region', { name: 'Year by year' });
    expect(within(year).getByText('2026')).toBeInTheDocument();
    expect(within(year).getByText('Repaired 4 · Recycled 3')).toBeInTheDocument();
    const kinds = screen.getByRole('region', { name: 'By kind of device' });
    expect(within(kinds).getByText('Laptop')).toBeInTheDocument();
    expect(within(kinds).getByText('Other')).toBeInTheDocument();
    expect(impactApi.yearly).toHaveBeenCalledWith({ years: 5 }, expect.anything());
    expect(impactApi.byCategory).toHaveBeenCalledWith({}, expect.anything());
  });

  it('leaves them out when nothing has been confirmed, or when they cannot be loaded', async () => {
    impactApi.yearly.mockResolvedValue({ years: [{ year: 2026, devices: 0, byType: {} }] });
    impactApi.byCategory.mockRejectedValue(apiError('down'));
    renderApp('/impact', anonymous());
    await screen.findByRole('heading', { name: 'Environmental impact' });
    await waitFor(() => expect(impactApi.byCategory).toHaveBeenCalled());
    expect(screen.queryByRole('region', { name: 'Year by year' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'By kind of device' })).not.toBeInTheDocument();
  });

  it('shows my own on my Green Score page, asking for my scope only', async () => {
    renderApp('/dashboard/impact', signedIn(USER));
    expect(await screen.findByRole('region', { name: 'Year by year' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'By kind of device' })).toBeInTheDocument();
    expect(impactApi.yearly).toHaveBeenCalledWith({ scope: 'me', years: 5 }, expect.anything());
    expect(impactApi.byCategory).toHaveBeenCalledWith({ scope: 'me' }, expect.anything());
  });
});
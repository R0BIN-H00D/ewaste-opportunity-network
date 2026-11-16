import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { deviceApi } from '../services/deviceApi';
import { adminCategoryApi, adminDashboardApi, adminListingApi, adminReportApi, adminReviewApi } from '../services/adminApi';
import { listingStatusLabel, listingStatusTone, reviewStatusLabel, actionLabel } from '../lib/admin';
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
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 10, ...meta } });
const apiError = (message, status = 409, code, errors) => Object.assign(new Error(message), { response: { status, data: { message, code, errors } } });
const lastCall = (fn) => fn.mock.calls[fn.mock.calls.length - 1];

const listing = (o = {}) => ({
  _id: 'l1', title: 'Dell monitor', brand: 'Dell', model: 'P2419H', condition: 'good', preferredService: 'repair', status: 'listed', area: 'Indiranagar, Bengaluru',
  owner: { _id: 'u1', name: 'Asha Rao' }, category: { _id: 'c1', name: 'Monitor' }, reportCount: 0, openReports: 0, locked: false, removal: null,
  createdAt: '2026-11-10T08:00:00.000Z', actions: ['remove'], ...o,
});
const review = (o = {}) => ({
  _id: 'v1', rating: 1, quality: 2, communication: null, timeliness: null, comment: 'Rude and late', status: 'visible', contextType: 'service',
  reviewer: { _id: 'u1', name: 'Ravi Kumar' }, target: { _id: 'u2', name: 'Meera Nair', role: 'technician' }, openReports: 0, createdAt: '2026-11-10T08:00:00.000Z', actions: ['hide', 'remove'], ...o,
});
const report = (o = {}) => ({
  _id: 'r1', status: 'open', reason: 'fraud', details: 'Looks like a scam', createdAt: '2026-11-10T08:00:00.000Z', reviewedAt: null, decisionNote: '',
  reporter: { _id: 'u9', name: 'Ravi Kumar' }, reportsOnItem: 1,
  target: { type: 'listing', id: 'l1', exists: true, title: 'Dell monitor', status: 'listed', owner: 'Asha Rao' },
  actions: ['take_down', 'dismiss', 'resolve'], ...o,
});
const category = (o = {}) => ({ _id: 'c1', name: 'Monitor', slug: 'monitor', icon: 'monitor', group: '', hazardous: false, active: true, order: 0, usage: { listings: 2, products: 1, references: 3 }, canDelete: false, ...o });

beforeEach(() => {
  vi.resetAllMocks();
  setAccessToken(null);
  deviceApi.list.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pages: 1, limit: 1 } });
  adminDashboardApi.get.mockReturnValue(new Promise(() => {}));
  adminListingApi.list.mockResolvedValue(page([listing()]));
  adminCategoryApi.list.mockResolvedValue([category(), category({ _id: 'c2', name: 'Printer', slug: 'printer', order: 1 }), category({ _id: 'c3', name: 'Cables', slug: 'cables', order: 2, canDelete: true, usage: { listings: 0, products: 0, references: 0 } })]);
  adminReviewApi.list.mockResolvedValue(page([review()]));
  adminReportApi.list.mockResolvedValue(page([report()]));
});

describe('moderation words', () => {
  it('uses plain words for statuses and audit actions', () => {
    expect(listingStatusLabel('removed_by_admin')).toBe('Removed');
    expect(listingStatusLabel('in_service')).toBe('In service');
    expect(listingStatusTone('listed')).toBe('green');
    expect(listingStatusTone('removed_by_admin')).toBe('red');
    expect(reviewStatusLabel('hidden')).toBe('Hidden');
    expect(actionLabel('listing.removed')).toBe('Removed the listing');
    expect(actionLabel('report.dismissed')).toBe('Dismissed the report');
    expect(actionLabel('category.deactivated')).toBe('Switched the category off');
  });
});

describe('moderation menu and access', () => {
  it('adds Listings, Reviews, Reports and Categories to the admin menu only', async () => {
    renderApp('/dashboard/admin/listings', signedIn(ADMIN));
    const menu = within(await screen.findByRole('complementary', { name: 'Dashboard navigation' }));
    expect(menu.getByRole('link', { name: /Listings/ })).toHaveAttribute('href', '/dashboard/admin/listings');
    expect(menu.getByRole('link', { name: /Reviews/ })).toHaveAttribute('href', '/dashboard/admin/reviews');
    expect(menu.getByRole('link', { name: /Reports/ })).toHaveAttribute('href', '/dashboard/admin/reports');
    expect(menu.getByRole('link', { name: /Categories/ })).toHaveAttribute('href', '/dashboard/admin/categories');
  });

  it.each(['listings', 'reviews', 'reports', 'categories'])('keeps everyone else out of /%s', async (path) => {
    renderApp(`/dashboard/admin/${path}`, signedIn(USER));
    expect(await screen.findByRole('heading', { name: 'This area is not available for your account' })).toBeInTheDocument();
    [adminListingApi.list, adminReviewApi.list, adminReportApi.list, adminCategoryApi.list].forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });
});

describe('listings', () => {
  it('shows each listing with its status, owner, area, category and a link to the page', async () => {
    adminListingApi.list.mockResolvedValue(page([listing({ reportCount: 3, openReports: 1 })]));
    renderApp('/dashboard/admin/listings', signedIn(ADMIN));
    const row = (await screen.findByText('Dell monitor')).closest('article');
    expect(within(row).getByText('Live')).toBeInTheDocument();
    expect(within(row).getByText('3 reports · 1 waiting')).toBeInTheDocument();
    expect(row).toHaveTextContent('Dell P2419H · Monitor');
    expect(row).toHaveTextContent('Owner: Asha Rao · Indiranagar, Bengaluru');
    expect(within(row).getByRole('link', { name: 'View Dell monitor' })).toHaveAttribute('href', '/devices/l1');
    expect(screen.getByRole('status')).toHaveTextContent('1 listing');
  });

  it('offers only what the server allows: nothing for a listing in a service, Restore for a removed one', async () => {
    adminListingApi.list.mockResolvedValue(page([
      listing({ _id: 'l2', title: 'In service', status: 'in_service', locked: true, actions: [] }),
      listing({ _id: 'l3', title: 'Taken down', status: 'removed_by_admin', actions: ['restore'], removal: { reason: 'Counterfeit part', at: '2026-11-11T08:00:00.000Z' } }),
    ]));
    renderApp('/dashboard/admin/listings', signedIn(ADMIN));
    const busy = (await screen.findByText('In service', { selector: 'h2' })).closest('article');
    expect(within(busy).getByText('Part of a service')).toBeInTheDocument();
    expect(within(busy).queryByRole('button')).not.toBeInTheDocument();
    const gone = screen.getByText('Taken down').closest('article');
    expect(gone).toHaveTextContent('Removed: Counterfeit part');
    expect(within(gone).getByRole('button', { name: 'Restore listing: Taken down' })).toBeInTheDocument();
    expect(within(gone).queryByRole('button', { name: /^Remove listing/ })).not.toBeInTheDocument();
  });

  it('searches, filters by status, category and reported, and clears', async () => {
    renderApp('/dashboard/admin/listings', signedIn(ADMIN));
    await screen.findByText('Dell monitor');
    fireEvent.change(screen.getByLabelText('Search title, brand or model'), { target: { value: ' dell ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(lastCall(adminListingApi.list)[0]).toMatchObject({ q: 'dell' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'withdrawn' } });
    await waitFor(() => expect(lastCall(adminListingApi.list)[0]).toMatchObject({ q: 'dell', status: 'withdrawn' }));
    await screen.findByRole('option', { name: 'Printer' }); // the category list loads separately
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'c2' } });
    await waitFor(() => expect(lastCall(adminListingApi.list)[0]).toMatchObject({ category: 'c2' }));
    fireEvent.click(screen.getByLabelText('Reported only'));
    await waitFor(() => expect(lastCall(adminListingApi.list)[0]).toMatchObject({ reported: 'true' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(lastCall(adminListingApi.list)[0]).toMatchObject({ q: '', status: '', category: '', reported: '' }));
  });

  it('removes a listing only with a reason of at least five characters, then reloads', async () => {
    adminListingApi.moderate.mockResolvedValue({ _id: 'l1', status: 'removed_by_admin' });
    renderApp('/dashboard/admin/listings', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove listing: Dell monitor' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    expect(within(dialog).getByText('Give a reason of at least 5 characters.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'abc' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    expect(adminListingApi.moderate).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: '  Not an electronic device ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    await waitFor(() => expect(adminListingApi.moderate).toHaveBeenCalledWith('l1', { action: 'remove', reason: 'Not an electronic device' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adminListingApi.list).toHaveBeenCalledTimes(2);
  });

  it('shows the server’s reason when a removal is refused and keeps the dialog open', async () => {
    adminListingApi.moderate.mockRejectedValue(apiError('This listing is part of an active service. Let the service finish or be cancelled first.', 409, 'LISTING_LOCKED'));
    renderApp('/dashboard/admin/listings', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove listing: Dell monitor' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Looks fake' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    expect(await within(dialog).findByText(/part of an active service/)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('restores a listing with no reason needed', async () => {
    adminListingApi.list.mockResolvedValue(page([listing({ status: 'removed_by_admin', actions: ['restore'] })]));
    adminListingApi.moderate.mockResolvedValue({ _id: 'l1', status: 'listed' });
    renderApp('/dashboard/admin/listings', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore listing: Dell monitor' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore listing' }));
    await waitFor(() => expect(adminListingApi.moderate).toHaveBeenCalledWith('l1', { action: 'restore' }));
  });

  it('says so when nothing matches, when there are none, and offers a retry on failure', async () => {
    adminListingApi.list.mockResolvedValueOnce(page([]));
    renderApp('/dashboard/admin/listings?q=zzz', signedIn(ADMIN));
    expect(await screen.findByText('No listing matches this search')).toBeInTheDocument();
    adminListingApi.list.mockRejectedValueOnce(apiError('Server went away', 500));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('Could not load listings')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Dell monitor')).toBeInTheDocument();
  });

  it('moves between pages', async () => {
    adminListingApi.list.mockResolvedValue(page([listing()], { total: 25, pages: 3 }));
    renderApp('/dashboard/admin/listings', signedIn(ADMIN));
    await screen.findByText('Dell monitor');
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(lastCall(adminListingApi.list)[0]).toMatchObject({ page: 2 }));
  });
});

describe('reviews', () => {
  it('shows the rating, comment, both people and the sub-ratings', async () => {
    adminReviewApi.list.mockResolvedValue(page([review({ openReports: 2 })]));
    renderApp('/dashboard/admin/reviews', signedIn(ADMIN));
    const row = (await screen.findByText('Rude and late')).closest('article');
    expect(row).toHaveTextContent('1 out of 5');
    expect(within(row).getByText('Visible')).toBeInTheDocument();
    expect(within(row).getByText('2 reports waiting')).toBeInTheDocument();
    expect(row).toHaveTextContent('By Ravi Kumar about Meera Nair (Technician)');
    expect(row).toHaveTextContent('Quality 2/5');
  });

  it('hides a review only with a reason, and sends the status the server expects', async () => {
    adminReviewApi.setStatus.mockResolvedValue({ _id: 'v1', status: 'hidden' });
    renderApp('/dashboard/admin/reviews', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Hide the 1-star review by Ravi Kumar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide review' }));
    expect(within(dialog).getByText('Give a reason of at least 5 characters.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Abusive language' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Hide review' }));
    await waitFor(() => expect(adminReviewApi.setStatus).toHaveBeenCalledWith('v1', { status: 'hidden', reason: 'Abusive language' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adminReviewApi.list).toHaveBeenCalledTimes(2);
  });

  it('removes a review with a reason', async () => {
    adminReviewApi.setStatus.mockResolvedValue({});
    renderApp('/dashboard/admin/reviews', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the 1-star review by Ravi Kumar' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('the same service cannot be reviewed again');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Not a real customer' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove review' }));
    await waitFor(() => expect(adminReviewApi.setStatus).toHaveBeenCalledWith('v1', { status: 'removed', reason: 'Not a real customer' }));
  });

  it('restores a hidden review straight away', async () => {
    adminReviewApi.list.mockResolvedValue(page([review({ status: 'hidden', actions: ['restore', 'remove'] })]));
    adminReviewApi.setStatus.mockResolvedValue({});
    renderApp('/dashboard/admin/reviews', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Restore the 1-star review by Ravi Kumar' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Restore review' }));
    await waitFor(() => expect(adminReviewApi.setStatus).toHaveBeenCalledWith('v1', { status: 'visible' }));
  });

  it('filters by status, rating and reported, and handles empty and error states', async () => {
    renderApp('/dashboard/admin/reviews', signedIn(ADMIN));
    await screen.findByText('Rude and late');
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'hidden' } });
    await waitFor(() => expect(lastCall(adminReviewApi.list)[0]).toMatchObject({ status: 'hidden' }));
    fireEvent.change(screen.getByLabelText('Rating'), { target: { value: '1' } });
    await waitFor(() => expect(lastCall(adminReviewApi.list)[0]).toMatchObject({ status: 'hidden', rating: '1' }));
    fireEvent.click(screen.getByLabelText('Reported only'));
    await waitFor(() => expect(lastCall(adminReviewApi.list)[0]).toMatchObject({ reported: 'true' }));
    adminReviewApi.list.mockResolvedValue(page([]));
    fireEvent.change(screen.getByLabelText('Rating'), { target: { value: '5' } });
    expect(await screen.findByText('No review matches these filters')).toBeInTheDocument();
    adminReviewApi.list.mockRejectedValueOnce(apiError('Server went away', 500));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('Could not load reviews')).toBeInTheDocument();
  });
});

describe('reports', () => {
  it('shows the reason, the item reported, the reporter and what can be done', async () => {
    adminReportApi.list.mockResolvedValue(page([report({ reportsOnItem: 3 })]));
    renderApp('/dashboard/admin/reports', signedIn(ADMIN));
    const row = (await screen.findByRole('heading', { name: 'Suspected fraud' })).closest('article');
    expect(within(row).getByText('Listing')).toBeInTheDocument();
    expect(within(row).getByText('Waiting')).toBeInTheDocument();
    expect(within(row).getByText('3 reports on this item')).toBeInTheDocument();
    expect(row).toHaveTextContent('Dell monitor');
    expect(row).toHaveTextContent('Listed · by Asha Rao');
    expect(row).toHaveTextContent('“Looks like a scam”');
    expect(row).toHaveTextContent('Reported by Ravi Kumar');
    expect(within(row).getByRole('link', { name: 'View listing' })).toHaveAttribute('href', '/devices/l1');
    ['Remove listing', 'Mark as handled', 'Dismiss'].forEach((n) => expect(within(row).getByRole('button', { name: n })).toBeInTheDocument());
    expect(lastCall(adminReportApi.list)[0]).toMatchObject({ status: '' }); // the server defaults to waiting reports
  });

  it('words the take-down for each kind of item and links to the right place', async () => {
    adminReportApi.list.mockResolvedValue(page([
      report({ _id: 'r2', target: { type: 'product', id: 'p1', exists: true, title: 'Refurbished laptop', status: 'active', owner: 'Asha Rao' } }),
      report({ _id: 'r3', target: { type: 'review', id: 'v1', exists: true, title: '2-star review of Meera Nair', status: 'visible', owner: 'Ravi Kumar', excerpt: 'Awful' } }),
      report({ _id: 'r4', target: { type: 'user', id: 'u5', exists: true, title: 'Poor Person', status: 'active', owner: '', role: 'user' }, actions: ['dismiss', 'resolve'] }),
    ]));
    renderApp('/dashboard/admin/reports', signedIn(ADMIN));
    const product = (await screen.findByText('Refurbished laptop')).closest('article');
    expect(within(product).getByRole('button', { name: 'Remove product' })).toBeInTheDocument();
    expect(within(product).getByRole('link', { name: 'View product' })).toHaveAttribute('href', '/marketplace/p1');
    const rev = screen.getByText('2-star review of Meera Nair').closest('article');
    expect(within(rev).getByRole('button', { name: 'Hide review' })).toBeInTheDocument();
    expect(rev).toHaveTextContent('Awful');
    expect(within(rev).getByRole('link', { name: 'See in reviews' })).toHaveAttribute('href', '/dashboard/admin/reviews?reported=true');
    const person = screen.getByText('Poor Person').closest('article');
    expect(within(person).queryByRole('button', { name: /Remove|Hide/ })).not.toBeInTheDocument();
    expect(within(person).getByRole('link', { name: 'Open account' })).toHaveAttribute('href', '/dashboard/admin/users/u5');
  });

  it('shows an item that is gone as unavailable, with no link', async () => {
    adminReportApi.list.mockResolvedValue(page([report({ target: { type: 'listing', id: 'l9', exists: false, title: 'No longer available', status: '', owner: '' }, actions: ['dismiss', 'resolve'] })]));
    renderApp('/dashboard/admin/reports', signedIn(ADMIN));
    const row = (await screen.findByText('No longer available')).closest('article');
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button', { name: 'Remove listing' })).not.toBeInTheDocument();
  });

  it('takes an item down only with a reason, then reloads', async () => {
    adminReportApi.decide.mockResolvedValue(report({ status: 'actioned' }));
    renderApp('/dashboard/admin/reports', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove listing' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    expect(within(dialog).getByText('Give a reason of at least 5 characters.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Scam listing' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    await waitFor(() => expect(adminReportApi.decide).toHaveBeenCalledWith('r1', { decision: 'take_down', reason: 'Scam listing' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adminReportApi.list).toHaveBeenCalledTimes(2);
  });

  it('marks a report as handled with a note, and dismisses without needing one', async () => {
    adminReportApi.decide.mockResolvedValue(report({ status: 'actioned' }));
    renderApp('/dashboard/admin/reports', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as handled' }));
    let dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as handled' }));
    expect(within(dialog).getByText('Give a reason of at least 5 characters.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('What was done'), { target: { value: 'Spoke to the owner' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mark as handled' }));
    await waitFor(() => expect(adminReportApi.decide).toHaveBeenCalledWith('r1', { decision: 'resolve', reason: 'Spoke to the owner' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dismiss report' }));
    await waitFor(() => expect(adminReportApi.decide).toHaveBeenLastCalledWith('r1', { decision: 'dismiss' }));
  });

  it('keeps the dialog open and explains when a take-down is refused', async () => {
    adminReportApi.decide.mockRejectedValue(apiError('This listing is part of an active service. Let the service finish or be cancelled first.', 409, 'LISTING_LOCKED'));
    renderApp('/dashboard/admin/reports', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove listing' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'Scam listing' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove listing' }));
    expect(await within(dialog).findByText(/part of an active service/)).toBeInTheDocument();
  });

  it('shows decided reports with their note and no buttons, and filters the queue', async () => {
    adminReportApi.list.mockResolvedValue(page([report({ status: 'actioned', actions: [], reviewedAt: '2026-11-11T08:00:00.000Z', decisionNote: 'Scam listing' })]));
    renderApp('/dashboard/admin/reports?status=actioned', signedIn(ADMIN));
    const row = (await screen.findByRole('heading', { name: 'Suspected fraud' })).closest('article');
    expect(within(row).getByText('Handled')).toBeInTheDocument();
    expect(row).toHaveTextContent('Scam listing');
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
    expect(lastCall(adminReportApi.list)[0]).toMatchObject({ status: 'actioned' });
    fireEvent.change(screen.getByLabelText('About'), { target: { value: 'review' } });
    await waitFor(() => expect(lastCall(adminReportApi.list)[0]).toMatchObject({ status: 'actioned', targetType: 'review' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'spam' } });
    await waitFor(() => expect(lastCall(adminReportApi.list)[0]).toMatchObject({ reason: 'spam' }));
  });

  it('says so when the queue is empty or a filter matches nothing, and offers a retry on failure', async () => {
    adminReportApi.list.mockResolvedValueOnce(page([]));
    renderApp('/dashboard/admin/reports', signedIn(ADMIN));
    expect(await screen.findByText('No reports are waiting')).toBeInTheDocument();
    adminReportApi.list.mockResolvedValueOnce(page([]));
    fireEvent.change(screen.getByLabelText('About'), { target: { value: 'user' } });
    expect(await screen.findByText('No report matches these filters')).toBeInTheDocument();
    adminReportApi.list.mockRejectedValueOnce(apiError('Server went away', 500));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('Could not load reports')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Suspected fraud' })).toBeInTheDocument();
  });
});

describe('categories', () => {
  it('lists every category with its state, use and link name', async () => {
    adminCategoryApi.list.mockResolvedValue([category({ hazardous: true, group: 'Power' }), category({ _id: 'c2', name: 'Printer', slug: 'printer', active: false })]);
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    const row = (await screen.findByText('Monitor', { selector: 'h2' })).closest('article');
    expect(within(row).getByText('Hazardous')).toBeInTheDocument();
    expect(within(row).getByText('Power')).toBeInTheDocument();
    expect(row).toHaveTextContent('2 listings · 1 product · link name monitor');
    const off = screen.getByText('Printer', { selector: 'h2' }).closest('article');
    expect(within(off).getByText('Switched off')).toBeInTheDocument();
    expect(within(off).getByRole('button', { name: 'Switch on Printer' })).toBeInTheDocument();
  });

  it('moves a category up or down by sending the whole new order, and disables the ends', async () => {
    adminCategoryApi.reorder.mockResolvedValue([]);
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    await screen.findByText('Monitor', { selector: 'h2' });
    expect(screen.getByRole('button', { name: 'Move Monitor up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Cables down' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Move Monitor down' }));
    await waitFor(() => expect(adminCategoryApi.reorder).toHaveBeenCalledWith(['c2', 'c1', 'c3']));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Move Cables up' })).not.toBeDisabled()); // buttons rest while saving
    fireEvent.click(screen.getByRole('button', { name: 'Move Cables up' }));
    await waitFor(() => expect(adminCategoryApi.reorder).toHaveBeenLastCalledWith(['c1', 'c3', 'c2']));
    expect(adminCategoryApi.list.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('shows why a move failed', async () => {
    adminCategoryApi.reorder.mockRejectedValue(apiError('Send every category exactly once', 422, 'VALIDATION_ERROR', [{ field: 'ids', message: 'Send every category exactly once' }]));
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Move Monitor down' }));
    expect(await screen.findByText('Send every category exactly once')).toBeInTheDocument();
  });

  it('adds a category: name checked first, then only the filled fields are sent', async () => {
    adminCategoryApi.create.mockResolvedValue(category({ _id: 'c9', name: 'Smart watches' }));
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Add category' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'A' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add category' }));
    expect(within(dialog).getByText('Use at least 2 characters.')).toBeInTheDocument();
    expect(adminCategoryApi.create).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: ' Smart watches ' } });
    fireEvent.change(within(dialog).getByLabelText('Icon'), { target: { value: 'watch' } });
    fireEvent.click(within(dialog).getByLabelText(/Hazardous/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add category' }));
    await waitFor(() => expect(adminCategoryApi.create).toHaveBeenCalledWith({ name: 'Smart watches', hazardous: true, icon: 'watch' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adminCategoryApi.list).toHaveBeenCalledTimes(2);
  });

  it('shows the server’s field error and the duplicate-name message', async () => {
    adminCategoryApi.create.mockRejectedValueOnce(apiError('Validation failed', 422, 'VALIDATION_ERROR', [{ field: 'icon', message: 'Use a Lucide icon name such as "laptop"' }]));
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Add category' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Gadgets' } });
    fireEvent.change(within(dialog).getByLabelText('Icon'), { target: { value: 'Bad Icon!' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add category' }));
    expect(await within(dialog).findByText('Use a Lucide icon name such as "laptop"')).toBeInTheDocument();
    adminCategoryApi.create.mockRejectedValueOnce(apiError('A category with this name already exists', 409, 'DUPLICATE_CATEGORY'));
    fireEvent.change(within(dialog).getByLabelText('Icon'), { target: { value: 'box' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add category' }));
    expect(await within(dialog).findByText('A category with this name already exists')).toBeInTheDocument();
  });

  it('edits a category and sends only what changed; closing with no change sends nothing', async () => {
    adminCategoryApi.update.mockResolvedValue(category({ name: 'Monitors' }));
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Monitor' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Monitor');
    expect(dialog).toHaveTextContent('Its link name stays “monitor”');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adminCategoryApi.update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Monitor' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Monitors' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminCategoryApi.update).toHaveBeenCalledWith('c1', { name: 'Monitors' }));
  });

  it('switches a category off after explaining what that means, and on again at once', async () => {
    adminCategoryApi.update.mockResolvedValue(category());
    adminCategoryApi.list.mockResolvedValue([category(), category({ _id: 'c2', name: 'Printer', slug: 'printer', active: false })]);
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Switch off Monitor' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Existing listings keep it');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Switch off' }));
    await waitFor(() => expect(adminCategoryApi.update).toHaveBeenCalledWith('c1', { active: false }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Switch on Printer' }));
    await waitFor(() => expect(adminCategoryApi.update).toHaveBeenLastCalledWith('c2', { active: true }));
  });

  it('offers Delete only for a category nothing uses, and confirms first', async () => {
    adminCategoryApi.remove.mockResolvedValue({ _id: 'c3' });
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    await screen.findByText('Monitor', { selector: 'h2' });
    expect(screen.queryByRole('button', { name: 'Delete Monitor' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Cables' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('cannot be undone');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete category' }));
    await waitFor(() => expect(adminCategoryApi.remove).toHaveBeenCalledWith('c3'));
  });

  it('explains a refused delete on the page', async () => {
    adminCategoryApi.remove.mockRejectedValue(apiError('This category is in use. Deactivate it instead so existing listings keep working.', 409, 'CATEGORY_IN_USE'));
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Cables' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete category' }));
    expect(await screen.findByText(/Deactivate it instead/)).toBeInTheDocument();
  });

  it('handles an empty list and a failed load', async () => {
    adminCategoryApi.list.mockResolvedValueOnce([]);
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    expect(await screen.findByText('There are no categories')).toBeInTheDocument();
  });

  it('offers a retry when categories cannot load', async () => {
    adminCategoryApi.list.mockRejectedValueOnce(apiError('Server went away', 500));
    renderApp('/dashboard/admin/categories', signedIn(ADMIN));
    expect(await screen.findByText('Could not load categories')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Monitor', { selector: 'h2' })).toBeInTheDocument();
  });
});

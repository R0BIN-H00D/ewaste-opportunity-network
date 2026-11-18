import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { deviceApi } from '../services/deviceApi';
import { complaintApi } from '../services/complaintApi';
import { announcementApi } from '../services/announcementApi';
import { adminAnnouncementApi, adminAuditApi, adminComplaintApi, adminDashboardApi } from '../services/adminApi';
import { actionLabel, auditTargetLabel, auditTargetLink } from '../lib/admin';
import { complaintLabel, complaintTone, isClosed } from '../lib/complaints';
import { USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/complaintApi', () => ({ complaintApi: { create: vi.fn(), list: vi.fn(), get: vi.fn() } }));
vi.mock('../services/adminApi', () => ({
  adminDashboardApi: { get: vi.fn() },
  adminMonitorApi: { list: vi.fn() },
  adminListingApi: { list: vi.fn(), moderate: vi.fn() },
  adminReviewApi: { list: vi.fn(), setStatus: vi.fn() },
  adminReportApi: { list: vi.fn(), get: vi.fn(), decide: vi.fn() },
  adminCategoryApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), reorder: vi.fn(), remove: vi.fn() },
  adminComplaintApi: { list: vi.fn(), get: vi.fn(), act: vi.fn() },
  adminAnnouncementApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  adminAuditApi: { list: vi.fn() },
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

// ---- sample data ----
const myComplaint = (o = {}) => ({
  _id: 'c1', subject: 'Device never collected', description: 'The technician said he would come on Monday and did not.', refType: 'service', status: 'open',
  against: { _id: 'u9', name: 'Bob Tech' }, resolution: '', createdAt: '2026-11-10T08:00:00.000Z', updatedAt: '2026-11-10T08:00:00.000Z',
  timeline: [{ status: 'open', at: '2026-11-10T08:00:00.000Z' }], ...o,
});
const queued = (o = {}) => ({
  _id: 'c1', subject: 'Device never collected', status: 'open', refType: 'service', createdAt: '2026-11-10T08:00:00.000Z', updatedAt: '2026-11-10T08:00:00.000Z',
  filedBy: { _id: 'u1', name: 'Alice Rao', role: 'user' }, against: { _id: 'u9', name: 'Bob Tech', role: 'technician' }, assignedTo: null,
  actions: ['assign', 'start_review', 'resolve', 'reject'],
  description: 'The technician said he would come on Monday and did not.', refId: null, resolution: '',
  history: [{ status: 'open', at: '2026-11-10T08:00:00.000Z', note: 'Filed', by: { _id: 'u1', name: 'Alice Rao', role: 'user' } }], ...o,
});
const announcement = (o = {}) => ({
  _id: 'n1', title: 'Planned maintenance', body: 'The site will be slow on Sunday morning.', audience: ['all'], startsAt: '2026-11-10T08:00:00.000Z', endsAt: null,
  state: 'current', createdBy: { _id: 'a1', name: 'Chief Admin' }, createdAt: '2026-11-10T08:00:00.000Z', ...o,
});
const logRow = (o = {}) => ({
  _id: 'g1', action: 'user.suspended', at: '2026-11-10T10:00:00.000Z', admin: { _id: 'a1', name: 'Chief Admin' }, targetType: 'User', targetId: 'u9',
  reason: 'Repeated no-shows', before: { status: 'active' }, after: { status: 'suspended' }, ip: '10.0.0.1', ...o,
});
const auditMeta = { actions: ['report.dismissed', 'user.suspended'], targetTypes: ['Report', 'User'], admins: [{ _id: 'a1', name: 'Chief Admin' }] };

beforeEach(() => {
  vi.resetAllMocks();
  setAccessToken(null);
  sessionStorage.clear();
  deviceApi.list.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pages: 1, limit: 1 } });
  adminDashboardApi.get.mockReturnValue(new Promise(() => {}));
  announcementApi.list.mockResolvedValue([]);
  complaintApi.list.mockResolvedValue(page([myComplaint()]));
  complaintApi.get.mockResolvedValue(myComplaint());
  adminComplaintApi.list.mockResolvedValue(page([queued()]));
  adminComplaintApi.get.mockResolvedValue(queued());
  adminAnnouncementApi.list.mockResolvedValue(page([announcement()]));
  adminAuditApi.list.mockResolvedValue(page([logRow()], auditMeta));
});

describe('words and links', () => {
  it('names complaint states and the audit log’s targets in plain words', () => {
    expect(complaintLabel('in_review')).toBe('Being reviewed');
    expect(complaintLabel('rejected')).toBe('Rejected');
    expect(complaintTone('resolved')).toBe('green');
    expect(isClosed('resolved')).toBe(true);
    expect(isClosed('assigned')).toBe(false);
    expect(actionLabel('complaint.review_started')).toBe('Started reviewing the complaint');
    expect(actionLabel('announcement.deleted')).toBe('Deleted an announcement');
    expect(auditTargetLabel('DeviceListing')).toBe('Listing');
    expect(auditTargetLink('User', 'u1')).toBe('/dashboard/admin/users/u1');
    expect(auditTargetLink('Complaint', 'c1')).toBe('/dashboard/admin/complaints/c1');
    expect(auditTargetLink('Mystery', 'x')).toBe('');
    expect(auditTargetLabel('user')).toBe('Account'); // earlier slices record lowercase target kinds
    expect(auditTargetLabel('verification')).toBe('Verification');
    expect(auditTargetLink('verification', 'u1')).toBe('/dashboard/admin/verifications/u1');
    expect(auditTargetLink('User', null)).toBe('');
  });
});

describe('menus and access', () => {
  it('gives administrators Complaints, Announcements and Audit log, and everyone else a Complaints page of their own', async () => {
    renderApp('/dashboard/admin/complaints', signedIn(ADMIN));
    const menu = within(await screen.findByRole('complementary', { name: 'Dashboard navigation' }));
    expect(menu.getByRole('link', { name: /Complaints/ })).toHaveAttribute('href', '/dashboard/admin/complaints');
    expect(menu.getByRole('link', { name: /Announcements/ })).toHaveAttribute('href', '/dashboard/admin/announcements');
    expect(menu.getByRole('link', { name: /Audit log/ })).toHaveAttribute('href', '/dashboard/admin/audit');
  });

  it('shows a member the complaints link, not the administrators’ pages', async () => {
    renderApp('/dashboard/complaints', signedIn(USER));
    const menu = within(await screen.findByRole('complementary', { name: 'Dashboard navigation' }));
    expect(menu.getByRole('link', { name: /Report a problem/ })).toHaveAttribute('href', '/dashboard/complaints');
    expect(menu.queryByRole('link', { name: /Audit log/ })).not.toBeInTheDocument();
  });

  it.each(['complaints', 'complaints/c1', 'announcements', 'audit'])('keeps everyone else out of /dashboard/admin/%s', async (path) => {
    renderApp(`/dashboard/admin/${path}`, signedIn(USER));
    expect(await screen.findByRole('heading', { name: 'This area is not available for your account' })).toBeInTheDocument();
    [adminComplaintApi.list, adminComplaintApi.get, adminAnnouncementApi.list, adminAuditApi.list].forEach((fn) => expect(fn).not.toHaveBeenCalled());
  });

  it.each(['complaints', 'complaints/new', 'complaints/c1'])('keeps administrators out of /dashboard/%s (they handle complaints, they do not file them)', async (path) => {
    renderApp(`/dashboard/${path}`, signedIn(ADMIN));
    expect(await screen.findByRole('heading', { name: 'This area is not available for your account' })).toBeInTheDocument();
    expect(complaintApi.list).not.toHaveBeenCalled();
  });

  it('sends a signed-out visitor to log in', async () => {
    renderApp('/dashboard/complaints', anonymous());
    expect(await screen.findByRole('heading', { name: /log in|sign in|welcome back/i })).toBeInTheDocument();
    expect(complaintApi.list).not.toHaveBeenCalled();
  });
});

describe('the announcement banner', () => {
  it('shows what the administrators announced, on the dashboard and on public pages', async () => {
    announcementApi.list.mockResolvedValue([{ _id: 'n1', title: 'Planned maintenance', body: 'The site will be slow on Sunday morning.', startsAt: '2026-11-10T08:00:00.000Z' }]);
    renderApp('/dashboard/complaints', signedIn(USER));
    const banner = await screen.findByRole('region', { name: 'Announcements' });
    expect(banner).toHaveTextContent('Planned maintenance');
    expect(banner).toHaveTextContent('The site will be slow on Sunday morning.');
  });

  it('shows on public pages for a visitor', async () => {
    announcementApi.list.mockResolvedValue([{ _id: 'n1', title: 'Planned maintenance', body: 'Slow on Sunday.', startsAt: '2026-11-10T08:00:00.000Z' }]);
    renderApp('/how-it-works', anonymous());
    expect(await screen.findByRole('region', { name: 'Announcements' })).toHaveTextContent('Planned maintenance');
  });

  it('can be dismissed, and stays dismissed for the visit', async () => {
    announcementApi.list.mockResolvedValue([
      { _id: 'n1', title: 'Planned maintenance', body: 'Slow on Sunday.', startsAt: '2026-11-10T08:00:00.000Z' },
      { _id: 'n2', title: 'New centre added', body: 'A new recycling centre joined.', startsAt: '2026-11-09T08:00:00.000Z' },
    ]);
    const first = renderApp('/dashboard/complaints', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Dismiss announcement: Planned maintenance' }));
    expect(screen.queryByText('Planned maintenance')).not.toBeInTheDocument();
    expect(screen.getByText('New centre added')).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem('dismissedAnnouncements'))).toEqual(['n1']);
    first.unmount();

    renderApp('/dashboard/complaints', signedIn(USER));
    expect(await screen.findByText('New centre added')).toBeInTheDocument();
    expect(screen.queryByText('Planned maintenance')).not.toBeInTheDocument();
  });

  it('shows nothing when there is nothing to announce, or when it cannot be loaded', async () => {
    renderApp('/dashboard/complaints', signedIn(USER));
    await screen.findByRole('heading', { name: 'Complaints' });
    expect(screen.queryByRole('region', { name: 'Announcements' })).not.toBeInTheDocument();
    announcementApi.list.mockRejectedValue(apiError('Server went away', 500));
    renderApp('/dashboard/complaints', signedIn(USER));
    await waitFor(() => expect(announcementApi.list).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('region', { name: 'Announcements' })).not.toBeInTheDocument();
  });
});

describe('my complaints', () => {
  it('lists them with their state and who they are about, and offers to file a new one', async () => {
    complaintApi.list.mockResolvedValue(page([myComplaint(), myComplaint({ _id: 'c2', subject: 'Wrong item delivered', refType: 'order', against: null, status: 'resolved' })]));
    renderApp('/dashboard/complaints', signedIn(USER));
    const row = (await screen.findByRole('heading', { name: 'Device never collected' })).closest('article');
    expect(within(row).getByText('Waiting')).toBeInTheDocument();
    expect(row).toHaveTextContent('A repair or other service · about Bob Tech');
    expect(within(row).getByRole('link', { name: 'Open complaint: Device never collected' })).toHaveAttribute('href', '/dashboard/complaints/c1');
    const other = screen.getByRole('heading', { name: 'Wrong item delivered' }).closest('article');
    expect(within(other).getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /File a complaint/ })).toHaveAttribute('href', '/dashboard/complaints/new');
    expect(screen.getByRole('status')).toHaveTextContent('2 complaints');
  });

  it('filters between the ones still being handled and the closed ones', async () => {
    renderApp('/dashboard/complaints', signedIn(USER));
    await screen.findByText('Device never collected');
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'closed' } });
    await waitFor(() => expect(lastCall(complaintApi.list)[0]).toMatchObject({ status: 'closed' }));
  });

  it('says so when there are none, and offers a retry when loading fails', async () => {
    complaintApi.list.mockResolvedValueOnce(page([]));
    renderApp('/dashboard/complaints', signedIn(USER));
    expect(await screen.findByText('You have not filed any complaints')).toBeInTheDocument();
    complaintApi.list.mockRejectedValueOnce(apiError('Server went away', 500));
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'active' } });
    expect(await screen.findByText('Could not load your complaints')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Device never collected')).toBeInTheDocument();
  });
});

describe('filing a complaint', () => {
  const fill = (subject, description) => {
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: subject } });
    fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: description } });
  };

  it('checks the subject and the description before sending anything', async () => {
    renderApp('/dashboard/complaints/new', signedIn(USER));
    await screen.findByRole('heading', { name: 'File a complaint' });
    fireEvent.click(screen.getByRole('button', { name: 'File complaint' }));
    expect(screen.getByText('Use at least 5 characters.')).toBeInTheDocument();
    expect(screen.getByText('Tell us a little more (at least 10 characters).')).toBeInTheDocument();
    expect(complaintApi.create).not.toHaveBeenCalled();
  });

  it('sends the trimmed text and opens the new complaint with a confirmation', async () => {
    complaintApi.create.mockResolvedValue(myComplaint());
    renderApp('/dashboard/complaints/new', signedIn(USER));
    await screen.findByRole('heading', { name: 'File a complaint' });
    fill('  Device never collected ', '  The technician said he would come on Monday and did not.  ');
    fireEvent.change(screen.getByLabelText('What is it about?'), { target: { value: 'service' } });
    fireEvent.click(screen.getByRole('button', { name: 'File complaint' }));
    await waitFor(() => expect(complaintApi.create).toHaveBeenCalledWith({ subject: 'Device never collected', description: 'The technician said he would come on Monday and did not.', refType: 'service' }));
    expect(await screen.findByText('Your complaint was filed. We will keep you posted.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Device never collected' })).toBeInTheDocument();
  });

  it('can be started from another page, naming who it is about', async () => {
    complaintApi.create.mockResolvedValue(myComplaint());
    renderApp('/dashboard/complaints/new?against=u9&name=Bob%20Tech&refType=service&refId=s1', signedIn(USER));
    expect(await screen.findByText('This complaint is about Bob Tech.')).toBeInTheDocument();
    expect(screen.getByLabelText('What is it about?')).toHaveValue('service');
    fill('Device never collected', 'The technician said he would come on Monday and did not.');
    fireEvent.click(screen.getByRole('button', { name: 'File complaint' }));
    await waitFor(() => expect(complaintApi.create).toHaveBeenCalledWith(expect.objectContaining({ against: 'u9', refType: 'service', refId: 's1' })));
  });

  it('leaves the record id out when the person says it is about something else', async () => {
    complaintApi.create.mockResolvedValue(myComplaint());
    renderApp('/dashboard/complaints/new?refType=order&refId=o1', signedIn(USER));
    await screen.findByRole('heading', { name: 'File a complaint' });
    fireEvent.change(screen.getByLabelText('What is it about?'), { target: { value: 'other' } });
    fill('Something else entirely', 'It has nothing to do with that order at all.');
    fireEvent.click(screen.getByRole('button', { name: 'File complaint' }));
    await waitFor(() => expect(complaintApi.create).toHaveBeenCalledWith({ subject: 'Something else entirely', description: 'It has nothing to do with that order at all.', refType: 'other' }));
  });

  it('shows the server’s message under the field, or in a banner when it is about the whole thing', async () => {
    complaintApi.create.mockRejectedValueOnce(apiError('Validation failed', 422, 'VALIDATION_ERROR', [{ field: 'subject', message: 'Keep it to 140 characters' }]));
    renderApp('/dashboard/complaints/new', signedIn(USER));
    await screen.findByRole('heading', { name: 'File a complaint' });
    fill('A perfectly fine subject', 'A perfectly fine description of what happened.');
    fireEvent.click(screen.getByRole('button', { name: 'File complaint' }));
    expect(await screen.findByText('Keep it to 140 characters')).toBeInTheDocument();
    complaintApi.create.mockRejectedValueOnce(apiError('You already have several complaints being looked at. Please wait for an answer before filing another.', 409, 'TOO_MANY_OPEN'));
    fireEvent.change(screen.getByLabelText('Subject'), { target: { value: 'A perfectly fine subject!' } });
    fireEvent.click(screen.getByRole('button', { name: 'File complaint' }));
    expect(await screen.findByText(/already have several complaints/)).toBeInTheDocument();
  });
});

describe('one of my complaints', () => {
  it('shows what I wrote, that it is waiting, and the steps so far', async () => {
    renderApp('/dashboard/complaints/c1', signedIn(USER));
    expect(await screen.findByRole('heading', { name: 'Device never collected' })).toBeInTheDocument();
    expect(screen.getByText(/said he would come on Monday/)).toBeInTheDocument();
    expect(screen.getByText(/An administrator will look into this/)).toBeInTheDocument();
    expect(screen.getByText('Filed')).toBeInTheDocument();
    expect(screen.queryByText('The outcome')).not.toBeInTheDocument();
  });

  it('shows the outcome once it is closed', async () => {
    complaintApi.get.mockResolvedValue(myComplaint({ status: 'resolved', resolution: 'A new pickup was arranged.', timeline: [{ status: 'open', at: '2026-11-10T08:00:00.000Z' }, { status: 'resolved', at: '2026-11-11T08:00:00.000Z' }] }));
    renderApp('/dashboard/complaints/c1', signedIn(USER));
    expect(await screen.findByText('The outcome')).toBeInTheDocument();
    expect(screen.getByText('A new pickup was arranged.')).toBeInTheDocument();
    expect(screen.queryByText(/An administrator will look into this/)).not.toBeInTheDocument();
  });

  it('offers a retry when it cannot be opened', async () => {
    complaintApi.get.mockRejectedValueOnce(apiError('Complaint not found', 404));
    renderApp('/dashboard/complaints/c1', signedIn(USER));
    expect(await screen.findByText('Could not load this complaint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Device never collected' })).toBeInTheDocument();
  });
});

describe('the administrators’ complaint queue', () => {
  it('shows who filed it, who it is about, who has it, and links to the full page', async () => {
    adminComplaintApi.list.mockResolvedValue(page([queued(), queued({ _id: 'c2', subject: 'Rude on the phone', against: null, assignedTo: { _id: 'a1', name: 'Chief Admin', role: 'admin' }, status: 'assigned' })]));
    renderApp('/dashboard/admin/complaints', signedIn(ADMIN));
    const row = (await screen.findByRole('heading', { name: 'Device never collected' })).closest('article');
    expect(within(row).getByText('Waiting')).toBeInTheDocument();
    expect(row).toHaveTextContent('Filed by Alice Rao about Bob Tech');
    expect(row).toHaveTextContent('Nobody has picked it up yet');
    expect(within(row).getByRole('link', { name: 'Open complaint: Device never collected' })).toHaveAttribute('href', '/dashboard/admin/complaints/c1');
    const second = screen.getByRole('heading', { name: 'Rude on the phone' }).closest('article');
    expect(second).toHaveTextContent('Handled by Chief Admin');
    expect(second).not.toHaveTextContent('about Bob');
    expect(screen.getByRole('status')).toHaveTextContent('2 complaints');
  });

  it('filters by status and by who has it, and clears', async () => {
    renderApp('/dashboard/admin/complaints', signedIn(ADMIN));
    await screen.findByText('Device never collected');
    expect(lastCall(adminComplaintApi.list)[0]).toMatchObject({ status: '', assigned: '' }); // the server defaults to the ones still being handled
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'closed' } });
    await waitFor(() => expect(lastCall(adminComplaintApi.list)[0]).toMatchObject({ status: 'closed' }));
    fireEvent.change(screen.getByLabelText('Handled by'), { target: { value: 'me' } });
    await waitFor(() => expect(lastCall(adminComplaintApi.list)[0]).toMatchObject({ status: 'closed', assigned: 'me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(lastCall(adminComplaintApi.list)[0]).toMatchObject({ status: '', assigned: '' }));
  });

  it('says so when nothing needs attention or a filter matches nothing, and offers a retry on failure', async () => {
    adminComplaintApi.list.mockResolvedValueOnce(page([]));
    renderApp('/dashboard/admin/complaints', signedIn(ADMIN));
    expect(await screen.findByText('No complaints need attention')).toBeInTheDocument();
    adminComplaintApi.list.mockResolvedValueOnce(page([]));
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'rejected' } });
    expect(await screen.findByText('No complaint matches these filters')).toBeInTheDocument();
    adminComplaintApi.list.mockRejectedValueOnce(apiError('Server went away', 500));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(await screen.findByText('Could not load complaints')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Device never collected')).toBeInTheDocument();
  });

  it('moves between pages', async () => {
    adminComplaintApi.list.mockResolvedValue(page([queued()], { total: 25, pages: 3 }));
    renderApp('/dashboard/admin/complaints', signedIn(ADMIN));
    await screen.findByText('Device never collected');
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(lastCall(adminComplaintApi.list)[0]).toMatchObject({ page: 2 }));
  });
});

describe('handling one complaint', () => {
  it('shows both people, the text, who has it and the history, newest first', async () => {
    adminComplaintApi.get.mockResolvedValue(queued({
      status: 'assigned', assignedTo: { _id: 'a1', name: 'Chief Admin', role: 'admin' },
      history: [
        { status: 'open', at: '2026-11-10T08:00:00.000Z', note: 'Filed', by: { _id: 'u1', name: 'Alice Rao', role: 'user' } },
        { status: 'assigned', at: '2026-11-10T09:00:00.000Z', note: 'I will call both of them', by: { _id: 'a1', name: 'Chief Admin', role: 'admin' } },
      ],
    }));
    renderApp('/dashboard/admin/complaints/c1', signedIn(ADMIN));
    expect(await screen.findByRole('heading', { name: 'Device never collected' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alice Rao' })).toHaveAttribute('href', '/dashboard/admin/users/u1');
    expect(screen.getByRole('link', { name: 'Bob Tech' })).toHaveAttribute('href', '/dashboard/admin/users/u9');
    expect(screen.getByText(/said he would come on Monday/)).toBeInTheDocument();
    const history = screen.getAllByRole('listitem').filter((li) => li.textContent.includes('Chief Admin') || li.textContent.includes('Filed'));
    expect(history[0]).toHaveTextContent('Picked up');
    expect(history[0]).toHaveTextContent('I will call both of them');
    expect(history[history.length - 1]).toHaveTextContent('Filed');
  });

  it('offers only the moves the server allows', async () => {
    adminComplaintApi.get.mockResolvedValue(queued({ status: 'in_review', actions: ['resolve', 'reject'] }));
    renderApp('/dashboard/admin/complaints/c1', signedIn(ADMIN));
    await screen.findByRole('heading', { name: 'Device never collected' });
    expect(screen.getByRole('button', { name: 'Resolve' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign to me' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start review' })).not.toBeInTheDocument();
  });

  it('assigns it with an optional note and shows the updated complaint', async () => {
    adminComplaintApi.act.mockResolvedValue(queued({ status: 'assigned', assignedTo: { _id: 'a1', name: 'Chief Admin', role: 'admin' }, actions: ['start_review', 'resolve', 'reject'] }));
    renderApp('/dashboard/admin/complaints/c1', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Assign to me' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Assign to me' }));
    await waitFor(() => expect(adminComplaintApi.act).toHaveBeenCalledWith('c1', { action: 'assign' })); // no note was written, so none is sent
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Saved.')).toBeInTheDocument();
    expect(screen.getByText('Picked up')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign to me' })).not.toBeInTheDocument();
  });

  it('starts a review and sends the note when there is one', async () => {
    adminComplaintApi.act.mockResolvedValue(queued({ status: 'in_review', actions: ['resolve', 'reject'] }));
    renderApp('/dashboard/admin/complaints/c1', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Start review' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Note (optional)'), { target: { value: ' Checking the pickup log ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Start review' }));
    await waitFor(() => expect(adminComplaintApi.act).toHaveBeenCalledWith('c1', { action: 'start_review', note: 'Checking the pickup log' }));
    expect(await screen.findByText('Being reviewed')).toBeInTheDocument();
  });

  it('resolves only with an outcome of at least five characters', async () => {
    adminComplaintApi.act.mockResolvedValue(queued({ status: 'resolved', actions: [], resolution: 'A new pickup was arranged.' }));
    renderApp('/dashboard/admin/complaints/c1', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve complaint' }));
    expect(within(dialog).getByText('Give a reason of at least 5 characters.')).toBeInTheDocument();
    expect(adminComplaintApi.act).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Outcome'), { target: { value: 'A new pickup was arranged.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve complaint' }));
    await waitFor(() => expect(adminComplaintApi.act).toHaveBeenCalledWith('c1', { action: 'resolve', note: 'A new pickup was arranged.' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText(/A new pickup was arranged\./)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reject' })).not.toBeInTheDocument();
  });

  it('rejects with a reason', async () => {
    adminComplaintApi.act.mockResolvedValue(queued({ status: 'rejected', actions: [], resolution: 'A disagreement between two people.' }));
    renderApp('/dashboard/admin/complaints/c1', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Reject' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason'), { target: { value: 'A disagreement between two people.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject complaint' }));
    await waitFor(() => expect(adminComplaintApi.act).toHaveBeenCalledWith('c1', { action: 'reject', note: 'A disagreement between two people.' }));
  });

  it('keeps the dialog open and explains when someone else already closed it', async () => {
    adminComplaintApi.act.mockRejectedValue(apiError('This complaint is already closed', 409, 'ALREADY_CLOSED'));
    renderApp('/dashboard/admin/complaints/c1', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Resolve' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Outcome'), { target: { value: 'Dealt with by phone.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Resolve complaint' }));
    expect(await within(dialog).findByText('This complaint is already closed')).toBeInTheDocument();
  });

  it('shows a closed complaint with its outcome and no buttons', async () => {
    adminComplaintApi.get.mockResolvedValue(queued({ status: 'resolved', actions: [], resolution: 'Dealt with by phone.' }));
    renderApp('/dashboard/admin/complaints/c1', signedIn(ADMIN));
    expect(await screen.findByText('Dealt with by phone.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Resolve|Reject|Assign|Start review/ })).not.toBeInTheDocument();
  });

  it('offers a retry when it cannot be opened', async () => {
    adminComplaintApi.get.mockRejectedValueOnce(apiError('Complaint not found', 404));
    renderApp('/dashboard/admin/complaints/c1', signedIn(ADMIN));
    expect(await screen.findByText('Could not load this complaint')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Device never collected' })).toBeInTheDocument();
  });
});

describe('announcements', () => {
  it('lists them with their state, who sees them, the window and who wrote them', async () => {
    adminAnnouncementApi.list.mockResolvedValue(page([
      announcement(),
      announcement({ _id: 'n2', title: 'For technicians', audience: ['technician', 'refurbisher'], state: 'scheduled', endsAt: '2026-12-01T08:00:00.000Z' }),
      announcement({ _id: 'n3', title: 'Old notice', state: 'ended' }),
    ]));
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    const now = (await screen.findByRole('heading', { name: 'Planned maintenance' })).closest('article');
    expect(within(now).getByText('Showing now')).toBeInTheDocument();
    expect(now).toHaveTextContent('For Everyone');
    expect(now).toHaveTextContent('no end date');
    expect(now).toHaveTextContent('by Chief Admin');
    const later = screen.getByRole('heading', { name: 'For technicians' }).closest('article');
    expect(within(later).getByText('Scheduled')).toBeInTheDocument();
    expect(later).toHaveTextContent('For Technician, Refurbisher');
    expect(later).toHaveTextContent('until');
    expect(within(later).queryByRole('button', { name: /End .* now/ })).not.toBeInTheDocument();
    expect(within(screen.getByRole('heading', { name: 'Old notice' }).closest('article')).getByText('Ended')).toBeInTheDocument();
  });

  it('filters by state', async () => {
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    await screen.findByText('Planned maintenance');
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'scheduled' } });
    await waitFor(() => expect(lastCall(adminAnnouncementApi.list)[0]).toMatchObject({ state: 'scheduled' }));
  });

  it('checks the form before sending: text, audience and dates', async () => {
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: /New announcement/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(within(dialog).getByText('Use at least 3 characters.')).toBeInTheDocument();
    expect(within(dialog).getByText('Use at least 5 characters.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Planned maintenance' } });
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Slow on Sunday morning.' } });
    fireEvent.click(within(dialog).getByLabelText(/Everyone/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(within(dialog).getByText('Choose who should see it.')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByLabelText(/Everyone/));
    fireEvent.change(within(dialog).getByLabelText('Starts (optional)'), { target: { value: '2099-01-02T10:00' } });
    fireEvent.change(within(dialog).getByLabelText('Ends (optional)'), { target: { value: '2099-01-01T10:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(within(dialog).getByText('The end must be after the start.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Starts (optional)'), { target: { value: '' } });
    fireEvent.change(within(dialog).getByLabelText('Ends (optional)'), { target: { value: '2020-01-01T10:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(within(dialog).getByText('The end must be in the future.')).toBeInTheDocument();
    expect(adminAnnouncementApi.create).not.toHaveBeenCalled();
  });

  it('publishes for everyone with only what was filled in, then reloads', async () => {
    adminAnnouncementApi.create.mockResolvedValue(announcement());
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: /New announcement/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: '  Planned maintenance ' } });
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: ' The site will be slow on Sunday morning. ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(adminAnnouncementApi.create).toHaveBeenCalledWith({ title: 'Planned maintenance', body: 'The site will be slow on Sunday morning.', audience: ['all'] }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adminAnnouncementApi.list).toHaveBeenCalledTimes(2);
  });

  it('publishes for chosen roles with a start and an end', async () => {
    adminAnnouncementApi.create.mockResolvedValue(announcement());
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: /New announcement/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'For providers' } });
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Please update your documents.' } });
    fireEvent.click(within(dialog).getByLabelText(/Everyone/));
    fireEvent.click(within(dialog).getByLabelText('Technician'));
    fireEvent.click(within(dialog).getByLabelText('Refurbisher'));
    fireEvent.change(within(dialog).getByLabelText('Starts (optional)'), { target: { value: '2099-01-01T09:00' } });
    fireEvent.change(within(dialog).getByLabelText('Ends (optional)'), { target: { value: '2099-01-05T09:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(adminAnnouncementApi.create).toHaveBeenCalledWith({
      title: 'For providers', body: 'Please update your documents.', audience: ['technician', 'refurbisher'],
      startsAt: new Date('2099-01-01T09:00').toISOString(), endsAt: new Date('2099-01-05T09:00').toISOString(),
    }));
  });

  it('shows the server’s message under the field, or in a banner', async () => {
    adminAnnouncementApi.create.mockRejectedValueOnce(apiError('Validation failed', 422, 'VALIDATION_ERROR', [{ field: 'title', message: 'Use at least 3 characters' }]));
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: /New announcement/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Planned maintenance' } });
    fireEvent.change(within(dialog).getByLabelText('Message'), { target: { value: 'Slow on Sunday morning.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await within(dialog).findByText('Use at least 3 characters')).toBeInTheDocument();
    adminAnnouncementApi.create.mockRejectedValueOnce(apiError('Server went away', 500));
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Planned maintenance again' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Publish' }));
    expect(await within(dialog).findByText('Server went away')).toBeInTheDocument();
  });

  it('edits an announcement and sends only what changed; closing with no change sends nothing', async () => {
    adminAnnouncementApi.update.mockResolvedValue(announcement({ title: 'Maintenance on Sunday' }));
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Planned maintenance' }));
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Title')).toHaveValue('Planned maintenance');
    expect(within(dialog).getByLabelText(/Everyone/)).toBeChecked();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adminAnnouncementApi.update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit Planned maintenance' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Title'), { target: { value: 'Maintenance on Sunday' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminAnnouncementApi.update).toHaveBeenCalledWith('n1', { title: 'Maintenance on Sunday' }));
  });

  it('can clear the end of an announcement', async () => {
    adminAnnouncementApi.list.mockResolvedValue(page([announcement({ endsAt: '2099-01-05T09:00:00.000Z' })]));
    adminAnnouncementApi.update.mockResolvedValue(announcement());
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit Planned maintenance' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Ends (optional)'), { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(adminAnnouncementApi.update).toHaveBeenCalledWith('n1', { endsAt: null }));
  });

  it('ends one now after confirming', async () => {
    adminAnnouncementApi.update.mockResolvedValue(announcement({ state: 'ended' }));
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'End Planned maintenance now' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('stops showing on the site straight away');
    fireEvent.click(within(dialog).getByRole('button', { name: 'End now' }));
    await waitFor(() => expect(adminAnnouncementApi.update).toHaveBeenCalledWith('n1', { endsAt: expect.any(String) }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(adminAnnouncementApi.list).toHaveBeenCalledTimes(2);
  });

  it('deletes one after confirming, and explains a refusal on the page', async () => {
    adminAnnouncementApi.remove.mockRejectedValueOnce(apiError('Announcement not found', 404));
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Planned maintenance' }));
    let dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('removed for good');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete announcement' }));
    expect(await screen.findByText('Announcement not found')).toBeInTheDocument();
    adminAnnouncementApi.remove.mockResolvedValueOnce({ _id: 'n1' });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Planned maintenance' }));
    dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete announcement' }));
    await waitFor(() => expect(adminAnnouncementApi.remove).toHaveBeenCalledTimes(2));
  });

  it('says so when there are none, and offers a retry on failure', async () => {
    adminAnnouncementApi.list.mockResolvedValueOnce(page([]));
    renderApp('/dashboard/admin/announcements', signedIn(ADMIN));
    expect(await screen.findByText('There are no announcements')).toBeInTheDocument();
    adminAnnouncementApi.list.mockRejectedValueOnce(apiError('Server went away', 500));
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'ended' } });
    expect(await screen.findByText('Could not load announcements')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Planned maintenance')).toBeInTheDocument();
  });
});

describe('the audit log', () => {
  it('shows what was done, by whom, when, to what and why, with a link to the item', async () => {
    renderApp('/dashboard/admin/audit', signedIn(ADMIN));
    const row = (await screen.findByRole('heading', { name: 'Suspended the account' })).closest('article');
    expect(within(row).getByText('Account')).toBeInTheDocument();
    expect(row).toHaveTextContent('Chief Admin');
    expect(row).toHaveTextContent('from 10.0.0.1');
    expect(row).toHaveTextContent('“Repeated no-shows”');
    expect(within(row).getByRole('link', { name: 'Open account' })).toHaveAttribute('href', '/dashboard/admin/users/u9');
    expect(screen.getByRole('status')).toHaveTextContent('1 entry');
  });

  it('counts several entries correctly', async () => {
    adminAuditApi.list.mockResolvedValue(page([logRow(), logRow({ _id: 'g2' })], auditMeta));
    renderApp('/dashboard/admin/audit', signedIn(ADMIN));
    expect(await screen.findByRole('status')).toHaveTextContent('2 entries');
  });

  it('reveals what changed, before and after', async () => {
    renderApp('/dashboard/admin/audit', signedIn(ADMIN));
    const row = (await screen.findByRole('heading', { name: 'Suspended the account' })).closest('article');
    expect(within(row).getByText('Show what changed')).toBeInTheDocument();
    expect(row).toHaveTextContent('"status": "active"');
    expect(row).toHaveTextContent('"status": "suspended"');
  });

  it('shows a row without a target or changes plainly', async () => {
    adminAuditApi.list.mockResolvedValue(page([logRow({ _id: 'g2', action: 'verification.document_viewed', targetType: '', targetId: null, reason: '', before: null, after: null, ip: '' })], auditMeta));
    renderApp('/dashboard/admin/audit', signedIn(ADMIN));
    const row = (await screen.findByRole('heading', { name: 'Opened a document' })).closest('article');
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(within(row).queryByText('Show what changed')).not.toBeInTheDocument();
  });

  it('filters by action, kind, administrator and dates, and clears', async () => {
    renderApp('/dashboard/admin/audit', signedIn(ADMIN));
    await screen.findByRole('option', { name: 'Dismissed the report' });
    fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'report.dismissed' } });
    await waitFor(() => expect(lastCall(adminAuditApi.list)[0]).toMatchObject({ action: 'report.dismissed' }));
    fireEvent.change(screen.getByLabelText('About'), { target: { value: 'Report' } });
    await waitFor(() => expect(lastCall(adminAuditApi.list)[0]).toMatchObject({ action: 'report.dismissed', targetType: 'Report' }));
    fireEvent.change(screen.getByLabelText('Administrator'), { target: { value: 'a1' } });
    await waitFor(() => expect(lastCall(adminAuditApi.list)[0]).toMatchObject({ admin: 'a1' }));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-12' } });
    await waitFor(() => expect(lastCall(adminAuditApi.list)[0]).toMatchObject({ from: '2026-11-01', to: '2026-11-12' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(lastCall(adminAuditApi.list)[0]).toMatchObject({ action: '', targetType: '', admin: '', from: '', to: '' }));
  });

  it('says so when nothing matches, offers a retry on failure and moves between pages', async () => {
    adminAuditApi.list.mockResolvedValueOnce(page([], auditMeta));
    renderApp('/dashboard/admin/audit', signedIn(ADMIN));
    expect(await screen.findByText('Nothing has been recorded yet')).toBeInTheDocument();
    adminAuditApi.list.mockRejectedValueOnce(apiError('Server went away', 500));
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    expect(await screen.findByText('Could not load the audit log')).toBeInTheDocument();
    adminAuditApi.list.mockResolvedValue(page([logRow()], { ...auditMeta, total: 40, pages: 3 }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByText('Suspended the account', { selector: 'h2' });
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(lastCall(adminAuditApi.list)[0]).toMatchObject({ page: 2 }));
  });
});

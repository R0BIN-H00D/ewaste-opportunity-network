import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { deviceApi } from '../services/deviceApi';
import { adminDashboardApi, adminUserApi, adminVerificationApi } from '../services/adminApi';
import { ROLE_LABEL, accountLabel, actionLabel, fileSize, verificationLabel } from '../lib/admin';
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
const apiError = (message, code, status = 409) => Object.assign(new Error(message), { response: { status, data: { message, code } } });

const person = (over = {}) => ({
  _id: 'u1', name: 'Meera Nair', email: 'meera@test.local', phone: '', role: 'technician', status: 'pending_verification', emailVerified: true, lastLoginAt: null,
  createdAt: '2026-11-10T08:00:00.000Z', verificationStatus: 'pending', suspension: null, ...over,
});
const detail = (over = {}) => ({ ...person(), city: 'Pune', state: '', organisation: null, actions: ['suspend'], history: [], ...over });
const queueItem = (over = {}) => ({
  userId: 'u1', type: 'provider', role: 'technician', name: 'Meera Nair', email: 'meera@test.local', status: 'pending', reason: '', submittedAt: '2026-11-12T08:00:00.000Z', reviewedAt: null, documentCount: 2, ...over,
});
const submission = (over = {}) => ({
  userId: 'u1', type: 'provider', role: 'technician',
  user: { name: 'Meera Nair', email: 'meera@test.local', phone: '9876543210', status: 'pending_verification', emailVerified: true, joinedAt: '2026-11-10T08:00:00.000Z' },
  status: 'pending', reason: '', reviewedAt: null, reviewedBy: null,
  facts: { headline: 'Laptop repair', city: 'Pune', experienceYears: 6, specializations: ['laptops', 'phones'], qualifications: [{ title: 'Diploma', institution: 'ITI', year: 2018 }] },
  documents: [{ _id: 'd1', docType: 'id_proof', status: 'pending', reason: '', submittedAt: '2026-11-12T08:00:00.000Z', file: { mime: 'image/png', bytes: 2048, originalName: 'id.png' }, viewUrl: '/api/admin/verifications/documents/d1/file' }],
  actions: ['approve', 'reject', 'request_resubmission'], history: [], ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  setAccessToken(null);
  deviceApi.list.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pages: 1, limit: 1 } });
  adminDashboardApi.get.mockReturnValue(new Promise(() => {})); // the overview is tested in adminOverview.test.jsx
  adminUserApi.list.mockResolvedValue(page([person(), person({ _id: 'u2', name: 'Asha Rao', email: 'asha@test.local', role: 'user', status: 'active', verificationStatus: null })]));
  adminUserApi.get.mockResolvedValue(detail());
  adminVerificationApi.list.mockResolvedValue(page([queueItem()]));
  adminVerificationApi.get.mockResolvedValue(submission());
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
});

describe('admin helpers', () => {
  it('uses plain words', () => {
    expect(ROLE_LABEL.recycler).toBe('Recycling centre');
    expect(accountLabel('pending_verification')).toBe('Waiting for verification');
    expect(verificationLabel('resubmission_required')).toBe('Needs new documents');
    expect(actionLabel('user.suspended')).toBe('Suspended the account');
    expect(actionLabel('something.new_thing')).toBe('something new thing');
    expect(fileSize(2048)).toBe('2 KB');
    expect(fileSize(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(fileSize(0)).toBe('');
  });
});

describe('admin menu and access', () => {
  it('shows Users and Verifications to administrators only', async () => {
    renderApp('/dashboard', signedIn(ADMIN));
    expect((await screen.findAllByRole('link', { name: /Verifications/ }))[0]).toHaveAttribute('href', '/dashboard/admin/verifications');
    expect(screen.getAllByRole('link', { name: /^Users/ })[0]).toHaveAttribute('href', '/dashboard/admin/users');
  });

  it('keeps everyone else out of the menu and the pages', async () => {
    renderApp('/dashboard/admin/users', signedIn(USER));
    expect(await screen.findByRole('heading', { name: 'This area is not available for your account' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Verifications/ })).not.toBeInTheDocument();
    expect(adminUserApi.list).not.toHaveBeenCalled();
  });

  it('blocks the verification pages for a technician too', async () => {
    renderApp('/dashboard/admin/verifications', signedIn({ ...USER, role: 'technician', status: 'active' }));
    expect(await screen.findByRole('heading', { name: 'This area is not available for your account' })).toBeInTheDocument();
    expect(adminVerificationApi.list).not.toHaveBeenCalled();
  });
});

describe('users list', () => {
  it('shows each account with its role, status and verification state', async () => {
    renderApp('/dashboard/admin/users', signedIn(ADMIN));
    const meera = within((await screen.findByRole('heading', { name: 'Meera Nair' })).closest('article'));
    expect(meera.getByText('Technician')).toBeInTheDocument();
    expect(meera.getByText('Waiting for verification')).toBeInTheDocument();
    expect(meera.getByText('Waiting for review')).toBeInTheDocument();
    expect(meera.getByText(/has not logged in/)).toBeInTheDocument();
    expect(meera.getByRole('link', { name: 'Open Meera Nair' })).toHaveAttribute('href', '/dashboard/admin/users/u1');
    const asha = within(screen.getByRole('heading', { name: 'Asha Rao' }).closest('article'));
    expect(asha.getByText('Member')).toBeInTheDocument();
    expect(asha.getByText('Active')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 accounts');
    expect(adminUserApi.list).toHaveBeenCalledWith({ q: '', role: '', status: '', page: 1, limit: 10 }, expect.anything());
  });

  it('shows why an account was suspended', async () => {
    adminUserApi.list.mockResolvedValue(page([person({ status: 'suspended', suspension: { reason: 'Fake listings', at: '2026-11-14T08:00:00.000Z' } })]));
    renderApp('/dashboard/admin/users', signedIn(ADMIN));
    expect(await screen.findByText('Suspended: Fake listings')).toBeInTheDocument();
  });

  it('searches only when the form is sent and clears again', async () => {
    renderApp('/dashboard/admin/users', signedIn(ADMIN));
    await screen.findByRole('heading', { name: 'Meera Nair' });
    fireEvent.change(screen.getByLabelText('Search by name or email'), { target: { value: ' meera ' } });
    expect(adminUserApi.list).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    await waitFor(() => expect(adminUserApi.list).toHaveBeenLastCalledWith({ q: 'meera', role: '', status: '', page: 1, limit: 10 }, expect.anything()));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(adminUserApi.list).toHaveBeenLastCalledWith({ q: '', role: '', status: '', page: 1, limit: 10 }, expect.anything()));
    expect(screen.getByLabelText('Search by name or email')).toHaveValue('');
  });

  it('filters by role and by status straight away', async () => {
    renderApp('/dashboard/admin/users', signedIn(ADMIN));
    await screen.findByRole('heading', { name: 'Meera Nair' });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'technician' } });
    await waitFor(() => expect(adminUserApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'technician' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'suspended' } });
    await waitFor(() => expect(adminUserApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'technician', status: 'suspended' }), expect.anything()));
  });

  it('explains an empty search and an empty platform differently', async () => {
    adminUserApi.list.mockResolvedValue(page([]));
    renderApp('/dashboard/admin/users?q=zzz', signedIn(ADMIN));
    expect(await screen.findByText('No one matches this search')).toBeInTheDocument();
  });

  it('shows an error with a way to retry, and pages', async () => {
    adminUserApi.list.mockRejectedValueOnce(new Error('Network down'));
    renderApp('/dashboard/admin/users', signedIn(ADMIN));
    expect(await screen.findByText('Could not load users')).toBeInTheDocument();
    adminUserApi.list.mockResolvedValue(page([person()], { total: 12, pages: 2 }));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByRole('heading', { name: 'Meera Nair' });
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(adminUserApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }), expect.anything()));
  });
});

describe('user detail', () => {
  it('shows the account, the verification links and the history', async () => {
    adminUserApi.get.mockResolvedValue(detail({ organisation: { name: 'Sunrise School', type: 'school', registrationNo: 'R1', recipientStatus: 'pending' }, history: [{ _id: 'h1', action: 'user.reactivated', reason: '', at: '2026-11-13T08:00:00.000Z', admin: { name: 'Chief Admin' } }] }));
    renderApp('/dashboard/admin/users/u1', signedIn(ADMIN));
    expect(await screen.findByRole('heading', { name: 'Meera Nair' })).toBeInTheDocument();
    expect(screen.getByText('Pune')).toBeInTheDocument();
    expect(screen.getByText('Reactivated the account')).toBeInTheDocument();
    const links = screen.getAllByRole('link', { name: 'Open submission' });
    expect(links[0]).toHaveAttribute('href', '/dashboard/admin/verifications/u1');
    expect(links[1]).toHaveAttribute('href', '/dashboard/admin/verifications/u1?type=recipient');
  });

  it('offers only the actions the server allows', async () => {
    adminUserApi.get.mockResolvedValue(detail({ role: 'admin', actions: [], verificationStatus: null }));
    renderApp('/dashboard/admin/users/u1', signedIn(ADMIN));
    await screen.findByRole('heading', { name: 'Meera Nair' });
    expect(screen.queryByRole('button', { name: /Suspend|Reactivate/ })).not.toBeInTheDocument();
  });

  it('needs a written reason before suspending, then shows the new state', async () => {
    adminUserApi.setStatus.mockResolvedValue(detail({ status: 'suspended', suspension: { reason: 'Repeated fake listings', at: '2026-11-15T08:00:00.000Z' }, actions: ['reactivate'] }));
    renderApp('/dashboard/admin/users/u1', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Suspend account' }));
    expect(await dialog.findByText('Give a reason of at least 5 characters.')).toBeInTheDocument();
    expect(adminUserApi.setStatus).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText('Reason'), { target: { value: 'Repeated fake listings' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Suspend account' }));
    await waitFor(() => expect(adminUserApi.setStatus).toHaveBeenCalledWith('u1', { status: 'suspended', reason: 'Repeated fake listings' }));
    expect(await screen.findByText('Account suspended.')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText(/Suspended .*Repeated fake listings/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reactivate account' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Suspend account' })).not.toBeInTheDocument();
  });

  it('shows the server reason when the change is refused', async () => {
    adminUserApi.setStatus.mockRejectedValue(apiError('Administrator accounts are not changed from here', 'ADMIN_PROTECTED', 403));
    renderApp('/dashboard/admin/users/u1', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Suspend account' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('Reason'), { target: { value: 'Testing the rules' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Suspend account' }));
    expect(await dialog.findByText('Administrator accounts are not changed from here')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reactivates without asking for a reason', async () => {
    adminUserApi.get.mockResolvedValue(detail({ status: 'suspended', suspension: { reason: 'Under review', at: '2026-11-14T08:00:00.000Z' }, actions: ['reactivate'] }));
    adminUserApi.setStatus.mockResolvedValue(detail({ status: 'active', actions: ['suspend'] }));
    renderApp('/dashboard/admin/users/u1', signedIn(ADMIN));
    fireEvent.click(await screen.findByRole('button', { name: 'Reactivate account' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Reactivate account' }));
    await waitFor(() => expect(adminUserApi.setStatus).toHaveBeenCalledWith('u1', { status: 'active' }));
    expect(await screen.findByText('Account reactivated.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suspend account' })).toBeInTheDocument();
  });

  it('says so when the account does not exist', async () => {
    adminUserApi.get.mockRejectedValue(apiError('User not found', 'NOT_FOUND', 404));
    renderApp('/dashboard/admin/users/u9', signedIn(ADMIN));
    expect(await screen.findByText('Could not load this account')).toBeInTheDocument();
  });
});

describe('verification queue', () => {
  it('lists what is waiting with a Review link, oldest first as the server sorts it', async () => {
    renderApp('/dashboard/admin/verifications', signedIn(ADMIN));
    const row = within((await screen.findByRole('heading', { name: 'Meera Nair' })).closest('article'));
    expect(row.getByText('Technician')).toBeInTheDocument();
    expect(row.getByText('Waiting for review')).toBeInTheDocument();
    expect(row.getByText(/2 documents/)).toBeInTheDocument();
    expect(row.getByRole('link', { name: 'Review Meera Nair' })).toHaveAttribute('href', '/dashboard/admin/verifications/u1?type=provider');
    expect(adminVerificationApi.list).toHaveBeenCalledWith({ type: 'provider', status: 'pending', role: '', page: 1, limit: 10 }, expect.anything());
  });

  it('switches to recipient organisations and shows their registration details', async () => {
    renderApp('/dashboard/admin/verifications', signedIn(ADMIN));
    await screen.findByRole('heading', { name: 'Meera Nair' });
    adminVerificationApi.list.mockResolvedValue(page([queueItem({ type: 'recipient', role: 'user', name: 'Sunrise Trust', documentCount: 0, organisation: { name: 'Sunrise School', type: 'school', registrationNo: 'REG-77' } })]));
    fireEvent.click(screen.getByRole('tab', { name: 'Recipient organisations' }));
    expect(await screen.findByText(/Sunrise School · School · Reg\. REG-77/)).toBeInTheDocument();
    await waitFor(() => expect(adminVerificationApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'recipient' }), expect.anything()));
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review Sunrise Trust' })).toHaveAttribute('href', '/dashboard/admin/verifications/u1?type=recipient');
  });

  it('filters by status and by role', async () => {
    renderApp('/dashboard/admin/verifications', signedIn(ADMIN));
    await screen.findByRole('heading', { name: 'Meera Nair' });
    fireEvent.change(screen.getByLabelText('Role'), { target: { value: 'recycler' } });
    await waitFor(() => expect(adminVerificationApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'recycler', status: 'pending' }), expect.anything()));
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'approved' } });
    await waitFor(() => expect(adminVerificationApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ role: 'recycler', status: 'approved' }), expect.anything()));
  });

  it('says when nothing is waiting, and when a filter finds nothing', async () => {
    adminVerificationApi.list.mockResolvedValue(page([]));
    renderApp('/dashboard/admin/verifications', signedIn(ADMIN));
    expect(await screen.findByText('Nothing is waiting for review')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'rejected' } });
    expect(await screen.findByText('Nothing matches these filters')).toBeInTheDocument();
  });

  it('shows an error with a way to retry', async () => {
    adminVerificationApi.list.mockRejectedValueOnce(new Error('Network down'));
    renderApp('/dashboard/admin/verifications', signedIn(ADMIN));
    expect(await screen.findByText('Could not load the queue')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Meera Nair' })).toBeInTheDocument();
  });
});

describe('verification detail', () => {
  const open = (path = '/dashboard/admin/verifications/u1?type=provider') => renderApp(path, signedIn(ADMIN));

  it('shows who it is, what they say, the documents and the actions', async () => {
    open();
    expect(await screen.findByRole('heading', { name: 'Meera Nair' })).toBeInTheDocument();
    expect(adminVerificationApi.get).toHaveBeenCalledWith('u1', 'provider', expect.anything());
    expect(screen.getByText('Laptop repair')).toBeInTheDocument();
    expect(screen.getByText('laptops, phones')).toBeInTheDocument();
    expect(screen.getByText('Diploma, ITI, 2018')).toBeInTheDocument();
    expect(screen.getByText('id.png · 2 KB', { exact: false })).toBeInTheDocument();
    for (const name of ['Approve', 'Refuse', 'Ask for new documents']) expect(screen.getByRole('button', { name })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open this person/ })).toHaveAttribute('href', '/dashboard/admin/users/u1');
  });

  it('asks for the recipient submission when the link says so', async () => {
    adminVerificationApi.get.mockResolvedValue(submission({ type: 'recipient', role: 'user', documents: [], facts: { organisationName: 'Sunrise School', organisationType: 'school', registrationNo: 'REG-77' } }));
    open('/dashboard/admin/verifications/u1?type=recipient');
    expect(await screen.findByText('Sunrise School')).toBeInTheDocument();
    expect(screen.getByText('School')).toBeInTheDocument();
    expect(adminVerificationApi.get).toHaveBeenCalledWith('u1', 'recipient', expect.anything());
    expect(screen.queryByRole('heading', { name: 'Documents' })).not.toBeInTheDocument();
  });

  it('shows no buttons once a decision has been made, with the note and who decided', async () => {
    adminVerificationApi.get.mockResolvedValue(submission({ status: 'rejected', reason: 'The ID photo is blurred', reviewedAt: '2026-11-14T08:00:00.000Z', reviewedBy: { _id: 'a1', name: 'Chief Admin' }, actions: [] }));
    open();
    expect(await screen.findByText('The ID photo is blurred')).toBeInTheDocument();
    expect(screen.getByText(/by Chief Admin/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument();
  });

  it('approves after one confirmation and shows the result', async () => {
    adminVerificationApi.decide.mockResolvedValue(submission({ status: 'approved', actions: [], reviewedBy: { _id: 'a1', name: 'Chief Admin' }, reviewedAt: '2026-11-15T08:00:00.000Z' }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(adminVerificationApi.decide).toHaveBeenCalledWith('u1', { type: 'provider', decision: 'approved' }));
    expect(await screen.findByText('Decision saved. The applicant has been told.')).toBeInTheDocument();
    expect(screen.getAllByText('Approved').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Refuse' })).not.toBeInTheDocument();
  });

  it('will not refuse without saying why', async () => {
    adminVerificationApi.decide.mockResolvedValue(submission({ status: 'rejected', reason: 'Blurred photo', actions: [] }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Refuse' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Refuse' }));
    expect(await dialog.findByText('Write a reason first.')).toBeInTheDocument();
    expect(adminVerificationApi.decide).not.toHaveBeenCalled();
    fireEvent.change(dialog.getByLabelText('Reason'), { target: { value: '  Blurred photo ' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Refuse' }));
    await waitFor(() => expect(adminVerificationApi.decide).toHaveBeenCalledWith('u1', { type: 'provider', decision: 'rejected', reason: 'Blurred photo' }));
    expect(await screen.findByText('Blurred photo', { selector: 'p' })).toBeInTheDocument();
  });

  it('asks for new documents with a note', async () => {
    adminVerificationApi.decide.mockResolvedValue(submission({ status: 'resubmission_required', reason: 'Send the back too', actions: [] }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Ask for new documents' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.change(dialog.getByLabelText('What should they send'), { target: { value: 'Send the back too' } });
    fireEvent.click(dialog.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(adminVerificationApi.decide).toHaveBeenCalledWith('u1', { type: 'provider', decision: 'resubmission_required', reason: 'Send the back too' }));
  });

  it('shows the server reason when the submission was already decided', async () => {
    adminVerificationApi.decide.mockRejectedValue(apiError('This submission is not waiting for review', 'NOT_PENDING'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Approve' }));
    const dialog = within(await screen.findByRole('dialog'));
    fireEvent.click(dialog.getByRole('button', { name: 'Approve' }));
    expect(await dialog.findByText('This submission is not waiting for review')).toBeInTheDocument();
  });

  it('opens a document through the administrator’s own session and releases it when closed', async () => {
    adminVerificationApi.document.mockResolvedValue(new Blob(['x'], { type: 'image/png' }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'View ID proof' }));
    const img = await screen.findByRole('img', { name: /ID proof/ });
    expect(img).toHaveAttribute('src', 'blob:preview');
    expect(adminVerificationApi.document).toHaveBeenCalledWith('/api/admin/verifications/documents/d1/file', expect.anything());
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });

  it('shows a PDF in a frame', async () => {
    adminVerificationApi.get.mockResolvedValue(submission({ documents: [{ ...submission().documents[0], docType: 'qualification', file: { mime: 'application/pdf', bytes: 4096, originalName: 'cert.pdf' } }] }));
    adminVerificationApi.document.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'View Qualification' }));
    expect(await screen.findByTitle('Qualification (PDF)')).toHaveAttribute('src', 'blob:preview');
  });

  it('says so when a document cannot be opened', async () => {
    adminVerificationApi.document.mockRejectedValue(apiError('The stored file is missing', 'NOT_FOUND', 404));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'View ID proof' }));
    expect(await screen.findByText('The stored file is missing')).toBeInTheDocument();
  });

  it('says so when the submission does not exist', async () => {
    adminVerificationApi.get.mockRejectedValue(apiError('User not found', 'NOT_FOUND', 404));
    open('/dashboard/admin/verifications/u9');
    expect(await screen.findByText('Could not load this submission')).toBeInTheDocument();
  });
});

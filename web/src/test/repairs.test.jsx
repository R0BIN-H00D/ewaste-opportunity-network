import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { categoryApi, deviceApi } from '../services/deviceApi';
import { requestApi, reviewApi, technicianApi, transactionApi } from '../services/repairApi';
import { _resetCategoriesCache } from '../hooks/useCategories';
import { journeySteps, statusLabel } from '../lib/requests';
import { TECH, USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/repairApi', () => ({
  technicianApi: { list: vi.fn(), get: vi.fn(), setAvailability: vi.fn(), recommendations: vi.fn() },
  reviewApi: { list: vi.fn(), create: vi.fn() },
  transactionApi: { list: vi.fn(), summary: vi.fn(), confirm: vi.fn() },
  requestApi: {
    create: vi.fn(), list: vi.fn(), get: vi.fn(), setStatus: vi.fn(), quote: vi.fn(), quotations: vi.fn(), decide: vi.fn(),
    progress: vi.fn(), pickup: vi.fn(), handover: vi.fn(), confirmCompletion: vi.fn(), cancel: vi.fn(),
  },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const TECHNICIAN_USER = { ...TECH, status: 'active' };
const page = (items) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 12 } });
const tech = (over = {}) => ({
  _id: 't1', name: 'Ananya Iyer', headline: 'Laptop and phone repairs', ratingAvg: 4.5, ratingCount: 10, completedJobs: 5, experienceYears: 4,
  availability: { status: 'available' }, serviceRadiusKm: 15, city: 'Bengaluru', categories: [{ _id: 'c1', name: 'Laptops' }], specializations: [], qualifications: [], ...over,
});
const listing = (over = {}) => ({ _id: 'l1', title: 'Dell Inspiron 15', status: 'listed', preferredService: 'repair', condition: 'minor_damage', device: { photos: [] }, city: 'Bengaluru', ...over });
const request = (over = {}) => ({
  _id: 'r1', status: 'request_submitted', mode: 'targeted', onSite: false, issueDescription: 'Screen cracked',
  listing: { _id: 'l1', title: 'Dell Inspiron 15', brand: 'Dell', model: '15', device: { photos: [] }, addressArea: 'Indiranagar', city: 'Bengaluru' },
  customer: { _id: 'u1', name: 'Asha Rao' }, technician: { _id: 't1', name: 'Ananya Iyer' }, activeQuotation: null,
  statusHistory: [{ status: 'request_submitted', at: '2026-11-15T06:00:00.000Z' }], repairNotes: [], progressPhotos: [], completionPhotos: [],
  handover: { collect: {}, delivery: {} }, pickup: null, viewerRole: 'customer', actions: ['cancel'],
  createdAt: '2026-11-15T06:00:00.000Z', updatedAt: '2026-11-15T06:00:00.000Z', ...over,
});
const quotation = (over = {}) => ({ _id: 'q1', version: 1, amount: 800, status: 'submitted', breakdown: [{ label: 'Screen', amount: 600 }, { label: 'Labour', amount: 200 }], etaDays: 3, ...over });
const noReviews = () => ({ items: [], meta: { page: 1, pages: 1, total: 0, summary: { average: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } } } });
const summary = (over = {}) => ({ received: { count: 0, total: 0 }, paid: { count: 0, total: 0 }, awaitingConfirmation: 0, ...over });
const txn = (over = {}) => ({ _id: 'x1', type: 'repair', amount: 800, method: 'offline', status: 'recorded', direction: 'paid', counterparty: { _id: 't1', name: 'Ravi Kumar' }, subject: { kind: 'repair', id: 'r1', title: 'Dell Inspiron 15', link: '/dashboard/requests/r1' }, canConfirm: false, createdAt: '2026-11-15T07:00:00.000Z', ...over });
const apiError = (message, code, status = 409) => Object.assign(new Error(message), { response: { status, data: { message, code } } });

beforeEach(() => {
  vi.resetAllMocks();
  _resetCategoriesCache();
  setAccessToken(null);
  categoryApi.list.mockResolvedValue([{ slug: 'laptops', name: 'Laptops' }]);
  deviceApi.list.mockResolvedValue(page([]));
  technicianApi.list.mockResolvedValue(page([]));
  requestApi.list.mockResolvedValue(page([]));
  reviewApi.list.mockResolvedValue(noReviews());
  transactionApi.list.mockResolvedValue(page([]));
  transactionApi.summary.mockResolvedValue(summary());
});

describe('journey helper', () => {
  const state = (r) => Object.fromEntries(journeySteps(r).map((s) => [s.key, s.state]));

  it('marks earlier steps done and the current one active', () => {
    expect(state({ status: 'customer_approval_pending' })).toMatchObject({ request_submitted: 'done', diagnosis_in_progress: 'done', customer_approval_pending: 'current', repair_in_progress: 'todo' });
    expect(state({ status: 'device_collection_pending' }).technician_assigned).toBe('current');
  });

  it('skips collection and delivery for on-site repairs', () => {
    const keys = journeySteps({ status: 'repair_in_progress', onSite: true }).map((s) => s.key);
    expect(keys).not.toContain('device_collected');
    expect(keys).not.toContain('device_delivered');
  });

  it('shows how far a stopped request got and finishes completed ones', () => {
    const stopped = state({ status: 'cancelled', statusHistory: [{ status: 'request_submitted' }, { status: 'technician_assigned' }, { status: 'cancelled' }] });
    expect(stopped.technician_assigned).toBe('done');
    expect(Object.values(stopped)).not.toContain('current');
    expect(Object.values(state({ status: 'service_completed' })).every((s) => s === 'done')).toBe(true);
  });

  it('has a plain label for every status', () => {
    expect(statusLabel('customer_approval_pending')).toBe('Waiting for approval');
    expect(statusLabel('something_new')).toBe('something new');
  });
});

describe('technician directory and profile', () => {
  it('lists verified technicians and filters by device type', async () => {
    technicianApi.list.mockResolvedValue(page([tech()]));
    renderApp('/technicians', anonymous());
    expect(await screen.findByRole('heading', { name: 'Ananya Iyer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "View Ananya Iyer's profile" })).toHaveAttribute('href', '/technicians/t1');
    await screen.findByRole('option', { name: 'Laptops' });
    fireEvent.change(screen.getByLabelText('Device type'), { target: { value: 'laptops' } });
    await waitFor(() => expect(technicianApi.list.mock.calls.at(-1)[0]).toMatchObject({ category: 'laptops' }));
  });

  it('shows an empty state when nobody matches', async () => {
    renderApp('/technicians?city=Nowhere', anonymous());
    expect(await screen.findByText('No technicians match these filters')).toBeInTheDocument();
  });

  it('shows a profile and asks visitors to log in before requesting', async () => {
    technicianApi.get.mockResolvedValue(tech());
    renderApp('/technicians/t1', anonymous());
    expect(await screen.findByRole('heading', { level: 1, name: 'Ananya Iyer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in to request a repair' })).toBeInTheDocument();
    expect(screen.queryByText(/earnings/i)).not.toBeInTheDocument();
  });

  it('links signed-in customers to a pre-selected request', async () => {
    technicianApi.get.mockResolvedValue(tech());
    renderApp('/technicians/t1', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'Request a repair' })).toHaveAttribute('href', '/dashboard/requests/new?technician=t1');
  });

  it('explains when the technician is not available', async () => {
    technicianApi.get.mockRejectedValue(apiError('Technician not found', 'NOT_FOUND', 404));
    renderApp('/technicians/gone', anonymous());
    expect(await screen.findByText('Technician not found')).toBeInTheDocument();
  });
});

describe('new repair request', () => {
  const match = () => ({ technician: tech(), score: 82, reasons: ['Close to you'], estimatedCharge: { amount: 500, isEstimate: true } });

  it('lets the owner pick a repair listing first', async () => {
    deviceApi.list.mockResolvedValue(page([listing()]));
    deviceApi.get.mockResolvedValue(listing());
    technicianApi.recommendations.mockResolvedValue([]);
    renderApp('/dashboard/requests/new', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose Dell Inspiron 15' }));
    expect(await screen.findByText('Who should look at it?')).toBeInTheDocument();
    expect(deviceApi.list.mock.calls[0][0]).toMatchObject({ mine: 'true', status: 'listed', service: 'repair' });
  });

  it('points to listing a device when there is nothing to repair', async () => {
    renderApp('/dashboard/requests/new', signedIn(USER));
    expect(await screen.findByText('You have no devices waiting for repair')).toBeInTheDocument();
  });

  it('shows ranked matches with reasons and a clearly labelled estimate', async () => {
    deviceApi.get.mockResolvedValue(listing());
    technicianApi.recommendations.mockResolvedValue([match()]);
    renderApp('/dashboard/requests/new?listing=l1', signedIn(USER));
    expect(await screen.findByText('Match score 82/100')).toBeInTheDocument();
    expect(screen.getByText('Close to you')).toBeInTheDocument();
    expect(screen.getByText(/estimate only/)).toBeInTheDocument();
  });

  it('asks for a description before sending', async () => {
    deviceApi.get.mockResolvedValue(listing());
    technicianApi.recommendations.mockResolvedValue([match()]);
    renderApp('/dashboard/requests/new?listing=l1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Post request' }));
    expect(await screen.findByText(/Describe the problem in a few words/)).toBeInTheDocument();
    expect(requestApi.create).not.toHaveBeenCalled();
  });

  it('sends a request to the chosen technician and opens it', async () => {
    deviceApi.get.mockResolvedValue(listing());
    technicianApi.recommendations.mockResolvedValue([match()]);
    requestApi.create.mockResolvedValue({ _id: 'r1' });
    requestApi.get.mockResolvedValue(request());
    renderApp('/dashboard/requests/new?listing=l1', signedIn(USER));
    fireEvent.click(await screen.findByRole('radio', { name: 'Choose Ananya Iyer' }));
    fireEvent.change(screen.getByLabelText('What is wrong with the device?'), { target: { value: 'Screen cracked' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(requestApi.create).toHaveBeenCalledWith({ listingId: 'l1', issueDescription: 'Screen cracked', onSite: false, technicianId: 't1' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Dell Inspiron 15' })).toBeInTheDocument();
    expect(screen.getByText(/Your request was sent/)).toBeInTheDocument();
  });

  it('can post an open request without choosing anyone', async () => {
    deviceApi.get.mockResolvedValue(listing());
    technicianApi.recommendations.mockResolvedValue([]);
    requestApi.create.mockResolvedValue({ _id: 'r1' });
    requestApi.get.mockResolvedValue(request({ mode: 'open', technician: null }));
    renderApp('/dashboard/requests/new?listing=l1', signedIn(USER));
    fireEvent.change(await screen.findByLabelText('What is wrong with the device?'), { target: { value: 'Will not turn on' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post request' }));
    await waitFor(() => expect(requestApi.create).toHaveBeenCalledWith({ listingId: 'l1', issueDescription: 'Will not turn on', onSite: false }));
  });

  it('shows the server reason when the request is refused', async () => {
    deviceApi.get.mockResolvedValue(listing());
    technicianApi.recommendations.mockResolvedValue([]);
    requestApi.create.mockRejectedValue(apiError('This listing already has an active service', 'LISTING_UNAVAILABLE'));
    renderApp('/dashboard/requests/new?listing=l1', signedIn(USER));
    fireEvent.change(await screen.findByLabelText('What is wrong with the device?'), { target: { value: 'Will not turn on' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post request' }));
    expect(await screen.findByText('This listing already has an active service')).toBeInTheDocument();
  });
});

describe('requests list', () => {
  it('shows a customer their requests and flags the ones that need action', async () => {
    requestApi.list.mockResolvedValue(page([request({ actions: ['approve_quotation'], status: 'customer_approval_pending' })]));
    renderApp('/dashboard/requests', signedIn(USER));
    expect(await screen.findByRole('heading', { level: 1, name: 'Repair requests' })).toBeInTheDocument();
    const link = await screen.findByRole('link', { name: 'Open request for Dell Inspiron 15' });
    expect(link).toHaveAttribute('href', '/dashboard/requests/r1');
    expect(link).toHaveTextContent('Action needed');
    expect(requestApi.list.mock.calls[0][0]).toMatchObject({ as: 'customer', active: 'true' });
  });

  it('shows technicians their jobs, the open board and an availability control', async () => {
    technicianApi.setAvailability.mockResolvedValue({ availability: { status: 'limited' } });
    renderApp('/dashboard/requests', signedIn(TECHNICIAN_USER));
    expect(await screen.findByRole('heading', { level: 1, name: 'Repair jobs' })).toBeInTheDocument();
    expect(requestApi.list.mock.calls[0][0]).toMatchObject({ as: 'technician', active: 'true' });
    fireEvent.click(screen.getByRole('tab', { name: 'Open requests' }));
    await waitFor(() => expect(requestApi.list.mock.calls.at(-1)[0]).toMatchObject({ as: 'board' }));
    fireEvent.change(screen.getByLabelText('Your availability'), { target: { value: 'limited' } });
    await waitFor(() => expect(technicianApi.setAvailability).toHaveBeenCalledWith('limited'));
    expect(await screen.findByText('Availability updated')).toBeInTheDocument();
  });

  it('tells an unverified technician why they see no jobs', async () => {
    requestApi.list.mockRejectedValue(apiError('Your account must be verified by an administrator first', 'NOT_VERIFIED', 403));
    renderApp('/dashboard/requests', signedIn(TECH));
    expect(await screen.findByText('Your account is waiting for verification')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    renderApp('/dashboard/requests', signedIn(USER));
    expect(await screen.findByText('Nothing here yet')).toBeInTheDocument();
  });
});

describe('request details: customer', () => {
  it('approves a quotation and shows the updated request', async () => {
    requestApi.get.mockResolvedValue(request({ status: 'customer_approval_pending', activeQuotation: quotation(), actions: ['approve_quotation', 'reject_quotation', 'cancel'] }));
    requestApi.decide.mockResolvedValue(request({ status: 'repair_in_progress', activeQuotation: quotation({ status: 'accepted' }), actions: [] }));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    expect(await screen.findByRole('region', { name: 'Quotation' })).toHaveTextContent('₹800');
    fireEvent.click(screen.getByRole('button', { name: 'Approve quotation' }));
    await waitFor(() => expect(requestApi.decide).toHaveBeenCalledWith('r1', 'q1', { decision: 'accept' }));
    expect(await screen.findByText('Quotation approved')).toBeInTheDocument();
    expect(screen.getAllByText('Repair in progress').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Approve quotation' })).not.toBeInTheDocument();
  });

  it('shows when the device comes back, once the technician has said', async () => {
    requestApi.get.mockResolvedValue(request({ status: 'device_delivery_pending', returnSchedule: { date: '2030-01-10T11:30:00.000Z', timeSlot: '5 pm - 7 pm' }, actions: ['confirm_handover'] }));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    expect(await screen.findByText(/Return: .*\(5 pm - 7 pm\)/)).toBeInTheDocument();
  });

  it('needs a reason to decline and can cancel the whole request', async () => {
    requestApi.get.mockResolvedValue(request({ status: 'customer_approval_pending', activeQuotation: quotation(), actions: ['approve_quotation', 'reject_quotation'] }));
    requestApi.decide.mockResolvedValue(request({ status: 'cancelled', actions: [] }));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: /Decline/ }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline quotation' }));
    expect(await within(dialog).findByText('Please give a short reason.')).toBeInTheDocument();
    expect(requestApi.decide).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Tell the technician why'), { target: { value: 'Too expensive' } });
    fireEvent.click(within(dialog).getByLabelText(/Cancel the whole request/));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline quotation' }));
    await waitFor(() => expect(requestApi.decide).toHaveBeenCalledWith('r1', 'q1', { decision: 'reject', reason: 'Too expensive', cancel: true }));
  });

  it('shows why an action failed', async () => {
    requestApi.get.mockResolvedValue(request({ status: 'customer_approval_pending', activeQuotation: quotation(), actions: ['approve_quotation'] }));
    requestApi.decide.mockRejectedValue(apiError('This quotation has been replaced by a newer one', 'QUOTATION_SUPERSEDED'));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Approve quotation' }));
    expect(await screen.findByText('This quotation has been replaced by a newer one')).toBeInTheDocument();
  });

  it('requires the data-protection checklist before handing over the device', async () => {
    requestApi.get.mockResolvedValue(request({ status: 'device_collection_pending', actions: ['confirm_handover', 'schedule_pickup', 'cancel'] }));
    requestApi.handover.mockResolvedValue(request({ status: 'device_collection_pending', actions: ['schedule_pickup', 'cancel'], handover: { collect: { owner: true }, delivery: {} } }));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm handover' }));
    expect(await screen.findByText('Please confirm the data-protection checklist first.')).toBeInTheDocument();
    expect(requestApi.handover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('I have completed this checklist'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm handover' }));
    await waitFor(() => expect(requestApi.handover).toHaveBeenCalledWith('r1', { acknowledgeChecklist: true }));
  });

  it('rejects a pickup time in the past without calling the server', async () => {
    requestApi.get.mockResolvedValue(request({ status: 'technician_assigned', actions: ['schedule_pickup', 'cancel'] }));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    fireEvent.change(await screen.findByLabelText('Pickup date and time'), { target: { value: '2020-01-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirm pickup' }));
    expect(await screen.findByText('Choose a date and time in the future.')).toBeInTheDocument();
    expect(requestApi.pickup).not.toHaveBeenCalled();
  });

  it('confirms completion once the device is back', async () => {
    requestApi.get.mockResolvedValue(request({ status: 'device_delivered', actions: ['confirm_completion'] }));
    requestApi.confirmCompletion.mockResolvedValue(request({ status: 'service_completed', actions: [] }));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm the repair is complete' }));
    await waitFor(() => expect(requestApi.confirmCompletion).toHaveBeenCalledWith('r1'));
    expect(await screen.findByText('Service completed')).toBeInTheDocument();
  });

  it('cancels with a reason after confirmation', async () => {
    requestApi.get.mockResolvedValue(request({ actions: ['cancel'] }));
    requestApi.cancel.mockResolvedValue(request({ status: 'cancelled', actions: [] }));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel this request' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: 'Changed my mind' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(requestApi.cancel).toHaveBeenCalledWith('r1', 'Changed my mind'));
  });

  it('marks the current step in the tracker', async () => {
    requestApi.get.mockResolvedValue(request({ status: 'repair_in_progress', actions: [] }));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    const tracker = await screen.findByRole('list', { name: 'Repair progress' });
    const current = within(tracker).getAllByRole('listitem').find((li) => li.getAttribute('aria-current') === 'step');
    expect(current).toHaveTextContent('Repair');
  });

  it('does not reveal a request that is not yours', async () => {
    requestApi.get.mockRejectedValue(apiError('Request not found', 'NOT_FOUND', 404));
    renderApp('/dashboard/requests/other', signedIn(USER));
    expect(await screen.findByText('Request not found')).toBeInTheDocument();
  });
});

describe('request details: technician', () => {
  const asTechnician = (over = {}) => request({ viewerRole: 'technician', ...over });

  it('accepts a job and sees that the exact address is still hidden', async () => {
    requestApi.get.mockResolvedValue(asTechnician({ actions: ['accept', 'reject'] }));
    requestApi.setStatus.mockResolvedValue(asTechnician({ status: 'technician_assigned', actions: ['schedule_pickup'] }));
    renderApp('/dashboard/requests/r1', signedIn(TECHNICIAN_USER));
    expect(await screen.findByText(/exact address is shared after you accept/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept this job' }));
    await waitFor(() => expect(requestApi.setStatus).toHaveBeenCalledWith('r1', 'technician_assigned'));
    expect(await screen.findByText('You accepted the job')).toBeInTheDocument();
  });

  it('needs a reason to decline a job', async () => {
    requestApi.get.mockResolvedValue(asTechnician({ actions: ['accept', 'reject'] }));
    requestApi.setStatus.mockResolvedValue(asTechnician({ status: 'rejected', actions: [] }));
    renderApp('/dashboard/requests/r1', signedIn(TECHNICIAN_USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline job' }));
    expect(await within(dialog).findByText('Please give a short reason.')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Reason (shown to the customer)'), { target: { value: 'Too busy' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline job' }));
    await waitFor(() => expect(requestApi.setStatus).toHaveBeenCalledWith('r1', 'rejected', { note: 'Too busy' }));
  });

  it('checks the quotation before sending it', async () => {
    requestApi.get.mockResolvedValue(asTechnician({ status: 'diagnosis_in_progress', actions: ['add_progress', 'submit_quotation'] }));
    requestApi.quote.mockResolvedValue(asTechnician({ status: 'customer_approval_pending', activeQuotation: quotation({ amount: 600 }), actions: [] }));
    renderApp('/dashboard/requests/r1', signedIn(TECHNICIAN_USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Send quotation' }));
    expect(await screen.findByText('Enter the total charge (0 or more).')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Add a line/ }));
    fireEvent.change(screen.getByLabelText('Line 1 name'), { target: { value: 'Screen' } });
    fireEvent.change(screen.getByLabelText('Line 1 amount'), { target: { value: '600' } });
    fireEvent.change(screen.getByLabelText('Total charge (₹)'), { target: { value: '900' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send quotation' }));
    expect(await screen.findByText(/The total must equal the lines/)).toBeInTheDocument();
    expect(requestApi.quote).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Total charge (₹)'), { target: { value: '600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send quotation' }));
    await waitFor(() => expect(requestApi.quote).toHaveBeenCalled());
    expect(requestApi.quote.mock.calls[0][1]).toMatchObject({ amount: 600, breakdown: [{ label: 'Screen', amount: 600 }] });
    expect(typeof requestApi.quote.mock.calls[0][1].validUntil).toBe('string');
  });

  it('will not mark a repair completed without a photo', async () => {
    requestApi.get.mockResolvedValue(asTechnician({ status: 'repair_in_progress', activeQuotation: quotation({ status: 'accepted' }), actions: ['add_progress', 'revise_quotation', 'complete_repair'] }));
    renderApp('/dashboard/requests/r1', signedIn(TECHNICIAN_USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as completed' }));
    expect(await screen.findByText('Add at least one photo of the repaired device.')).toBeInTheDocument();
    expect(requestApi.setStatus).not.toHaveBeenCalled();
  });

  it('arranging delivery asks when the device comes back and sends it', async () => {
    requestApi.get.mockResolvedValue(asTechnician({ status: 'repair_completed', activeQuotation: quotation({ status: 'accepted' }), actions: ['start_delivery'] }));
    requestApi.setStatus.mockResolvedValue(asTechnician({ status: 'device_delivery_pending', actions: ['confirm_handover'] }));
    renderApp('/dashboard/requests/r1', signedIn(TECHNICIAN_USER));

    fireEvent.click(await screen.findByRole('button', { name: 'Arrange delivery' }));
    expect(requestApi.setStatus).not.toHaveBeenCalled(); // no date yet

    const tomorrow = new Date(Date.now() + 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    const local = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T17:00`;
    fireEvent.change(screen.getByLabelText('When will you bring it back?'), { target: { value: local } });
    fireEvent.change(screen.getByLabelText('Time window (optional)'), { target: { value: '17:00-19:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Arrange delivery' }));

    await waitFor(() => expect(requestApi.setStatus).toHaveBeenCalled());
    const [, status, body] = requestApi.setStatus.mock.calls[0];
    expect(status).toBe('device_delivery_pending');
    expect(body.returnSlot).toBe('17:00-19:00');
    expect(new Date(body.returnDate).getTime()).toBe(new Date(local).getTime());
  });

  it('reveals the exact pickup point after accepting', async () => {
    requestApi.get.mockResolvedValue(asTechnician({
      status: 'technician_assigned', actions: ['schedule_pickup'],
      listing: { _id: 'l1', title: 'Dell Inspiron 15', device: { photos: [] }, addressArea: 'Indiranagar', city: 'Bengaluru', location: { type: 'Point', coordinates: [77.59, 12.97] } },
    }));
    renderApp('/dashboard/requests/r1', signedIn(TECHNICIAN_USER));
    expect(await screen.findByRole('link', { name: 'Open the map' })).toHaveAttribute('href', expect.stringContaining('mlat=12.97'));
  });
});

describe('reviews', () => {
  const completed = (over = {}) => request({ status: 'service_completed', actions: ['review'], reviewed: false, ...over });
  const overall = () => within(screen.getByRole('group', { name: /Overall rating/ }));

  it('asks for a star rating before sending a review', async () => {
    requestApi.get.mockResolvedValue(completed());
    renderApp('/dashboard/requests/r1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Review the technician' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit review' }));
    expect(await within(dialog).findByText('Choose a star rating.')).toBeInTheDocument();
    expect(reviewApi.create).not.toHaveBeenCalled();
  });

  it('sends the review with only the fields that were filled in, then removes the button', async () => {
    requestApi.get.mockResolvedValueOnce(completed()).mockResolvedValue(completed({ actions: [], reviewed: true }));
    reviewApi.create.mockResolvedValue({ _id: 'rv1' });
    renderApp('/dashboard/requests/r1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Review the technician' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(overall().getByRole('radio', { name: '5 stars' }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Communication' })).getByRole('radio', { name: '4 stars' }));
    fireEvent.change(within(dialog).getByLabelText('Your review (optional)'), { target: { value: 'Quick and careful.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(reviewApi.create).toHaveBeenCalledWith({ contextType: 'service', contextId: 'r1', rating: 5, communication: 4, comment: 'Quick and careful.' }));
    expect(await screen.findByText('Thank you for your review')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review the technician' })).not.toBeInTheDocument();
  });

  it('shows the reason when the review is refused', async () => {
    requestApi.get.mockResolvedValue(completed());
    reviewApi.create.mockRejectedValue(apiError('You have already reviewed this service', 'ALREADY_REVIEWED'));
    renderApp('/dashboard/requests/r1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Review the technician' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(overall().getByRole('radio', { name: '3 stars' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Submit review' }));
    expect(await within(dialog).findByText('You have already reviewed this service')).toBeInTheDocument();
  });

  it('shows ratings and reviews on a technician profile without exposing more than a short name', async () => {
    technicianApi.get.mockResolvedValue(tech());
    reviewApi.list.mockResolvedValue({
      items: [{ _id: 'rv1', rating: 5, comment: 'Fixed it the same day.', reviewer: { name: 'Asha R.' }, createdAt: '2026-11-15T07:00:00.000Z' }],
      meta: { page: 1, pages: 1, total: 1, summary: { average: 5, count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 } } },
    });
    renderApp('/technicians/t1', anonymous());
    expect(await screen.findByText('Fixed it the same day.')).toBeInTheDocument();
    expect(screen.getByText('Asha R.')).toBeInTheDocument();
    expect(screen.getByText('1 review')).toBeInTheDocument();
    expect(reviewApi.list.mock.calls[0][0]).toMatchObject({ target: 't1' });
  });

  it('says so when a technician has no reviews yet', async () => {
    technicianApi.get.mockResolvedValue(tech());
    renderApp('/technicians/t1', anonymous());
    expect(await screen.findByText(/No reviews yet/)).toBeInTheDocument();
  });
});

describe('transaction history', () => {
  it('shows totals, records and links back to the request', async () => {
    transactionApi.summary.mockResolvedValue(summary({ paid: { count: 1, total: 800 } }));
    transactionApi.list.mockResolvedValue(page([txn()]));
    renderApp('/dashboard/transactions', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'Dell Inspiron 15' })).toHaveAttribute('href', '/dashboard/requests/r1');
    expect(screen.getByText(/To Ravi Kumar/)).toBeInTheDocument();
    expect(screen.getByText('Recorded')).toBeInTheDocument();
    expect(await screen.findByText('1 payment')).toBeInTheDocument();
    expect(screen.getByText(/never handles your money/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm payment received' })).not.toBeInTheDocument();
  });

  it('filters by direction', async () => {
    renderApp('/dashboard/transactions', signedIn(USER));
    fireEvent.click(await screen.findByRole('tab', { name: 'Received' }));
    await waitFor(() => expect(transactionApi.list.mock.calls.at(-1)[0]).toMatchObject({ direction: 'received' }));
  });

  it('lets the person who was paid confirm with a reference', async () => {
    transactionApi.list.mockResolvedValue(page([txn({ direction: 'received', canConfirm: true })]));
    transactionApi.summary.mockResolvedValue(summary({ received: { count: 1, total: 800 }, awaitingConfirmation: 1 }));
    transactionApi.confirm.mockResolvedValue(txn({ direction: 'received', status: 'confirmed' }));
    renderApp('/dashboard/transactions', signedIn(TECHNICIAN_USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm payment received' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Payment reference (optional)'), { target: { value: 'UPI 12345' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm payment' }));
    await waitFor(() => expect(transactionApi.confirm).toHaveBeenCalledWith('x1', { reference: 'UPI 12345' }));
    expect(await screen.findByText('Payment marked as received.')).toBeInTheDocument();
  });

  it('shows an empty state and an error state', async () => {
    renderApp('/dashboard/transactions', signedIn(USER));
    expect(await screen.findByText('No transactions yet')).toBeInTheDocument();
  });

  it('can retry after an error', async () => {
    transactionApi.list.mockRejectedValueOnce(apiError('Server down', 'INTERNAL', 500)).mockResolvedValue(page([txn()]));
    renderApp('/dashboard/transactions', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Dell Inspiron 15' })).toBeInTheDocument();
  });
});

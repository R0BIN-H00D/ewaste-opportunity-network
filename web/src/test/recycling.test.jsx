import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { categoryApi } from '../services/deviceApi';
import { centerApi, recyclingApi } from '../services/recyclingApi';
import { _resetCategoriesCache } from '../hooks/useCategories';
import { formatKg, recyclingLabel, recyclingSteps } from '../lib/recycling';
import { USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/recyclingApi', () => ({
  centerApi: { list: vi.fn(), get: vi.fn(), compare: vi.fn() },
  recyclingApi: { create: vi.fn(), list: vi.fn(), get: vi.fn(), setStatus: vi.fn(), pickup: vi.fn(), confirmHandover: vi.fn(), materials: vi.fn(), cancel: vi.fn(), report: vi.fn(), reportCsv: vi.fn() },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const RECYCLER = { ...USER, _id: 'c9', name: 'GreenCycle Recyclers', role: 'recycler' };
const LAPTOP = { _id: 'k1', name: 'Laptop', slug: 'laptops' };
const PHONE = { _id: 'k2', name: 'Smartphone', slug: 'smartphones' };
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 12, ...meta } });
const apiError = (message, code, status = 409) => Object.assign(new Error(message), { response: { status, data: { message, code } } });
const center = (over = {}) => ({
  _id: 'c1', name: 'GreenCycle Recyclers', city: 'Bengaluru', authorized: true, acceptedCategories: [LAPTOP, PHONE], operatingHours: 'Mon–Sat 9–5',
  ratingAvg: 0, ratingCount: 0, authorizationNo: 'DEMO-0001', authorizingBody: 'Demo Authority', validUntil: null, facilityDetails: '', collectionAreas: [],
  totals: { actualKg: 2.3, estimatedKg: 2 }, ...over,
});
const request = (over = {}) => ({
  _id: 'r1', refNo: 'REC-2026-ABC123', status: 'requested', viewerRole: 'requester', actions: ['cancel'], deviceCount: 2, categories: [LAPTOP],
  center: { _id: 'c1', name: 'GreenCycle Recyclers' }, requester: { _id: 'u1', name: 'Asha Rao' }, pickupAddressArea: 'Indiranagar', pickupAddress: '12 Test Street, Indiranagar',
  confirmations: { requester: false, center: false, checklistAcknowledged: false }, materials: [], totals: { actualKg: null, estimatedKg: null }, photos: [],
  history: [{ status: 'requested', at: '2026-11-15T07:00:00.000Z' }], createdAt: '2026-11-15T07:00:00.000Z', ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  _resetCategoriesCache();
  setAccessToken(null);
  categoryApi.list.mockResolvedValue([{ slug: 'laptops', name: 'Laptops' }]);
  centerApi.list.mockResolvedValue(page([center()]));
  recyclingApi.list.mockResolvedValue(page([]));
});

describe('recycling helpers', () => {
  it('labels statuses and shows missing weights as a dash, never zero', () => {
    expect(recyclingLabel('received_at_center')).toBe('Received at the centre');
    expect(recyclingLabel('rejected')).toBe('Declined');
    expect(formatKg(null)).toBe('–');
    expect(formatKg(undefined)).toBe('–');
    expect(formatKg(0)).toBe('0 kg');
    expect(formatKg(1.5)).toBe('1.5 kg');
  });
  it('tracks a request and shows how far a declined or cancelled one got', () => {
    const state = (r) => Object.fromEntries(recyclingSteps(r).map((s) => [s.key, s.state]));
    expect(state({ status: 'pickup_scheduled' })).toMatchObject({ requested: 'done', accepted: 'done', pickup_scheduled: 'current', completed: 'todo' });
    expect(Object.values(state({ status: 'completed' })).every((s) => s === 'done')).toBe(true);
    expect(state({ status: 'cancelled', history: [{ status: 'requested' }, { status: 'accepted' }, { status: 'cancelled' }] })).toMatchObject({ accepted: 'done', pickup_scheduled: 'todo' });
    expect(state({ status: 'rejected', history: [{ status: 'requested' }, { status: 'rejected' }] })).toMatchObject({ requested: 'done', accepted: 'todo' });
  });
});

describe('recycling centre comparison', () => {
  const row = (over) => center({ completedRequests: 0, devicesRecycled: 0, ...over });
  it('shows weighed and estimated kilograms in separate columns, with a link to each centre', async () => {
    centerApi.compare.mockResolvedValue([
      row({ _id: 'c1', name: 'GreenCycle Recyclers', completedRequests: 4, devicesRecycled: 11, totals: { actualKg: 12.5, estimatedKg: 30 } }),
      row({ _id: 'c2', name: 'Second Recyclers', totals: { actualKg: 0, estimatedKg: 0 } }),
    ]);
    renderApp('/recycling-centers/compare', anonymous());
    expect(await screen.findByRole('heading', { name: 'Compare recycling centres' })).toBeInTheDocument();
    const table = await screen.findByRole('table');
    const first = within(within(table).getByRole('link', { name: 'GreenCycle Recyclers' }).closest('tr'));
    expect(first.getByText('12.5 kg')).toBeInTheDocument();
    expect(first.getByText('30 kg')).toBeInTheDocument();
    expect(first.getByText('11')).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Weighed' })).toBeInTheDocument();
    expect(within(table).getByRole('columnheader', { name: 'Estimated' })).toBeInTheDocument();
    expect(within(table).getByRole('link', { name: 'Second Recyclers' })).toHaveAttribute('href', '/recycling-centers/c2');
    expect(centerApi.compare).toHaveBeenCalledWith({ sort: 'rating' }, expect.anything());
  });
  it('re-fetches in the chosen order', async () => {
    centerApi.compare.mockResolvedValue([row()]);
    renderApp('/recycling-centers/compare', anonymous());
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Order by'), { target: { value: 'measured' } });
    await waitFor(() => expect(centerApi.compare).toHaveBeenLastCalledWith({ sort: 'measured' }, expect.anything()));
  });
  it('says so when there is nothing to compare', async () => {
    centerApi.compare.mockResolvedValue([]);
    renderApp('/recycling-centers/compare', anonymous());
    expect(await screen.findByText('No authorised centres to compare yet')).toBeInTheDocument();
  });
  it('is linked from the directory', async () => {
    renderApp('/recycling-centers', anonymous());
    expect(await screen.findByRole('link', { name: /Compare centres side by side/ })).toHaveAttribute('href', '/recycling-centers/compare');
  });
});

describe('recycling centre directory', () => {
  it('lists authorised centres to anyone, with their categories', async () => {
    renderApp('/recycling-centers', anonymous());
    expect(await screen.findByRole('heading', { name: 'GreenCycle Recyclers' })).toBeInTheDocument();
    expect(screen.getByText('Authorised')).toBeInTheDocument();
    expect(screen.getByText('1 centre found')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Accepted categories' })).getByText('Smartphone')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View centre' })).toHaveAttribute('href', '/recycling-centers/c1');
  });

  it('searches by city and clears the filters', async () => {
    renderApp('/recycling-centers', anonymous());
    await screen.findByRole('heading', { name: 'GreenCycle Recyclers' });
    centerApi.list.mockResolvedValue(page([]));
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Mumbai' } });
    fireEvent.click(screen.getByRole('button', { name: /^Search/ }));
    expect(await screen.findByText('No centres match your search')).toBeInTheDocument();
    expect(centerApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ city: 'Mumbai' }), expect.anything());
    centerApi.list.mockResolvedValue(page([center()]));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    expect(await screen.findByRole('heading', { name: 'GreenCycle Recyclers' })).toBeInTheDocument();
  });

  it('says so when there are no centres at all', async () => {
    centerApi.list.mockResolvedValue(page([]));
    renderApp('/recycling-centers', anonymous());
    expect(await screen.findByText('No authorised centres yet')).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    centerApi.list.mockRejectedValueOnce(apiError('Boom', 'SERVER', 500));
    renderApp('/recycling-centers', anonymous());
    expect(await screen.findByText('Could not load the centres')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(await screen.findByRole('heading', { name: 'GreenCycle Recyclers' })).toBeInTheDocument();
  });
});

describe('recycling centre page', () => {
  it('asks a visitor to log in, and shows weighed and estimated totals apart', async () => {
    centerApi.get.mockResolvedValue(center());
    renderApp('/recycling-centers/c1', anonymous());
    expect(await screen.findByRole('heading', { name: 'GreenCycle Recyclers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in to request recycling' })).toHaveAttribute('href', '/login');
    expect(screen.getByText('DEMO-0001')).toBeInTheDocument();
    const totals = screen.getByRole('region', { name: 'Recorded weights' });
    expect(within(totals).getByText('2.3 kg')).toBeInTheDocument();
    expect(within(totals).getByText('2 kg')).toBeInTheDocument();
  });

  it('lets a signed-in user start a request for that centre', async () => {
    centerApi.get.mockResolvedValue(center());
    renderApp('/recycling-centers/c1', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'Request recycling' })).toHaveAttribute('href', '/dashboard/recycling/new?center=c1');
  });

  it('offers no request button when the authorisation is not current', async () => {
    centerApi.get.mockResolvedValue(center({ authorized: false }));
    renderApp('/recycling-centers/c1', signedIn(USER));
    expect(await screen.findByText('Authorisation not current')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Request recycling' })).not.toBeInTheDocument();
  });

  it('reports a centre that does not exist', async () => {
    centerApi.get.mockRejectedValue(apiError('Not found', 'NOT_FOUND', 404));
    renderApp('/recycling-centers/nope', anonymous());
    expect(await screen.findByText('Centre not found')).toBeInTheDocument();
  });
});

describe('request recycling form', () => {
  it('checks the form before sending anything', async () => {
    renderApp('/dashboard/recycling/new?center=c1', signedIn(USER));
    await screen.findByRole('form', { name: 'Request recycling' });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Choose at least one category.')).toBeInTheDocument();
    expect(screen.getByText('Enter the area or locality.')).toBeInTheDocument();
    expect(screen.getByText('Enter the full pickup address.')).toBeInTheDocument();
    expect(recyclingApi.create).not.toHaveBeenCalled();
  });

  it('only offers the categories the chosen centre accepts', async () => {
    centerApi.list.mockResolvedValue(page([center({ acceptedCategories: [LAPTOP] }), center({ _id: 'c2', name: 'PhoneCycle', acceptedCategories: [PHONE] })]));
    renderApp('/dashboard/recycling/new', signedIn(USER));
    await screen.findByRole('form', { name: 'Request recycling' });
    expect(screen.getByText('Choose a centre to see the categories it accepts.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Recycling centre'), { target: { value: 'c2' } });
    expect(screen.getByLabelText('Smartphone')).toBeInTheDocument();
    expect(screen.queryByLabelText('Laptop')).not.toBeInTheDocument();
  });

  it('rejects a preferred date in the past and a silly device count', async () => {
    renderApp('/dashboard/recycling/new?center=c1', signedIn(USER));
    await screen.findByRole('form', { name: 'Request recycling' });
    fireEvent.change(screen.getByLabelText('Number of devices'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Preferred pickup date (optional)'), { target: { value: '2020-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText('Enter a whole number from 1 to 500.')).toBeInTheDocument();
    expect(screen.getByText('Choose a date in the future.')).toBeInTheDocument();
    expect(recyclingApi.create).not.toHaveBeenCalled();
  });

  it('sends the request as form data and opens it', async () => {
    recyclingApi.create.mockResolvedValue(request());
    recyclingApi.get.mockResolvedValue(request());
    renderApp('/dashboard/recycling/new?center=c1', signedIn(USER));
    await screen.findByRole('form', { name: 'Request recycling' });
    fireEvent.click(screen.getByLabelText('Laptop'));
    fireEvent.change(screen.getByLabelText('Number of devices'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Area or locality'), { target: { value: 'Indiranagar' } });
    fireEvent.change(screen.getByLabelText('Full pickup address'), { target: { value: '12 Test Street, Indiranagar' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByRole('heading', { name: /Recycling request REC-2026-ABC123/ })).toBeInTheDocument();
    const form = recyclingApi.create.mock.calls[0][0];
    expect(form.get('centerId')).toBe('c1');
    expect(JSON.parse(form.get('categories'))).toEqual(['k1']);
    expect(form.get('deviceCount')).toBe('2');
    expect(form.get('pickupAddress')).toBe('12 Test Street, Indiranagar');
    expect(screen.getByText('Your recycling request was sent. The centre will respond soon.')).toBeInTheDocument();
  });

  it('shows what the server refused', async () => {
    recyclingApi.create.mockRejectedValue(apiError('That centre cannot take this category.', 'CENTER_UNAVAILABLE'));
    renderApp('/dashboard/recycling/new?center=c1', signedIn(USER));
    await screen.findByRole('form', { name: 'Request recycling' });
    fireEvent.click(screen.getByLabelText('Laptop'));
    fireEvent.change(screen.getByLabelText('Area or locality'), { target: { value: 'Indiranagar' } });
    fireEvent.change(screen.getByLabelText('Full pickup address'), { target: { value: '12 Test Street' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send request' }));
    expect(await screen.findByText(/cannot take this category/)).toBeInTheDocument();
  });
});

describe('recycling requests list', () => {
  it('shows my requests to a normal user, without centre tabs', async () => {
    recyclingApi.list.mockResolvedValue(page([request({ status: 'accepted' })]));
    renderApp('/dashboard/recycling', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'View request REC-2026-ABC123' })).toHaveAttribute('href', '/dashboard/recycling/r1');
    expect(within(screen.getByRole('article')).getByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(recyclingApi.list).toHaveBeenCalledWith(expect.objectContaining({ as: 'requester' }), expect.anything());
  });

  it('shows a first-time user where to start', async () => {
    renderApp('/dashboard/recycling', signedIn(USER));
    expect(await screen.findByText('You have not sent any recycling requests')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Find a recycling centre' }).length).toBeGreaterThan(0);
  });

  it('gives a recycling centre incoming and own requests, and a link to the report', async () => {
    recyclingApi.list.mockResolvedValue(page([request({ viewerRole: 'center' })]));
    renderApp('/dashboard/recycling', signedIn(RECYCLER));
    expect(await screen.findByText(/From Asha Rao in Indiranagar/)).toBeInTheDocument();
    expect(recyclingApi.list).toHaveBeenCalledWith(expect.objectContaining({ as: 'center' }), expect.anything());
    expect(screen.getByRole('link', { name: /Reports/ })).toHaveAttribute('href', '/dashboard/recycling/report');
    recyclingApi.list.mockResolvedValue(page([]));
    fireEvent.click(screen.getByRole('tab', { name: 'My requests' }));
    await waitFor(() => expect(recyclingApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ as: 'requester' }), expect.anything()));
  });

  it('filters by status', async () => {
    renderApp('/dashboard/recycling', signedIn(USER));
    await screen.findByText('You have not sent any recycling requests');
    fireEvent.change(screen.getByLabelText('Show'), { target: { value: 'completed' } });
    expect(await screen.findByText('No requests with this status')).toBeInTheDocument();
    expect(recyclingApi.list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'completed' }), expect.anything());
  });
});

describe('recycling request page', () => {
  it('lets the requester cancel', async () => {
    recyclingApi.get.mockResolvedValue(request());
    recyclingApi.cancel.mockResolvedValue(request({ status: 'cancelled', actions: [] }));
    renderApp('/dashboard/recycling/r1', signedIn(USER));
    expect(await screen.findByRole('heading', { name: /Recycling request REC-2026-ABC123/ })).toBeInTheDocument();
    expect(screen.getByText(/12 Test Street, Indiranagar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Cancel this request/ }));
    fireEvent.change(screen.getByLabelText('Reason (optional)'), { target: { value: 'Changed my mind' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel request' }));
    await waitFor(() => expect(recyclingApi.cancel).toHaveBeenCalledWith('r1', 'Changed my mind'));
    expect(await screen.findByText(/This request was cancelled/)).toBeInTheDocument();
  });

  it('shows the centre only the area until it accepts (BR-08)', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', actions: ['accept', 'reject'], pickupAddress: undefined }));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    expect(await screen.findByText('Decide on this request')).toBeInTheDocument();
    expect(screen.queryByText(/12 Test Street/)).not.toBeInTheDocument();
    expect(screen.getByText(/exact address is shared once you accept the request/)).toBeInTheDocument();
  });

  it('explains why the address is gone once the devices were collected', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', status: 'collected', actions: ['mark_received'], pickupAddress: undefined }));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    expect(await screen.findByText('The exact address is hidden now that the devices have been collected.')).toBeInTheDocument();
  });

  it('lets a centre accept', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', actions: ['accept', 'reject'], pickupAddress: undefined }));
    recyclingApi.setStatus.mockResolvedValue(request({ viewerRole: 'center', status: 'accepted', actions: ['schedule_pickup', 'cancel'] }));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept request' }));
    await waitFor(() => expect(recyclingApi.setStatus).toHaveBeenCalledWith('r1', 'accepted', undefined));
    expect(await screen.findByText('Schedule the pickup')).toBeInTheDocument();
  });

  it('lets a centre decline with a reason', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', actions: ['accept', 'reject'], pickupAddress: undefined }));
    recyclingApi.setStatus.mockResolvedValue(request({ viewerRole: 'center', status: 'rejected', actions: [], cancelReason: 'Out of area' }));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    fireEvent.click(await screen.findByRole('button', { name: 'Decline request' }));
    fireEvent.change(screen.getByLabelText('Reason (shared with the requester)'), { target: { value: 'Out of area' } });
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Decline request' }));
    await waitFor(() => expect(recyclingApi.setStatus).toHaveBeenCalledWith('r1', 'rejected', 'Out of area'));
    expect(await screen.findByText(/You declined this request: Out of area/)).toBeInTheDocument();
  });

  it('shows a server refusal without losing the page', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', actions: ['accept', 'reject'], pickupAddress: undefined }));
    recyclingApi.setStatus.mockRejectedValue(apiError('This request has already been answered.', 'INVALID_TRANSITION'));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept request' }));
    expect(await screen.findByText(/already been answered/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept request' })).toBeInTheDocument();
  });

  it('needs a future date and time to schedule the pickup', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', status: 'accepted', actions: ['schedule_pickup', 'cancel'] }));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule pickup' }));
    expect(await screen.findByText('Choose a date and time in the future.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2020-01-01T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule pickup' }));
    expect(screen.getByText('Choose a date and time in the future.')).toBeInTheDocument();
    expect(recyclingApi.pickup).not.toHaveBeenCalled();
  });

  it('schedules a pickup', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', status: 'accepted', actions: ['schedule_pickup', 'cancel'] }));
    recyclingApi.pickup.mockResolvedValue(request({ viewerRole: 'center', status: 'pickup_scheduled', actions: ['schedule_pickup', 'confirm_handover', 'cancel'], pickup: { date: '2099-01-01T10:00:00.000Z', timeSlot: '10-12' } }));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    await screen.findByText('Schedule the pickup');
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2099-01-01T10:00' } });
    fireEvent.change(screen.getByLabelText('Time window (optional)'), { target: { value: '10-12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule pickup' }));
    await waitFor(() => expect(recyclingApi.pickup).toHaveBeenCalledWith('r1', expect.objectContaining({ timeSlot: '10-12', date: expect.any(String) })));
    expect(await screen.findByText('Change the pickup time')).toBeInTheDocument();
  });

  it('makes the requester tick the data-protection checklist before confirming the handover (BR-12)', async () => {
    recyclingApi.get.mockResolvedValue(request({ status: 'pickup_scheduled', actions: ['confirm_handover', 'cancel'], confirmations: { requester: false, center: true } }));
    recyclingApi.confirmHandover.mockResolvedValue(request({ status: 'collected', actions: [], confirmations: { requester: true, center: true } }));
    renderApp('/dashboard/recycling/r1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm handover' }));
    expect(await screen.findByText('Please confirm the data-protection checklist first.')).toBeInTheDocument();
    expect(recyclingApi.confirmHandover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('I have completed this checklist'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm handover' }));
    await waitFor(() => expect(recyclingApi.confirmHandover).toHaveBeenCalledWith('r1', { acknowledgeChecklist: true }));
    expect(await screen.findByText('Handover confirmed')).toBeInTheDocument();
  });

  it('lets the centre confirm collection without a checklist, and says when it is waiting', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', status: 'pickup_scheduled', actions: ['confirm_handover', 'cancel'], pickupAddress: '12 Test Street' }));
    recyclingApi.confirmHandover.mockResolvedValue(request({ viewerRole: 'center', status: 'pickup_scheduled', actions: ['cancel'], confirmations: { requester: false, center: true } }));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    fireEvent.click(await screen.findByRole('button', { name: 'I collected the devices' }));
    expect(screen.queryByLabelText('I have completed this checklist')).not.toBeInTheDocument();
    await waitFor(() => expect(recyclingApi.confirmHandover).toHaveBeenCalledWith('r1', {}));
    expect(await screen.findByText(/Waiting for the requester to confirm/)).toBeInTheDocument();
  });

  it('marks the devices as received', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', status: 'collected', actions: ['mark_received', 'cancel'], pickupAddress: undefined }));
    recyclingApi.setStatus.mockResolvedValue(request({ viewerRole: 'center', status: 'received_at_center', actions: ['record_materials'], pickupAddress: undefined }));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark as received at the centre' }));
    await waitFor(() => expect(recyclingApi.setStatus).toHaveBeenCalledWith('r1', 'received_at_center', undefined));
    expect(await screen.findByText('Record the recovered materials')).toBeInTheDocument();
  });

  describe('recording materials', () => {
    const atCentre = (over = {}) => request({ viewerRole: 'center', status: 'received_at_center', actions: ['record_materials'], pickupAddress: undefined, ...over });

    it('needs at least one weight, and only numbers of zero or more', async () => {
      recyclingApi.get.mockResolvedValue(atCentre());
      renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
      fireEvent.click(await screen.findByRole('button', { name: 'Save materials' }));
      expect(await screen.findByText('Enter at least one weight.')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Copper weighed (kg)'), { target: { value: '-3' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save materials' }));
      expect(screen.getByText('Weights must be numbers of 0 or more.')).toBeInTheDocument();
      expect(recyclingApi.materials).not.toHaveBeenCalled();
    });

    it('keeps weighed and estimated amounts apart when saving and showing them (BR-06)', async () => {
      recyclingApi.get.mockResolvedValue(atCentre());
      recyclingApi.materials.mockResolvedValue(atCentre({
        actions: ['record_materials', 'process'],
        materials: [{ type: 'copper', actualKg: 1.5, estimatedKg: null }, { type: 'plastics', actualKg: null, estimatedKg: 2 }],
        totals: { actualKg: 1.5, estimatedKg: 2 },
      }));
      renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
      await screen.findByText('Record the recovered materials');
      fireEvent.change(screen.getByLabelText('Copper weighed (kg)'), { target: { value: '1.5' } });
      fireEvent.change(screen.getByLabelText('Plastics estimated (kg)'), { target: { value: '2' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save materials' }));
      await waitFor(() => expect(recyclingApi.materials).toHaveBeenCalledWith('r1', { materials: [{ type: 'copper', actualKg: 1.5 }, { type: 'plastics', estimatedKg: 2 }] }));
      const table = await screen.findByRole('region', { name: 'Recovered materials' });
      const copper = within(table).getByRole('row', { name: /Copper/ });
      expect(within(copper).getByText('1.5 kg')).toBeInTheDocument();
      expect(within(copper).getByText('–')).toBeInTheDocument();
      const total = within(table).getByRole('row', { name: /Total/ });
      expect(within(total).getByText('1.5 kg')).toBeInTheDocument();
      expect(within(total).getByText('2 kg')).toBeInTheDocument();
      expect(screen.getByText('Finish processing')).toBeInTheDocument();
    });
  });

  it('asks before completing, and says estimates are never counted', async () => {
    recyclingApi.get.mockResolvedValue(request({ viewerRole: 'center', status: 'processed', actions: ['record_materials', 'complete'], pickupAddress: undefined, materials: [{ type: 'copper', actualKg: 1.5, estimatedKg: null }], totals: { actualKg: 1.5, estimatedKg: null } }));
    recyclingApi.setStatus.mockResolvedValue(request({ viewerRole: 'center', status: 'completed', actions: [], pickupAddress: undefined }));
    renderApp('/dashboard/recycling/r1', signedIn(RECYCLER));
    fireEvent.click(await screen.findByRole('button', { name: 'Complete recycling' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Estimates are never counted as verified/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete recycling' }));
    await waitFor(() => expect(recyclingApi.setStatus).toHaveBeenCalledWith('r1', 'completed', undefined));
    expect(await screen.findByText('Recycling completed')).toBeInTheDocument();
  });

  it('shows no controls on a finished request', async () => {
    recyclingApi.get.mockResolvedValue(request({ status: 'completed', actions: [], materials: [{ type: 'copper', actualKg: 1.5, estimatedKg: null }], totals: { actualKg: 1.5, estimatedKg: null } }));
    renderApp('/dashboard/recycling/r1', signedIn(USER));
    expect(await screen.findByRole('region', { name: 'Recovered materials' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'What you can do now' })).not.toBeInTheDocument();
  });

  it('says a request that is not yours does not exist', async () => {
    recyclingApi.get.mockRejectedValue(apiError('Not found', 'NOT_FOUND', 404));
    renderApp('/dashboard/recycling/zzz', signedIn(USER));
    expect(await screen.findByText('Request not found')).toBeInTheDocument();
  });
});

describe('recycling report', () => {
  const report = () => ({
    center: 'GreenCycle Recyclers',
    requests: { total: 3, byStatus: { completed: 1, requested: 2 } },
    completed: { count: 1, devices: 2 },
    totals: { actualKg: 2.3, estimatedKg: 2 },
    materials: [{ type: 'copper', actualKg: 1.5, estimatedKg: 0 }, { type: 'plastics', actualKg: 0, estimatedKg: 2 }],
    byCategory: [{ category: LAPTOP, requests: 1, devices: 2 }],
    items: [{ _id: 'r1', refNo: 'REC-2026-ABC123', completedAt: '2026-11-15T08:00:00.000Z', deviceCount: 2, categories: ['Laptop'], materials: [{ type: 'copper', actualKg: 1.5 }] }],
  });

  it('is only for recycling centres', async () => {
    renderApp('/dashboard/recycling/report', signedIn(USER));
    expect(await screen.findByText('This area is not available for your account')).toBeInTheDocument();
    expect(recyclingApi.report).not.toHaveBeenCalled();
  });

  it('shows weighed and estimated totals separately', async () => {
    recyclingApi.report.mockResolvedValue(report());
    renderApp('/dashboard/recycling/report', signedIn(RECYCLER));
    const totals = await screen.findByRole('region', { name: 'Totals' });
    expect(within(totals).getByText('Weighed (measured)').nextSibling).toHaveTextContent('2.3 kg');
    expect(within(totals).getByText('Estimated').nextSibling).toHaveTextContent('2 kg');
    expect(within(totals).getByText('Not added to the weighed total')).toBeInTheDocument();
    expect(within(totals).getByText('Requested: 2')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'REC-2026-ABC123' })).toHaveAttribute('href', '/dashboard/recycling/r1');
  });

  it('filters by date, and refuses a start date after the end date', async () => {
    recyclingApi.report.mockResolvedValue(report());
    renderApp('/dashboard/recycling/report', signedIn(RECYCLER));
    await screen.findByRole('region', { name: 'Totals' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-12-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('The start date is after the end date.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-11-01' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-11-30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(recyclingApi.report).toHaveBeenLastCalledWith(expect.objectContaining({ from: expect.any(String), to: expect.any(String) }), expect.anything()));
  });

  it('says when nothing was completed in the period', async () => {
    recyclingApi.report.mockResolvedValue({ ...report(), completed: { count: 0, devices: 0 }, totals: { actualKg: 0, estimatedKg: 0 }, byCategory: [], items: [] });
    renderApp('/dashboard/recycling/report', signedIn(RECYCLER));
    expect(await screen.findByText('No requests were completed in this period.')).toBeInTheDocument();
  });

  it('downloads the CSV and tells the user when that fails', async () => {
    recyclingApi.report.mockResolvedValue(report());
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    recyclingApi.reportCsv.mockResolvedValueOnce(new Blob(['a,b'], { type: 'text/csv' }));
    renderApp('/dashboard/recycling/report', signedIn(RECYCLER));
    fireEvent.click(await screen.findByRole('button', { name: /Download CSV/ }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    expect(recyclingApi.reportCsv).toHaveBeenCalled();
    recyclingApi.reportCsv.mockRejectedValueOnce(apiError('Could not build the file.', 'SERVER', 500));
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }));
    expect(await screen.findByText(/Could not build the file|went wrong/i)).toBeInTheDocument();
    click.mockRestore();
  });
});

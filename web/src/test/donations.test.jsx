import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { categoryApi, deviceApi } from '../services/deviceApi';
import { donationApi, recipientApi } from '../services/donationApi';
import { _resetCategoriesCache } from '../hooks/useCategories';
import { donationSteps } from '../lib/donations';
import { USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/donationApi', () => ({
  donationApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), request: vi.fn(), withdraw: vi.fn(), decide: vi.fn(), handover: vi.fn(), confirmHandover: vi.fn(), cancel: vi.fn(), confirmation: vi.fn() },
  recipientApi: { status: vi.fn(), apply: vi.fn() },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 12, ...meta } });
const listingOf = (over = {}) => ({ _id: 'l1', title: 'Dell Latitude', brand: 'Dell', model: '5420', condition: 'fully_working', category: { slug: 'laptops', name: 'Laptops' }, addressArea: 'Indiranagar', city: 'Bengaluru', device: { photos: [] }, ...over });
const donation = (over = {}) => ({
  _id: 'd1', status: 'open', description: 'Works well', listing: listingOf(), donor: { _id: 'u9', name: 'Asha R.' }, viewerRole: 'visitor',
  myRequest: null, actions: [], createdAt: '2026-11-15T07:00:00.000Z', ...over,
});
const donorView = (over = {}) => donation({
  viewerRole: 'donor', donor: { _id: 'u1', name: 'Asha Rao' }, pendingRequests: 1, actions: ['decide', 'cancel'],
  history: [{ status: 'open', at: '2026-11-15T07:00:00.000Z', note: 'Donation offered' }], confirmations: { donor: false, recipient: false },
  listing: listingOf({ location: { type: 'Point', coordinates: [77.59, 12.97] } }),
  requests: [{ _id: 'q1', status: 'pending', justification: 'Our computer lab needs devices.', intendedUse: 'Lab', requester: { _id: 'u5', name: 'Mr Rao', orgName: 'Sunrise School', orgType: 'school' }, createdAt: '2026-11-15T08:00:00.000Z' }],
  status: 'requested', ...over,
});
const recipientView = (over = {}) => donation({
  viewerRole: 'recipient', status: 'accepted', actions: ['schedule_handover'], recipient: { _id: 'u5', name: 'Mr Rao', orgName: 'Sunrise School', orgType: 'school' },
  history: [{ status: 'accepted', at: '2026-11-15T09:00:00.000Z' }], confirmations: { donor: false, recipient: false }, pickup: null, ...over,
});
const statusOf = (over = {}) => ({ isOrg: true, orgType: 'school', orgName: 'Sunrise School', registrationNo: 'REG-1', status: 'not_submitted', ...over });
const apiError = (message, code, status = 409) => Object.assign(new Error(message), { response: { status, data: { message, code } } });
const lastListParams = () => donationApi.list.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.resetAllMocks();
  _resetCategoriesCache();
  setAccessToken(null);
  window.print = vi.fn();
  categoryApi.list.mockResolvedValue([{ slug: 'laptops', name: 'Laptops' }]);
  deviceApi.list.mockResolvedValue(page([]));
  donationApi.list.mockResolvedValue(page([]));
  recipientApi.status.mockResolvedValue(statusOf());
});

describe('donation journey helper', () => {
  const state = (d) => Object.fromEntries(donationSteps(d).map((s) => [s.key, s.state]));
  it('marks earlier steps done and the current one active', () => {
    expect(state({ status: 'accepted' })).toMatchObject({ open: 'done', requested: 'done', accepted: 'current', handover_scheduled: 'todo' });
    expect(Object.values(state({ status: 'completed' })).every((s) => s === 'done')).toBe(true);
  });
  it('shows how far a cancelled donation got', () => {
    expect(state({ status: 'cancelled', history: [{ status: 'open' }, { status: 'requested' }, { status: 'cancelled' }] })).toMatchObject({ requested: 'done', accepted: 'todo' });
  });
});

describe('donation marketplace', () => {
  it('lists open donations with a count and links to each', async () => {
    donationApi.list.mockResolvedValue(page([donation(), donation({ _id: 'd2', listing: listingOf({ _id: 'l2', title: 'HP tablet' }) })]));
    renderApp('/donations', anonymous());
    expect(await screen.findByText('2 donations available')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Dell Latitude' })).toHaveAttribute('href', '/donations/d1');
    expect(screen.getAllByText('Donated by Asha R.')).toHaveLength(2);
  });

  it('filters by condition and text, and can clear', async () => {
    donationApi.list.mockResolvedValue(page([donation()]));
    renderApp('/donations', anonymous());
    await screen.findByText('1 donation available');
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'minor_damage' } });
    await waitFor(() => expect(lastListParams()).toMatchObject({ condition: 'minor_damage' }));
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'Dell' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ q: 'Dell', condition: 'minor_damage' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(lastListParams().condition).toBe(''));
  });

  it('shows a friendly empty state', async () => {
    renderApp('/donations', anonymous());
    expect(await screen.findByText('No donations to request yet')).toBeInTheDocument();
  });

  it('can retry after an error', async () => {
    donationApi.list.mockRejectedValueOnce(apiError('Server down', 'INTERNAL', 500)).mockResolvedValue(page([donation()]));
    renderApp('/donations', anonymous());
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'View Dell Latitude' })).toBeInTheDocument();
  });

  it('points organisations to registration', async () => {
    renderApp('/donations', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'Register your organisation' })).toHaveAttribute('href', '/dashboard/recipient');
  });
});

describe('donation details for visitors and recipients', () => {
  it('asks a signed-out visitor to log in and never shows the exact address', async () => {
    donationApi.get.mockResolvedValue(donation());
    renderApp('/donations/d1', anonymous());
    expect(await screen.findByRole('heading', { name: 'Dell Latitude' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Log in to request' })).toHaveAttribute('href', '/login');
    expect(screen.getByText('The exact address is only shared with the chosen recipient.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open map' })).not.toBeInTheDocument();
  });

  it('sends a signed-in user who is not a verified organisation to registration', async () => {
    donationApi.get.mockResolvedValue(donation());
    renderApp('/donations/d1', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'Register or check your organisation' })).toHaveAttribute('href', '/dashboard/recipient');
  });

  it('says so when the donation is not available', async () => {
    donationApi.get.mockRejectedValue(apiError('Donation not found', 'NOT_FOUND', 404));
    renderApp('/donations/d9', anonymous());
    expect(await screen.findByText('Donation not found')).toBeInTheDocument();
  });

  it('lets a verified organisation request with a justification', async () => {
    donationApi.get.mockResolvedValue(donation({ actions: ['request'] }));
    donationApi.request.mockResolvedValue(donation({ viewerRole: 'visitor', myRequest: { _id: 'q1', status: 'pending' }, actions: ['withdraw'] }));
    renderApp('/donations/d1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Request this device' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText(/at least a sentence/)).toBeInTheDocument();
    expect(donationApi.request).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText('Why does your organisation need it?'), { target: { value: 'Our computer lab needs devices for students.' } });
    fireEvent.change(within(dialog).getByLabelText('How will it be used? (optional)'), { target: { value: 'Lab' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    await waitFor(() => expect(donationApi.request).toHaveBeenCalledWith('d1', { justification: 'Our computer lab needs devices for students.', intendedUse: 'Lab' }));
    expect(await screen.findByText('Request sent to the donor')).toBeInTheDocument();
    expect(await screen.findByText('Your request is with the donor')).toBeInTheDocument();
  });

  it('shows the server reason when a request is refused', async () => {
    donationApi.get.mockResolvedValue(donation({ actions: ['request'] }));
    donationApi.request.mockRejectedValue(apiError('You have already asked for this donation', 'ALREADY_REQUESTED'));
    renderApp('/donations/d1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Request this device' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Why does your organisation need it?'), { target: { value: 'We teach coding to children.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
    expect(await within(dialog).findByText('You have already asked for this donation')).toBeInTheDocument();
  });

  it('lets an organisation withdraw its pending request', async () => {
    donationApi.get.mockResolvedValue(donation({ viewerRole: 'requester', myRequest: { _id: 'q1', status: 'pending' }, actions: ['withdraw'] }));
    donationApi.withdraw.mockResolvedValue(donation({ actions: ['request'] }));
    renderApp('/donations/d1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw my request' }));
    await waitFor(() => expect(donationApi.withdraw).toHaveBeenCalledWith('d1'));
    expect(await screen.findByText('Request withdrawn')).toBeInTheDocument();
  });
});

describe('donor view', () => {
  it('shows requests with the organisation, and the exact location', async () => {
    donationApi.get.mockResolvedValue(donorView());
    renderApp('/dashboard/donations/d1', signedIn(USER));
    expect(await screen.findByText('Requests (1)')).toBeInTheDocument();
    expect(screen.getByText(/Sunrise School/)).toBeInTheDocument();
    expect(screen.getByText('Our computer lab needs devices.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open map' })).toHaveAttribute('href', expect.stringContaining('openstreetmap.org'));
    expect(screen.getByRole('link', { name: /My donations/ })).toHaveAttribute('href', '/dashboard/donations');
  });

  it('asks before choosing a recipient, then moves on', async () => {
    donationApi.get.mockResolvedValue(donorView());
    donationApi.decide.mockResolvedValue(donorView({ status: 'accepted', actions: ['schedule_handover', 'cancel'], recipient: { _id: 'u5', name: 'Mr Rao', orgName: 'Sunrise School' }, requests: [] }));
    renderApp('/dashboard/donations/d1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept request from Sunrise School' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Every other pending request will be declined/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose this recipient' }));
    await waitFor(() => expect(donationApi.decide).toHaveBeenCalledWith('d1', 'q1', 'accept'));
    expect(await screen.findByText('Recipient chosen', { selector: 'div' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Schedule handover' })).toBeInTheDocument();
  });

  it('can decline a request straight away', async () => {
    donationApi.get.mockResolvedValue(donorView());
    donationApi.decide.mockResolvedValue(donorView({ status: 'open', actions: ['cancel'], requests: [] }));
    renderApp('/dashboard/donations/d1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Decline request from Sunrise School' }));
    await waitFor(() => expect(donationApi.decide).toHaveBeenCalledWith('d1', 'q1', 'reject'));
  });

  it('withdraws the donation with an optional reason', async () => {
    donationApi.get.mockResolvedValue(donorView());
    donationApi.cancel.mockResolvedValue(donorView({ status: 'cancelled', actions: [], requests: [] }));
    renderApp('/dashboard/donations/d1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw this donation' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Reason (optional)'), { target: { value: 'Changed my mind' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw donation' }));
    await waitFor(() => expect(donationApi.cancel).toHaveBeenCalledWith('d1', 'Changed my mind'));
    expect(await screen.findByText('Donation withdrawn', { selector: 'div' })).toBeInTheDocument();
  });
});

describe('handover and confirmation', () => {
  it('needs a future date before scheduling', async () => {
    donationApi.get.mockResolvedValue(recipientView());
    donationApi.handover.mockResolvedValue(recipientView({ status: 'handover_scheduled', actions: ['schedule_handover', 'confirm_handover'], pickup: { date: '2030-01-02T10:30:00.000Z', timeSlot: '10:00-12:00', status: 'confirmed' } }));
    renderApp('/dashboard/donations/d1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule handover' }));
    expect(await screen.findByText('Choose a date and time in the future.')).toBeInTheDocument();
    expect(donationApi.handover).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2030-01-02T10:30' } });
    fireEvent.change(screen.getByLabelText('Time window (optional)'), { target: { value: '10:00-12:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Schedule handover' }));
    await waitFor(() => expect(donationApi.handover).toHaveBeenCalledTimes(1));
    expect(donationApi.handover.mock.calls[0][0]).toBe('d1');
    expect(donationApi.handover.mock.calls[0][1]).toMatchObject({ timeSlot: '10:00-12:00', date: new Date('2030-01-02T10:30').toISOString() });
    expect(await screen.findByText('Handover scheduled', { selector: 'div' })).toBeInTheDocument();
  });

  it('requires the donor to tick the checklist before confirming (BR-12)', async () => {
    donationApi.get.mockResolvedValue(donorView({ status: 'handover_scheduled', requests: [], actions: ['schedule_handover', 'confirm_handover', 'cancel'], pickup: { date: '2030-01-02T10:30:00.000Z', status: 'confirmed' } }));
    donationApi.confirmHandover.mockResolvedValue(donorView({ status: 'handover_scheduled', requests: [], actions: ['cancel'], confirmations: { donor: true, recipient: false } }));
    renderApp('/dashboard/donations/d1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm handover' }));
    expect(await screen.findByText('Please confirm the data-protection checklist first.')).toBeInTheDocument();
    expect(donationApi.confirmHandover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('I have completed this checklist'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm handover' }));
    await waitFor(() => expect(donationApi.confirmHandover).toHaveBeenCalledWith('d1', { acknowledgeChecklist: true }));
  });

  it('lets the recipient confirm receipt without a checklist', async () => {
    donationApi.get.mockResolvedValue(recipientView({ status: 'handover_scheduled', actions: ['schedule_handover', 'confirm_handover'], pickup: { date: '2030-01-02T10:30:00.000Z', status: 'confirmed' } }));
    donationApi.confirmHandover.mockResolvedValue(recipientView({ status: 'completed', actions: ['view_confirmation'], confirmation: { refNo: 'DON-2026-ABC123' }, confirmations: { donor: true, recipient: true } }));
    renderApp('/dashboard/donations/d1', signedIn(USER));
    expect(screen.queryByLabelText('I have completed this checklist')).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'I received the device' }));
    await waitFor(() => expect(donationApi.confirmHandover).toHaveBeenCalledWith('d1', {}));
    expect(await screen.findByText('DON-2026-ABC123')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View confirmation' })).toHaveAttribute('href', '/dashboard/donations/d1/confirmation');
  });

  it('renders the printable confirmation and prints it', async () => {
    donationApi.confirmation.mockResolvedValue({
      refNo: 'DON-2026-ABC123', issuedAt: '2026-11-20T10:00:00.000Z',
      device: { title: 'Dell Latitude', brand: 'Dell', model: '5420', condition: 'fully_working', category: 'Laptop' },
      donor: { name: 'Asha Rao' }, recipient: { name: 'Mr Rao', orgName: 'Sunrise School', orgType: 'school' },
      handoverDate: '2026-11-19T10:00:00.000Z', confirmedAt: { donor: '2026-11-19T10:05:00.000Z', recipient: '2026-11-20T10:00:00.000Z' },
      statement: 'This document records a free transfer. No payment was made or processed.',
    });
    renderApp('/dashboard/donations/d1/confirmation', signedIn(USER));
    expect(await screen.findByRole('heading', { name: 'Donation confirmation' })).toBeInTheDocument();
    expect(screen.getByText('DON-2026-ABC123')).toBeInTheDocument();
    expect(screen.getByText('Sunrise School · School')).toBeInTheDocument();
    expect(screen.getByText(/No payment was made/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Print or save as PDF/ }));
    expect(window.print).toHaveBeenCalled();
  });

  it('explains when the confirmation is not available yet', async () => {
    donationApi.confirmation.mockRejectedValue(apiError('Not completed', 'NOT_COMPLETED', 409));
    renderApp('/dashboard/donations/d1/confirmation', signedIn(USER));
    expect(await screen.findByText('No confirmation yet')).toBeInTheDocument();
  });
});

describe('my donations', () => {
  it('lists donations I offered, with waiting requests, and switches to the ones I asked for', async () => {
    donationApi.list.mockResolvedValue(page([donation({ viewerRole: 'donor', pendingRequests: 2 })]));
    renderApp('/dashboard/donations', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'View Dell Latitude' })).toHaveAttribute('href', '/dashboard/donations/d1');
    expect(screen.getByText('2 requests waiting')).toBeInTheDocument();
    expect(lastListParams()).toMatchObject({ as: 'donor' });
    fireEvent.click(screen.getByRole('tab', { name: 'I asked for' }));
    await waitFor(() => expect(lastListParams()).toMatchObject({ as: 'recipient' }));
  });

  it('shows the organisation status for general users', async () => {
    recipientApi.status.mockResolvedValue(statusOf({ status: 'pending' }));
    renderApp('/dashboard/donations', signedIn(USER));
    expect(await screen.findByText('Waiting for review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View details' })).toHaveAttribute('href', '/dashboard/recipient');
  });

  it('shows empty states for both tabs', async () => {
    renderApp('/dashboard/donations', signedIn(USER));
    expect(await screen.findByText('You have not offered any donations yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'I asked for' }));
    expect(await screen.findByText('You have not asked for any devices yet')).toBeInTheDocument();
  });
});

describe('recipient organisation', () => {
  it('validates, sends the details and shows the pending status', async () => {
    recipientApi.status.mockResolvedValue({ isOrg: false, status: 'not_submitted' });
    recipientApi.apply.mockResolvedValue(statusOf({ status: 'pending' }));
    renderApp('/dashboard/recipient', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Send for verification' }));
    expect(await screen.findByText('Choose the type of organisation.')).toBeInTheDocument();
    expect(screen.getByText('Enter the organisation name.')).toBeInTheDocument();
    expect(recipientApi.apply).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Type of organisation'), { target: { value: 'school' } });
    fireEvent.change(screen.getByLabelText('Organisation name'), { target: { value: 'Sunrise School' } });
    fireEvent.change(screen.getByLabelText('Registration number'), { target: { value: 'REG-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send for verification' }));
    await waitFor(() => expect(recipientApi.apply).toHaveBeenCalledWith({ orgType: 'school', orgName: 'Sunrise School', registrationNo: 'REG-1234' }));
    expect(await screen.findByText('Waiting for review')).toBeInTheDocument();
    expect(screen.getByText('Your organisation was sent for verification.')).toBeInTheDocument();
  });

  it('hides the form once the organisation is verified', async () => {
    recipientApi.status.mockResolvedValue(statusOf({ status: 'approved' }));
    renderApp('/dashboard/recipient', signedIn(USER));
    expect(await screen.findByText('Verified')).toBeInTheDocument();
    expect(screen.queryByLabelText('Organisation name')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'donation marketplace' })).toHaveAttribute('href', '/donations');
  });

  it('shows the reviewer reason after a rejection', async () => {
    recipientApi.status.mockResolvedValue(statusOf({ status: 'rejected', reason: 'Registration number could not be checked' }));
    renderApp('/dashboard/recipient', signedIn(USER));
    expect(await screen.findByText('Registration number could not be checked')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update details' })).toBeInTheDocument();
  });
});

describe('offering a listing for donation', () => {
  const mine = (over = {}) => ({ _id: 'l1', title: 'Dell Latitude', status: 'listed', isOwner: true, condition: 'fully_working', preferredService: 'donation', category: { slug: 'laptops', name: 'Laptops' }, viewCount: 0, device: { photos: [] }, ...over });

  it('offers a listed donation device and opens the new donation', async () => {
    deviceApi.list.mockResolvedValue(page([mine()]));
    donationApi.create.mockResolvedValue(donorView({ status: 'open', requests: [], actions: ['cancel'] }));
    donationApi.get.mockResolvedValue(donorView({ status: 'open', requests: [], actions: ['cancel'] }));
    renderApp('/dashboard/listings', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Offer for donation' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Message for recipients (optional)'), { target: { value: 'Comes with charger' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Offer device' }));
    await waitFor(() => expect(donationApi.create).toHaveBeenCalledWith({ listingId: 'l1', description: 'Comes with charger' }));
    expect(await screen.findByText('Your device is now offered to verified organisations.')).toBeInTheDocument();
  });

  it('only shows the button for donation listings', async () => {
    deviceApi.list.mockResolvedValue(page([mine({ preferredService: 'reuse' })]));
    renderApp('/dashboard/listings', signedIn(USER));
    await screen.findByText('Dell Latitude');
    expect(screen.queryByRole('button', { name: 'Offer for donation' })).not.toBeInTheDocument();
  });

  it('shows the reason when the offer is refused', async () => {
    deviceApi.list.mockResolvedValue(page([mine()]));
    donationApi.create.mockRejectedValue(apiError('Only working or repairable devices can be donated.', 'NOT_DONATABLE'));
    renderApp('/dashboard/listings', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Offer for donation' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Offer device' }));
    expect(await screen.findByText('Only working or repairable devices can be donated.')).toBeInTheDocument();
  });
});

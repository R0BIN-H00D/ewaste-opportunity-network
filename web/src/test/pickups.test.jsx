import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { deviceApi } from '../services/deviceApi';
import { pickupApi } from '../services/pickupApi';
import { USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/pickupApi', () => ({ pickupApi: { list: vi.fn(), confirm: vi.fn() } }));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const ADMIN = { ...USER, _id: 'a1', name: 'Admin', role: 'admin' };
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 10, ...meta } });
const pickup = (over = {}) => ({
  _id: 'p1', kind: 'recycling', contextId: 'r1', title: 'Recycling request ER-1', link: '/dashboard/recycling/r1', date: '2027-01-20T10:00:00.000Z',
  timeSlot: '10:00-12:00', notes: 'Ring the bell', addressArea: 'Indiranagar', status: 'confirmed', rescheduleCount: 0, viewerRole: 'requester',
  counterpart: { _id: 'c1', name: 'GreenCycle Recyclers' }, ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  setAccessToken(null);
  deviceApi.list.mockResolvedValue({ items: [], meta: { total: 0, page: 1, pages: 1, limit: 1 } });
  pickupApi.list.mockResolvedValue(page([pickup()]));
});

describe('Pickups page', () => {
  it('lists upcoming pickups with the area only and a link to the request', async () => {
    renderApp('/dashboard/pickups', signedIn(USER));
    expect(await screen.findByRole('heading', { name: 'Pickups' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Recycling request ER-1' })).toBeInTheDocument();
    const card = screen.getByRole('article');
    expect(within(card).getByText('Recycling')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
    expect(screen.getByText(/10:00-12:00/)).toBeInTheDocument();
    expect(screen.getByText(/You hand over/)).toHaveTextContent('with GreenCycle Recyclers');
    expect(screen.getByText('Indiranagar')).toBeInTheDocument();
    expect(screen.getByText('Note: Ring the bell')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toHaveAttribute('href', '/dashboard/recycling/r1');
    expect(pickupApi.list).toHaveBeenCalledWith({ when: 'upcoming', page: 1, limit: 10 }, expect.anything());
  });

  it('says what the person does on each side and counts reschedules', async () => {
    pickupApi.list.mockResolvedValue(page([pickup({ viewerRole: 'provider', status: 'rescheduled', rescheduleCount: 2, notes: '' })]));
    renderApp('/dashboard/pickups', signedIn(USER));
    expect(await screen.findByText(/You collect/)).toBeInTheDocument();
    expect(screen.getByText('Rescheduled (2×)')).toBeInTheDocument();
    expect(screen.queryByText(/^Note:/)).not.toBeInTheDocument();
  });

  it('switches to past pickups', async () => {
    renderApp('/dashboard/pickups', signedIn(USER));
    await screen.findByRole('heading', { name: 'Recycling request ER-1' });
    pickupApi.list.mockResolvedValue(page([pickup({ _id: 'p2', title: 'Old laptop', kind: 'donation', status: 'collected', link: '/dashboard/donations/d1' })]));
    fireEvent.click(screen.getByRole('tab', { name: 'Past' }));
    expect(await screen.findByRole('heading', { name: 'Old laptop' })).toBeInTheDocument();
    expect(screen.getByText('Collected')).toBeInTheDocument();
    expect(screen.getByText('Donation')).toBeInTheDocument();
    await waitFor(() => expect(pickupApi.list).toHaveBeenLastCalledWith({ when: 'past', page: 1, limit: 10 }, expect.anything()));
  });

  it('explains an empty list for each tab', async () => {
    pickupApi.list.mockResolvedValue(page([]));
    renderApp('/dashboard/pickups', signedIn(USER));
    expect(await screen.findByText('No upcoming pickups')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Past' }));
    expect(await screen.findByText('No past pickups')).toBeInTheDocument();
  });

  it('shows an error with a way to retry', async () => {
    pickupApi.list.mockRejectedValueOnce(new Error('Network down'));
    renderApp('/dashboard/pickups', signedIn(USER));
    expect(await screen.findByText('Could not load your pickups')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Recycling request ER-1' })).toBeInTheDocument();
  });

  it('pages through the list', async () => {
    pickupApi.list.mockResolvedValue(page([pickup()], { total: 12, pages: 2 }));
    renderApp('/dashboard/pickups', signedIn(USER));
    await screen.findByRole('heading', { name: 'Recycling request ER-1' });
    fireEvent.click(screen.getByRole('button', { name: 'Page 2' }));
    await waitFor(() => expect(pickupApi.list).toHaveBeenLastCalledWith({ when: 'upcoming', page: 2, limit: 10 }, expect.anything()));
  });

  it('needs a login', async () => {
    renderApp('/dashboard/pickups', anonymous());
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    expect(pickupApi.list).not.toHaveBeenCalled();
  });

  it('is in the menu for providers and requesters but not for admins', async () => {
    renderApp('/dashboard', signedIn(USER));
    expect((await screen.findAllByRole('link', { name: /Pickups/ }))[0]).toHaveAttribute('href', '/dashboard/pickups');
  });

  it('keeps admins out of the menu', async () => {
    renderApp('/dashboard', signedIn(ADMIN));
    await screen.findAllByRole('link', { name: /Notifications/ });
    expect(screen.queryByRole('link', { name: /Pickups/ })).not.toBeInTheDocument();
  });
});

describe('Pickups page: confirming a time (FR-PICK-002)', () => {
  const open = () => renderApp('/dashboard/pickups', signedIn(USER));

  it('asks the person to confirm a time the other side set, and confirms it', async () => {
    pickupApi.list.mockResolvedValue(page([pickup({ status: 'rescheduled', awaitingMe: true, proposedByMe: false })]));
    pickupApi.confirm.mockResolvedValue({ _id: 'p1', status: 'confirmed' });
    open();
    expect(await screen.findByText(/GreenCycle Recyclers suggested this time/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm this time' }));
    await waitFor(() => expect(pickupApi.confirm).toHaveBeenCalledWith('p1'));
    await waitFor(() => expect(pickupApi.list).toHaveBeenCalledTimes(2)); // the list is fetched again
  });

  it('says the person who suggested a time is waiting for the other, and offers no button', async () => {
    pickupApi.list.mockResolvedValue(page([pickup({ status: 'rescheduled', awaitingMe: false, proposedByMe: true })]));
    open();
    expect(await screen.findByText(/Waiting for GreenCycle Recyclers to confirm this time/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm this time' })).not.toBeInTheDocument();
  });

  it('offers nothing for a time that is already settled', async () => {
    open();
    await screen.findByRole('heading', { name: 'Recycling request ER-1' });
    expect(screen.queryByRole('button', { name: 'Confirm this time' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Waiting for/)).not.toBeInTheDocument();
  });

  it('shows why a confirmation failed and keeps the button', async () => {
    pickupApi.list.mockResolvedValue(page([pickup({ status: 'rescheduled', awaitingMe: true })]));
    pickupApi.confirm.mockRejectedValue(Object.assign(new Error('This time has already passed'), { response: { status: 409, data: { message: 'This time has already passed', code: 'TIME_PASSED' } } }));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm this time' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already passed');
    expect(screen.getByRole('button', { name: 'Confirm this time' })).toBeEnabled();
  });
});
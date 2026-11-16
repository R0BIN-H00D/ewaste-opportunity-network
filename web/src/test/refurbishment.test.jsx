import { fireEvent, screen, waitFor } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { categoryApi, deviceApi } from '../services/deviceApi';
import { refurbApi } from '../services/refurbishmentApi';
import { _resetCategoriesCache } from '../hooks/useCategories';
import { jobLabel, jobSteps } from '../lib/refurbishment';
import { USER, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/refurbishmentApi', () => ({
  refurbApi: { opportunities: vi.fn(), offer: vi.fn(), jobs: vi.fn(), job: vi.fn(), decide: vi.fn(), withdraw: vi.fn(), handover: vi.fn(), confirmHandover: vi.fn(), advance: vi.fn(), addPhotos: vi.fn(), cancel: vi.fn() },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const REFURB = { ...USER, _id: 'u3', name: 'Ravi Kumar', role: 'refurbisher' };
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 12, ...meta } });
const listingOf = (over = {}) => ({ _id: 'l1', title: 'Lenovo ThinkPad T450', brand: 'Lenovo', model: 'T450', condition: 'minor_damage', category: { slug: 'laptops', name: 'Laptops' }, addressArea: 'Indiranagar', city: 'Bengaluru', device: { photos: [] }, ...over });
const opportunity = (over = {}) => ({ ...listingOf(), preferredService: 'refurbishment', hasOffered: false, ...over });
const job = (over = {}) => ({
  _id: 'j1', status: 'offered', viewerRole: 'owner', actions: [], listing: listingOf(),
  offer: { amount: 1500, message: 'Can collect this week', status: 'pending' },
  owner: { _id: 'u1', name: 'Asha Rao' }, refurbisher: { _id: 'u3', name: 'Ravi Kumar', businessName: 'Ravi Works' },
  beforePhotos: [], afterPhotos: [], workLog: [], history: [{ status: 'offered', at: '2026-11-15T07:00:00.000Z', note: 'Offer made' }],
  confirmations: { owner: false, refurbisher: false }, pickup: null, createdAt: '2026-11-15T07:00:00.000Z', ...over,
});
const apiError = (message, code, status = 409) => Object.assign(new Error(message), { response: { status, data: { message, code } } });

beforeEach(() => {
  vi.resetAllMocks();
  _resetCategoriesCache();
  setAccessToken(null);
  categoryApi.list.mockResolvedValue([{ slug: 'laptops', name: 'Laptops' }]);
  deviceApi.list.mockResolvedValue(page([]));
  refurbApi.opportunities.mockResolvedValue(page([]));
  refurbApi.jobs.mockResolvedValue(page([]));
});

describe('refurbishment journey helper', () => {
  const state = (j) => Object.fromEntries(jobSteps(j).map((s) => [s.key, s.state]));
  it('marks earlier steps done and the current one active', () => {
    expect(state({ status: 'testing' })).toMatchObject({ offered: 'done', collected: 'done', testing: 'current', ready_to_list: 'todo' });
    expect(Object.values(state({ status: 'listed' })).every((s) => s === 'done')).toBe(true);
  });
  it('shows how far a cancelled job got', () => {
    expect(state({ status: 'cancelled', history: [{ status: 'offered' }, { status: 'accepted' }, { status: 'cancelled' }] })).toMatchObject({ accepted: 'done', collected: 'todo' });
  });
});

describe('job labels', () => {
  it('words the first step for each side', () => {
    expect(jobLabel('offered', 'owner')).toBe('Offer received');
    expect(jobLabel('offered', 'refurbisher')).toBe('Offer sent');
    expect(jobLabel('testing', 'owner')).toBe('Testing');
  });
  it('shows the owner an offer they received', async () => {
    refurbApi.jobs.mockResolvedValue(page([job()]));
    renderApp('/dashboard/refurbishment', signedIn(USER));
    expect(await screen.findByText('Offer received')).toBeInTheDocument();
    expect(screen.queryByText('Offer sent')).not.toBeInTheDocument();
  });
});

describe('devices to refurbish', () => {
  it('lists reusable devices for a refurbisher and shows which already have an offer', async () => {
    refurbApi.opportunities.mockResolvedValue(page([opportunity(), opportunity({ _id: 'l2', title: 'Old iPad', hasOffered: true })]));
    renderApp('/dashboard/opportunities', signedIn(REFURB));
    expect(await screen.findByText('2 devices available')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Make an offer on Lenovo ThinkPad T450' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make an offer on Old iPad' })).not.toBeInTheDocument();
    expect(screen.getByText('Offer sent')).toBeInTheDocument();
  });

  it('is not for general users', async () => {
    renderApp('/dashboard/opportunities', signedIn(USER));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Devices to refurbish' })).not.toBeInTheDocument());
    expect(refurbApi.opportunities).not.toHaveBeenCalled();
  });

  it('shows a friendly empty state', async () => {
    renderApp('/dashboard/opportunities', signedIn(REFURB));
    expect(await screen.findByText('No devices to refurbish right now')).toBeInTheDocument();
  });

  it('checks the amount, sends the offer and opens the new job', async () => {
    refurbApi.opportunities.mockResolvedValue(page([opportunity()]));
    refurbApi.offer.mockResolvedValue(job({ viewerRole: 'refurbisher', actions: ['withdraw'] }));
    refurbApi.job.mockResolvedValue(job({ viewerRole: 'refurbisher', actions: ['withdraw'] }));
    renderApp('/dashboard/opportunities', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Make an offer on Lenovo ThinkPad T450' }));
    fireEvent.change(screen.getByLabelText(/What will you pay the owner/), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(await screen.findByText('Enter an amount of 0 or more.')).toBeInTheDocument();
    expect(refurbApi.offer).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/What will you pay the owner/), { target: { value: '1500' } });
    fireEvent.change(screen.getByLabelText(/Message for the owner/), { target: { value: 'Can collect this week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    await waitFor(() => expect(refurbApi.offer).toHaveBeenCalledWith({ listingId: 'l1', amount: 1500, message: 'Can collect this week' }));
    expect(await screen.findByText('Your offer was sent to the owner.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Withdraw my offer' })).toBeInTheDocument();
  });

  it('treats an empty amount as a free collection', async () => {
    refurbApi.opportunities.mockResolvedValue(page([opportunity()]));
    refurbApi.offer.mockResolvedValue(job());
    refurbApi.job.mockResolvedValue(job());
    renderApp('/dashboard/opportunities', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Make an offer on Lenovo ThinkPad T450' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    await waitFor(() => expect(refurbApi.offer).toHaveBeenCalledWith({ listingId: 'l1', amount: 0 }));
  });

  it('shows the server reason when an offer is refused', async () => {
    refurbApi.opportunities.mockResolvedValue(page([opportunity()]));
    refurbApi.offer.mockRejectedValue(apiError('You already made an offer on this device', 'ALREADY_OFFERED'));
    renderApp('/dashboard/opportunities', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Make an offer on Lenovo ThinkPad T450' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(await screen.findByText('You already made an offer on this device')).toBeInTheDocument();
  });
});

describe('refurbishment jobs list', () => {
  it('shows an owner the offers on their devices', async () => {
    refurbApi.jobs.mockResolvedValue(page([job()]));
    renderApp('/dashboard/refurbishment', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'View Lenovo ThinkPad T450' })).toHaveAttribute('href', '/dashboard/refurbishment/j1');
    expect(screen.getByText(/Offer from Ravi Kumar/)).toBeInTheDocument();
    expect(refurbApi.jobs.mock.calls.at(-1)[0]).toMatchObject({ as: 'owner' });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument(); // only refurbishers have two lists
  });

  it('lets a refurbisher switch between their jobs and offers on their own devices', async () => {
    refurbApi.jobs.mockResolvedValue(page([job({ viewerRole: 'refurbisher' })]));
    renderApp('/dashboard/refurbishment', signedIn(REFURB));
    expect(await screen.findByText(/Owner Asha Rao/)).toBeInTheDocument();
    expect(refurbApi.jobs.mock.calls.at(-1)[0]).toMatchObject({ as: 'refurbisher' });
    fireEvent.click(screen.getByRole('tab', { name: 'Offers on my devices' }));
    await waitFor(() => expect(refurbApi.jobs.mock.calls.at(-1)[0]).toMatchObject({ as: 'owner' }));
  });

  it('has a friendly empty state for owners', async () => {
    renderApp('/dashboard/refurbishment', signedIn(USER));
    expect(await screen.findByText('No offers on your devices yet')).toBeInTheDocument();
  });
});

describe('job page: the owner', () => {
  it('accepts an offer after confirming', async () => {
    refurbApi.job.mockResolvedValue(job({ actions: ['decide', 'cancel'] }));
    refurbApi.decide.mockResolvedValue(job({ status: 'accepted', actions: ['schedule_handover', 'cancel'] }));
    renderApp('/dashboard/refurbishment/j1', signedIn(USER));
    expect(await screen.findByText(/Ravi Works offers ₹1,500/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Accept offer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose this refurbisher' }));
    await waitFor(() => expect(refurbApi.decide).toHaveBeenCalledWith('j1', 'accept'));
    expect(await screen.findByRole('button', { name: 'Schedule collection' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept offer' })).not.toBeInTheDocument();
  });

  it('declines an offer', async () => {
    refurbApi.job.mockResolvedValue(job({ actions: ['decide', 'cancel'] }));
    refurbApi.decide.mockResolvedValue(job({ status: 'cancelled', actions: [] }));
    renderApp('/dashboard/refurbishment/j1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Decline offer' }));
    await waitFor(() => expect(refurbApi.decide).toHaveBeenCalledWith('j1', 'reject'));
  });

  it('shows the server reason when the device is no longer available', async () => {
    refurbApi.job.mockResolvedValue(job({ actions: ['decide'] }));
    refurbApi.decide.mockRejectedValue(apiError('This device is no longer available', 'LISTING_UNAVAILABLE'));
    renderApp('/dashboard/refurbishment/j1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Accept offer' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Choose this refurbisher' }));
    expect(await screen.findByText('This device is no longer available')).toBeInTheDocument();
  });

  it('needs a future date to schedule the collection', async () => {
    refurbApi.job.mockResolvedValue(job({ status: 'accepted', actions: ['schedule_handover', 'cancel'] }));
    renderApp('/dashboard/refurbishment/j1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Schedule collection' }));
    expect(await screen.findByText('Choose a date and time in the future.')).toBeInTheDocument();
    expect(refurbApi.handover).not.toHaveBeenCalled();
  });

  it('requires the data-protection checklist before confirming the handover (BR-12)', async () => {
    refurbApi.job.mockResolvedValue(job({ status: 'accepted', actions: ['confirm_handover'], pickup: { date: '2030-01-01T10:00:00.000Z', status: 'confirmed' } }));
    refurbApi.confirmHandover.mockResolvedValue(job({ status: 'accepted', actions: [], confirmations: { owner: true, refurbisher: false } }));
    renderApp('/dashboard/refurbishment/j1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm handover' }));
    expect(await screen.findByText('Please confirm the data-protection checklist first.')).toBeInTheDocument();
    expect(refurbApi.confirmHandover).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('I have completed this checklist'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm handover' }));
    await waitFor(() => expect(refurbApi.confirmHandover).toHaveBeenCalledWith('j1', { acknowledgeChecklist: true }));
    expect(await screen.findByText(/Waiting for the refurbisher to confirm/)).toBeInTheDocument();
  });

  it('cancels with a reason after confirmation', async () => {
    refurbApi.job.mockResolvedValue(job({ status: 'accepted', actions: ['schedule_handover', 'cancel'] }));
    refurbApi.cancel.mockResolvedValue(job({ status: 'cancelled', actions: [] }));
    renderApp('/dashboard/refurbishment/j1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel this job' }));
    fireEvent.change(await screen.findByLabelText('Reason (optional)'), { target: { value: 'Changed my mind' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel job' }));
    await waitFor(() => expect(refurbApi.cancel).toHaveBeenCalledWith('j1', 'Changed my mind'));
  });

  it('shows the exact pickup point only when the server sends it', async () => {
    refurbApi.job.mockResolvedValue(job({ status: 'accepted', actions: [], listing: listingOf({ location: { type: 'Point', coordinates: [77.59, 12.97] } }) }));
    const { unmount } = renderApp('/dashboard/refurbishment/j1', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'Open map' })).toBeInTheDocument();
    unmount();
    refurbApi.job.mockResolvedValue(job({ status: 'collected', viewerRole: 'refurbisher', actions: [] }));
    renderApp('/dashboard/refurbishment/j1', signedIn(REFURB));
    await screen.findByRole('heading', { name: 'Lenovo ThinkPad T450' });
    expect(screen.queryByRole('link', { name: 'Open map' })).not.toBeInTheDocument();
  });

  it('reports a job that is not theirs as not found', async () => {
    refurbApi.job.mockRejectedValue(apiError('Job not found', 'NOT_FOUND', 404));
    renderApp('/dashboard/refurbishment/j9', signedIn(USER));
    expect(await screen.findByText('Job not found')).toBeInTheDocument();
  });
});

describe('job page: the refurbisher', () => {
  const mine = (over = {}) => job({ viewerRole: 'refurbisher', status: 'collected', actions: ['advance', 'add_photos'], nextStatus: 'assessment', photoStages: ['before'], ...over });

  it('moves the job forward with a note', async () => {
    refurbApi.job.mockResolvedValue(mine());
    refurbApi.advance.mockResolvedValue(mine({ status: 'assessment', nextStatus: 'in_progress' }));
    renderApp('/dashboard/refurbishment/j1', signedIn(REFURB));
    fireEvent.change(await screen.findByLabelText('Note for the work log (optional)'), { target: { value: 'Battery weak' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start assessment' }));
    await waitFor(() => expect(refurbApi.advance).toHaveBeenCalledWith('j1', 'assessment', 'Battery weak'));
    expect(await screen.findByRole('button', { name: 'Start refurbishing' })).toBeInTheDocument();
  });

  it('shows the server reason when a step is refused', async () => {
    refurbApi.job.mockResolvedValue(mine({ status: 'testing', nextStatus: 'ready_to_list' }));
    refurbApi.advance.mockRejectedValue(apiError('Add at least one "after" photo', 'VALIDATION_ERROR', 422));
    renderApp('/dashboard/refurbishment/j1', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Mark ready to list' }));
    expect(await screen.findByText(/Add at least one "after" photo/)).toBeInTheDocument();
  });

  it('offers only the photo sets the server allows, and needs a photo to upload', async () => {
    refurbApi.job.mockResolvedValue(mine({ status: 'in_progress', nextStatus: 'testing', photoStages: ['before', 'after'] }));
    renderApp('/dashboard/refurbishment/j1', signedIn(REFURB));
    expect(await screen.findByLabelText('Before the work')).toBeChecked();
    expect(screen.getByLabelText('After the work')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Upload photos' }));
    expect(await screen.findByText('Choose at least one photo.')).toBeInTheDocument();
    expect(refurbApi.addPhotos).not.toHaveBeenCalled();
  });

  it('withdraws an offer', async () => {
    refurbApi.job.mockResolvedValue(job({ viewerRole: 'refurbisher', actions: ['withdraw'] }));
    refurbApi.withdraw.mockResolvedValue(job({ viewerRole: 'refurbisher', status: 'cancelled', actions: [] }));
    renderApp('/dashboard/refurbishment/j1', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw my offer' }));
    await waitFor(() => expect(refurbApi.withdraw).toHaveBeenCalledWith('j1'));
  });

  it('confirms the collection without a checklist', async () => {
    refurbApi.job.mockResolvedValue(job({ viewerRole: 'refurbisher', status: 'accepted', actions: ['confirm_handover'], pickup: { date: '2030-01-01T10:00:00.000Z', status: 'confirmed' } }));
    refurbApi.confirmHandover.mockResolvedValue(job({ viewerRole: 'refurbisher', status: 'collected', actions: [] }));
    renderApp('/dashboard/refurbishment/j1', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'I collected the device' }));
    await waitFor(() => expect(refurbApi.confirmHandover).toHaveBeenCalledWith('j1', {}));
  });

  it('shows the work log and before/after photos', async () => {
    refurbApi.job.mockResolvedValue(mine({
      status: 'in_progress', actions: [], workLog: [{ text: 'Replaced the battery', at: '2026-11-16T07:00:00.000Z' }],
      beforePhotos: [{ url: '/uploads/a.png', publicId: 'a' }], afterPhotos: [{ url: '/uploads/b.png', publicId: 'b' }],
    }));
    renderApp('/dashboard/refurbishment/j1', signedIn(REFURB));
    expect(await screen.findByText('Replaced the battery')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Photo from before the work' })).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Photo from after the work' })).toBeInTheDocument();
  });
});

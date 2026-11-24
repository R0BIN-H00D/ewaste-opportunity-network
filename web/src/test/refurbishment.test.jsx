import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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
  refurbApi: { opportunities: vi.fn(), offer: vi.fn(), jobs: vi.fn(), job: vi.fn(), decide: vi.fn(), withdraw: vi.fn(), handover: vi.fn(), confirmHandover: vi.fn(), advance: vi.fn(), addPhotos: vi.fn(), cancel: vi.fn(), wanted: vi.fn(), getWanted: vi.fn(), addWanted: vi.fn(), updateWanted: vi.fn(), setWantedStatus: vi.fn(), deleteWanted: vi.fn(), respondWanted: vi.fn(), wantedResponses: vi.fn() },
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
  refurbApi.wanted.mockResolvedValue(page([]));
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
    expect(screen.getByRole('link', { name: 'Make an offer on Lenovo ThinkPad T450' })).toHaveAttribute('href', '/dashboard/opportunities/l1/offer');
    expect(screen.queryByRole('link', { name: 'Make an offer on Old iPad' })).not.toBeInTheDocument();
    expect(screen.getByText('Offer sent')).toBeInTheDocument();
  });

  it('is not for general users', async () => {
    renderApp('/dashboard/opportunities', signedIn(USER));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Devices to refurbish' })).not.toBeInTheDocument());
    expect(refurbApi.opportunities).not.toHaveBeenCalled();
  });

  it('no longer has the requests on this page, only a link to their own page', async () => {
    renderApp('/dashboard/opportunities', signedIn(REFURB));
    expect((await screen.findAllByRole('link', { name: 'My requests' })).every((a) => a.getAttribute('href') === '/dashboard/my-requests')).toBe(true); // the side menu and the page header
    expect(screen.queryByRole('button', { name: /New request/ })).not.toBeInTheDocument();
    expect(refurbApi.wanted).not.toHaveBeenCalled();
  });

  it('shows a friendly empty state', async () => {
    renderApp('/dashboard/opportunities', signedIn(REFURB));
    expect(await screen.findByText('No devices to refurbish right now')).toBeInTheDocument();
  });

  const openOffer = async () => {
    deviceApi.get.mockResolvedValue(opportunity());
    renderApp('/dashboard/opportunities/l1/offer', signedIn(REFURB));
    await screen.findByRole('heading', { level: 1, name: 'Make an offer' });
  };

  it('is a page of its own with the device beside the offer', async () => {
    await openOffer();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'The device' })).getByText('Lenovo ThinkPad T450')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'What happens next' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Devices to refurbish/ })).toHaveAttribute('href', '/dashboard/opportunities');
  });

  it('checks the amount, sends the offer and opens the new job', async () => {
    refurbApi.offer.mockResolvedValue(job({ viewerRole: 'refurbisher', actions: ['withdraw'] }));
    refurbApi.job.mockResolvedValue(job({ viewerRole: 'refurbisher', actions: ['withdraw'] }));
    await openOffer();
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

  it('fills the amount and message from the quick choices', async () => {
    await openOffer();
    fireEvent.click(screen.getByRole('button', { name: '₹1,000' }));
    expect(screen.getByLabelText(/What will you pay the owner/)).toHaveValue(1000);
    fireEvent.click(screen.getByRole('button', { name: 'Free collection' }));
    expect(screen.getByLabelText(/What will you pay the owner/)).toHaveValue(null);
    fireEvent.click(screen.getByRole('button', { name: 'I can collect it this week.' }));
    expect(screen.getByLabelText(/Message for the owner/)).toHaveValue('I can collect it this week.');
  });

  it('treats an empty amount as a free collection', async () => {
    refurbApi.offer.mockResolvedValue(job());
    refurbApi.job.mockResolvedValue(job());
    await openOffer();
    fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    await waitFor(() => expect(refurbApi.offer).toHaveBeenCalledWith({ listingId: 'l1', amount: 0 }));
  });

  it('shows the server reason when an offer is refused', async () => {
    refurbApi.offer.mockRejectedValue(apiError('You already made an offer on this device', 'ALREADY_OFFERED'));
    await openOffer();
    fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    expect(await screen.findByText('You already made an offer on this device')).toBeInTheDocument();
  });

  it('says so when the device cannot be found', async () => {
    deviceApi.get.mockRejectedValue(apiError('Listing not found', 'NOT_FOUND', 404));
    renderApp('/dashboard/opportunities/l1/offer', signedIn(REFURB));
    expect(await screen.findByText('Device not found')).toBeInTheDocument();
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

describe('wanted devices board', () => {
  const wanted = (over = {}) => ({ _id: 'w1', title: 'Used laptops', quantity: 2, status: 'open', refurbisher: { name: 'Green Tech' }, hasResponded: false, ...over });

  it('opens the accept page from a request', async () => {
    refurbApi.wanted.mockResolvedValue(page([wanted()]));
    renderApp('/dashboard/wanted', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'Accept request Used laptops' })).toHaveAttribute('href', '/dashboard/wanted/w1/accept');
    expect(refurbApi.wanted).toHaveBeenCalledWith(expect.objectContaining({ as: 'board' }), expect.anything());
  });

  it('shows the totals and lets people search and filter by category', async () => {
    refurbApi.wanted.mockResolvedValue({ items: [
      wanted({ _id: 'w1', title: 'Dell laptops', quantity: 10, city: 'Bengaluru', category: { name: 'Laptop' } }),
      wanted({ _id: 'w2', title: 'iPhone 8', quantity: 5, city: 'Chennai', category: { name: 'Smartphone' } }),
      wanted({ _id: 'w3', title: 'Galaxy phones', quantity: 3, city: 'Chennai', category: { name: 'Smartphone' } }),
    ], meta: { page: 1, pages: 1, total: 3, limit: 24 } });
    renderApp('/dashboard/wanted', signedIn(USER));
    await screen.findByText('Dell laptops');
    expect(screen.queryByText('Open requests')).not.toBeInTheDocument(); // no counter boxes
    expect(screen.getByText('3 requests from refurbishers')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'How it works' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Smartphone' }));
    expect(screen.queryByText('Dell laptops')).not.toBeInTheDocument();
    expect(screen.getByText('iPhone 8')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'All' }));

    fireEvent.change(screen.getByLabelText('Search requests'), { target: { value: 'galaxy' } });
    expect(screen.getByText('Galaxy phones')).toBeInTheDocument();
    expect(screen.queryByText('iPhone 8')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search requests'), { target: { value: 'zzzz' } });
    expect(screen.getByText('Nothing matches')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'clear the filters' }));
    expect(screen.getByText('Dell laptops')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'most' } });
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Dell laptops', 'iPhone 8', 'Galaxy phones']);
    fireEvent.change(screen.getByLabelText('Sort'), { target: { value: 'city' } });
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('Dell laptops');
  });

  it('shows an already accepted request as accepted', async () => {
    refurbApi.wanted.mockResolvedValue(page([wanted({ hasResponded: true })]));
    renderApp('/dashboard/wanted', signedIn(USER));
    expect(await screen.findByText('Accepted')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept request Used laptops' })).not.toBeInTheDocument();
  });
});

describe('the accept request page', () => {
  const detail = (over = {}) => ({
    _id: 'w1', title: 'Dell Latitude laptops', quantity: 10, status: 'open', brand: 'Dell', minCondition: 'minor_damage', city: 'Bengaluru',
    notes: 'We refit SSDs and batteries.', category: { name: 'Laptop' }, createdAt: '2026-11-20T10:00:00.000Z',
    refurbisher: { _id: 'r1', name: 'ReNew Electronics' }, hasResponded: false, isMine: false, ...over,
  });
  const open = async (over, who = signedIn(USER)) => {
    refurbApi.getWanted.mockResolvedValue(detail(over));
    renderApp('/dashboard/wanted/w1/accept', who);
    await screen.findByRole('heading', { level: 1, name: 'Accept this request' });
  };

  it('shows everything about the request before accepting', async () => {
    await open();
    const card = within(screen.getByRole('region', { name: 'Request details' }));
    expect(card.getByText('Dell Latitude laptops')).toBeInTheDocument();
    expect(card.getByText('10')).toBeInTheDocument();
    expect(card.getByText('Minor damage or better')).toBeInTheDocument();
    expect(card.getByText('Dell')).toBeInTheDocument();
    expect(card.getByText('Bengaluru')).toBeInTheDocument();
    expect(card.getByText('We refit SSDs and batteries.')).toBeInTheDocument();
    expect(card.getByText('ReNew Electronics')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Wanted devices/ })[0]).toHaveAttribute('href', '/dashboard/wanted');
  });

  it('accepts with the message that was typed and then says it was sent', async () => {
    refurbApi.respondWanted.mockResolvedValue({ _id: 'r1' });
    await open();
    fireEvent.change(screen.getByLabelText('Your message (optional)'), { target: { value: 'I have 3 working ones.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept this request' }));
    await waitFor(() => expect(refurbApi.respondWanted).toHaveBeenCalledWith('w1', 'I have 3 working ones.'));
    expect(await screen.findByText('You accepted this request')).toBeInTheDocument();
    expect(screen.getByText('I have 3 working ones.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open messages' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this request' })).not.toBeInTheDocument();
  });

  it('fills the message from an idea and accepts without a message when left empty', async () => {
    refurbApi.respondWanted.mockResolvedValue({ _id: 'r1' });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'I can give it for free.' }));
    expect(screen.getByLabelText('Your message (optional)')).toHaveValue('I can give it for free.');
    fireEvent.change(screen.getByLabelText('Your message (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Accept this request' }));
    await waitFor(() => expect(refurbApi.respondWanted).toHaveBeenCalledWith('w1', ''));
  });

  it('shows the reason when the server refuses', async () => {
    refurbApi.respondWanted.mockRejectedValue({ response: { status: 409, data: { message: 'You have already accepted this request', code: 'ALREADY_RESPONDED' } } });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Accept this request' }));
    expect(await screen.findByText('You have already accepted this request')).toBeInTheDocument();
  });

  it('shows an already accepted request as accepted, with the message that was sent', async () => {
    await open({ hasResponded: true, myResponse: { message: 'Happy to help', at: '2026-11-21T00:00:00.000Z' } });
    expect(screen.getByText('You accepted this request')).toBeInTheDocument();
    expect(screen.getByText('Happy to help')).toBeInTheDocument();
  });

  it('does not offer to accept a closed request or your own', async () => {
    await open({ status: 'closed' });
    expect(screen.getByText(/This request is closed/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Accept this request' })).not.toBeInTheDocument();
  });

  it('says so when the request cannot be found', async () => {
    refurbApi.getWanted.mockRejectedValue({ response: { status: 404, data: { message: 'Request not found', code: 'NOT_FOUND' } } });
    renderApp('/dashboard/wanted/w1/accept', signedIn(USER));
    expect(await screen.findByText('Request not found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to wanted devices' })).toBeInTheDocument();
  });
});

describe('the refurbisher My requests page', () => {
  const mine = (over = {}) => ({ _id: 'w1', title: 'Used laptops', quantity: 3, status: 'open', city: 'Bengaluru', category: { name: 'Laptop' }, responseCount: 0, ...over });

  it('lists the requests with their status, and has a side-menu link just below Requests', async () => {
    refurbApi.wanted.mockResolvedValue(page([mine(), mine({ _id: 'w2', title: 'Old phones', status: 'closed' })]));
    renderApp('/dashboard/my-requests', signedIn(REFURB));
    expect(await screen.findByRole('heading', { level: 1, name: 'My requests' })).toBeInTheDocument();
    expect(refurbApi.wanted).toHaveBeenCalledWith(expect.objectContaining({ as: 'mine' }), expect.anything());
    expect(await screen.findByText('Used laptops')).toBeInTheDocument();
    expect(screen.getByText('Old phones')).toBeInTheDocument();
    expect(screen.getByText('2 requests · 1 open')).toBeInTheDocument();
    const menu = within(screen.getByRole('complementary', { name: 'Dashboard navigation' })).getAllByRole('link').map((a) => a.textContent.trim());
    expect(menu.indexOf('My requests')).toBe(menu.indexOf('Requests') + 1);
  });

  it('adds a new request from the page', async () => {
    refurbApi.wanted.mockResolvedValue(page([]));
    refurbApi.addWanted.mockResolvedValue({ _id: 'w1', title: 'Used laptops', status: 'open', quantity: 3 });
    renderApp('/dashboard/my-requests', signedIn(REFURB));
    expect(await screen.findByText('You have no requests yet')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /New request/ })[0]);
    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Used laptops' } });
    fireEvent.change(screen.getByLabelText('How many?'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add request' }));
    await waitFor(() => expect(refurbApi.addWanted).toHaveBeenCalledWith({ title: 'Used laptops', quantity: 3 }));
  });

  it('edits a request in a form that starts with what it says now, and can clear a field', async () => {
    refurbApi.wanted.mockResolvedValue(page([mine({ brand: 'Dell', notes: 'Any model', minCondition: 'minor_damage' })]));
    refurbApi.updateWanted.mockResolvedValue({});
    renderApp('/dashboard/my-requests', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit request Used laptops' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Edit request');
    expect(screen.getByLabelText('What are you looking for?')).toHaveValue('Used laptops');
    expect(screen.getByLabelText('How many?')).toHaveValue(3);
    expect(screen.getByLabelText('Brand (optional)')).toHaveValue('Dell');
    fireEvent.change(screen.getByLabelText('What are you looking for?'), { target: { value: 'Used ThinkPads' } });
    fireEvent.change(screen.getByLabelText('How many?'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Brand (optional)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(refurbApi.updateWanted).toHaveBeenCalledWith('w1', expect.objectContaining({ title: 'Used ThinkPads', quantity: 8, brand: '', city: 'Bengaluru', notes: 'Any model', minCondition: 'minor_damage' })));
    expect(refurbApi.addWanted).not.toHaveBeenCalled();
  });

  it('closes, reopens and deletes a request, and shows who accepted it', async () => {
    refurbApi.wanted.mockResolvedValue(page([mine({ responseCount: 2 })]));
    refurbApi.setWantedStatus.mockResolvedValue({});
    refurbApi.deleteWanted.mockResolvedValue({});
    refurbApi.wantedResponses.mockResolvedValue([{ _id: 'r1', responder: { name: 'Asha Rao', role: 'user' }, message: 'I have two' }]);
    renderApp('/dashboard/my-requests', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: '2 accepted' }));
    expect(await screen.findByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('I have two')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(refurbApi.setWantedStatus).toHaveBeenCalledWith('w1', 'closed'));
    fireEvent.click(screen.getByRole('button', { name: 'Delete request Used laptops' }));
    await waitFor(() => expect(refurbApi.deleteWanted).toHaveBeenCalledWith('w1'));
  });

  it('is only for refurbishers', async () => {
    renderApp('/dashboard/my-requests', signedIn(USER));
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1, name: 'My requests' })).not.toBeInTheDocument());
    expect(refurbApi.wanted).not.toHaveBeenCalled();
  });
});

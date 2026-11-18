import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { categoryApi, deviceApi } from '../services/deviceApi';
import { geoApi } from '../services/geoApi';
import { _resetCategoriesCache } from '../hooks/useCategories';
import { TECH, USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/geoApi', () => ({ geoApi: { reverse: vi.fn(), search: vi.fn() } }));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const CATEGORIES = [{ slug: 'laptops', name: 'Laptops' }, { slug: 'phones', name: 'Mobile phones' }];
const listing = (over = {}) => ({
  _id: 'l1', title: 'Dell Inspiron 15', status: 'listed', isOwner: true, condition: 'fully_working', preferredService: 'reuse',
  expectedPrice: 12000, category: { slug: 'laptops', name: 'Laptops' }, brand: 'Dell', city: 'Pune', viewCount: 3, device: { photos: [] }, ...over,
});
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 12, ...meta } });
const lastListParams = () => deviceApi.list.mock.calls.at(-1)[0];

beforeEach(() => {
  vi.resetAllMocks();
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  _resetCategoriesCache();
  setAccessToken(null);
  categoryApi.list.mockResolvedValue(CATEGORIES);
  deviceApi.list.mockResolvedValue(page([]));
});

describe('Browse page', () => {
  it('lists devices with a count and links to the details page', async () => {
    deviceApi.list.mockResolvedValue(page([listing(), listing({ _id: 'l2', title: 'Samsung phone', expectedPrice: 0 })]));
    renderApp('/browse', anonymous());
    expect(await screen.findByText('2 devices found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View Dell Inspiron 15' })).toHaveAttribute('href', '/devices/l1');
    expect(screen.getByText('Free')).toBeInTheDocument();
  });

  it('uses the singular for one result', async () => {
    deviceApi.list.mockResolvedValue(page([listing()]));
    renderApp('/browse', anonymous());
    expect(await screen.findByText('1 device found')).toBeInTheDocument();
  });

  it('shows an empty state and clears filters from it', async () => {
    renderApp('/browse?category=phones', anonymous());
    expect(await screen.findByText('No devices match your search')).toBeInTheDocument();
    expect(lastListParams().category).toBe('phones');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(lastListParams().category).toBe(''));
  });

  it('shows an error with a retry that loads the list', async () => {
    deviceApi.list.mockRejectedValueOnce({ request: {} });
    renderApp('/browse', anonymous());
    expect(await screen.findByText('Could not load devices')).toBeInTheDocument();
    expect(screen.getByText(/cannot reach the server/i)).toBeInTheDocument();
    deviceApi.list.mockResolvedValue(page([listing()]));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('1 device found')).toBeInTheDocument();
  });

  it('applies dropdown filters straight away', async () => {
    renderApp('/browse', anonymous());
    await screen.findByText('No devices match your search');
    fireEvent.change(await screen.findByLabelText('Category'), { target: { value: 'laptops' } });
    await waitFor(() => expect(lastListParams().category).toBe('laptops'));
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'not_working' } });
    await waitFor(() => expect(lastListParams()).toMatchObject({ category: 'laptops', condition: 'not_working' }));
  });

  it('searches when the form is submitted and keeps the sort order out of the URL when newest', async () => {
    const { router } = renderApp('/browse', anonymous());
    await screen.findByText('No devices match your search');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'charger' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    await waitFor(() => expect(lastListParams().q).toBe('charger'));
    expect(router.state.location.search).toBe('?q=charger');
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price_asc' } });
    await waitFor(() => expect(lastListParams().sort).toBe('price_asc'));
  });

  it('rejects bad price ranges without calling the API again', async () => {
    renderApp('/browse', anonymous());
    await screen.findByText('No devices match your search');
    const calls = deviceApi.list.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Min price (₹)'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Max price (₹)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByText('Minimum price cannot be higher than the maximum.')).toBeInTheDocument();
    expect(deviceApi.list).toHaveBeenCalledTimes(calls);
    fireEvent.change(screen.getByLabelText('Min price (₹)'), { target: { value: '-1' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByText('Prices must be zero or more.')).toBeInTheDocument();
  });

  it('shows a Clear button only while a filter is active', async () => {
    renderApp('/browse', anonymous());
    await screen.findByText('No devices match your search');
    expect(screen.queryByRole('button', { name: 'Clear all filters' })).not.toBeInTheDocument();
  });

  it('shows the clear button for an active filter and uses it', async () => {
    renderApp('/browse?city=Pune', anonymous());
    fireEvent.click(await screen.findByRole('button', { name: 'Clear all filters' }));
    await waitFor(() => expect(lastListParams().city).toBe(''));
  });

  it('switches between grid and list view', async () => {
    const { router } = renderApp('/browse', anonymous());
    await screen.findByText('No devices match your search');
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'true'));
    expect(router.state.location.search).toContain('view=list');
  });

  it('moves to the last real page when the link points past the end', async () => {
    deviceApi.list.mockImplementation((params) => Promise.resolve(params.page > 2 ? page([], { total: 20, pages: 2, page: params.page }) : page([listing()], { total: 20, pages: 2, page: params.page })));
    renderApp('/browse?page=99', anonymous());
    await waitFor(() => expect(lastListParams().page).toBe(2));
    expect(await screen.findByText('20 devices found')).toBeInTheDocument();
  });
});

describe('route guards for listing pages', () => {
  it('sends visitors who are not signed in to login', async () => {
    renderApp('/list-device', anonymous());
    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
    renderApp('/dashboard/listings', anonymous());
    expect((await screen.findAllByRole('heading', { name: 'Welcome back' })).length).toBeGreaterThan(0);
  });

  it('keeps accounts that cannot list devices out', async () => {
    renderApp('/list-device', signedIn({ ...USER, role: 'recycler' }));
    expect(await screen.findByText('This area is not available for your account')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'List your device' })).not.toBeInTheDocument();
  });

  it('keeps recycling centres away from the listings dashboard', async () => {
    renderApp('/dashboard/listings', signedIn({ ...USER, role: 'recycler' }));
    expect(await screen.findByText('This area is not available for your account')).toBeInTheDocument();
  });

  it('lets users and technicians open the form', async () => {
    renderApp('/list-device', signedIn(USER));
    expect(await screen.findByRole('heading', { name: 'List your device' })).toBeInTheDocument();
    renderApp('/list-device', signedIn({ ...TECH, status: 'active' }));
    expect((await screen.findAllByRole('heading', { name: 'List your device' })).length).toBeGreaterThan(0);
  });
});

describe('listing form', () => {
  const field = (label) => screen.getByLabelText(label);
  const next = () => fireEvent.click(screen.getByRole('button', { name: /Next/ }));

  async function openForm() {
    renderApp('/list-device', signedIn(USER));
    await screen.findByRole('heading', { name: 'Tell us about the device' });
    await screen.findByRole('option', { name: 'Laptops' });
  }
  async function fillDetails() {
    fireEvent.change(field(/Device name/), { target: { value: 'Old laptop' } });
    fireEvent.change(field(/Category/), { target: { value: 'laptops' } });
    fireEvent.change(field(/Brand/), { target: { value: 'Dell' } });
    fireEvent.change(field(/^Model \*/), { target: { value: 'Inspiron 15' } });
    fireEvent.change(field(/Model year/), { target: { value: '2018' } });
    fireEvent.change(field(/Purchase year/), { target: { value: '2019' } });
  }
  const addPhoto = () => fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
  function fillPlace() {
    fireEvent.change(field(/What should happen/), { target: { value: 'refurbishment' } });
    fireEvent.change(field(/Handover/), { target: { value: 'pickup' } });
    fireEvent.change(field(/Area \/ locality/), { target: { value: 'Indiranagar' } });
    fireEvent.change(field(/^City/), { target: { value: 'Bengaluru' } });
    fireEvent.change(field(/Your phone number/), { target: { value: '98765 43210' } });
  }
  async function reachReview({ ticked = true, stopAtChecklist = false } = {}) {
    await fillDetails();
    next();
    await screen.findByRole('heading', { name: 'Condition and photos' });
    fireEvent.change(field('Condition *'), { target: { value: 'fully_working' } });
    addPhoto();
    next();
    await screen.findByRole('heading', { name: 'Service and location' });
    fillPlace();
    next();
    await screen.findByRole('heading', { name: 'Protect your data' });
    if (stopAtChecklist) return;
    if (ticked) screen.getAllByRole('checkbox').forEach((box) => fireEvent.click(box));
    next();
    await screen.findByRole('heading', { name: 'Review your listing' });
  }

  it('will not leave the first step until the name, category, brand, model and year are valid', async () => {
    await openForm();
    next();
    expect(await screen.findByText('Enter the device name (at least 3 characters)')).toBeInTheDocument();
    expect(screen.getByText('Choose a category')).toBeInTheDocument();
    expect(screen.getByText('Enter the brand (at least 2 characters)')).toBeInTheDocument();
    expect(screen.getByText(/Enter the model, for example/)).toBeInTheDocument();
    expect(screen.getByText('Enter the model year')).toBeInTheDocument();
    expect(screen.getByText('Enter the year it was bought')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tell us about the device' })).toBeInTheDocument();
  });

  it('checks the condition and the service on their own steps', async () => {
    await openForm();
    await fillDetails();
    next();
    await screen.findByRole('heading', { name: 'Condition and photos' });
    next();
    expect(await screen.findByText('Choose the condition')).toBeInTheDocument();
    expect(screen.getByText('Add at least one photo of the device.')).toBeInTheDocument();
    fireEvent.change(field('Condition *'), { target: { value: 'fully_working' } });
    next();
    await waitFor(() => expect(screen.queryByText('Choose the condition')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Condition and photos' })).toBeInTheDocument();
    addPhoto();
    next();
    await screen.findByRole('heading', { name: 'Service and location' });
    next();
    expect(await screen.findByText('Choose what should happen to this device')).toBeInTheDocument();
    expect(screen.getByText('Choose a handover option')).toBeInTheDocument();
    expect(screen.getByText('Enter the area or locality (at least 3 characters)')).toBeInTheDocument();
    expect(screen.getByText('Enter the city')).toBeInTheDocument();
    expect(screen.getAllByText('Enter a valid 10-digit mobile number').length).toBeGreaterThan(0);
    fireEvent.change(field(/Area \/ locality/), { target: { value: '12' } });
    fireEvent.change(field(/^City/), { target: { value: '560038' } });
    next();
    await waitFor(() => expect(screen.getByText('The city can only have letters')).toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Service and location' })).toBeInTheDocument();
  });

  it('validates the price and year with clear messages', async () => {
    await openForm();
    await fillDetails();
    fireEvent.change(field(/Purchase year/), { target: { value: '1800' } });
    next();
    expect(await screen.findByText(/Enter a year between 1990 and/)).toBeInTheDocument();
  });

  it('goes back a step without losing what was typed', async () => {
    await openForm();
    await fillDetails();
    next();
    await screen.findByRole('heading', { name: 'Condition and photos' });
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    expect(await screen.findByLabelText(/Device name/)).toHaveValue('Old laptop');
  });

  it('saves a draft and tells the owner', async () => {
    deviceApi.create.mockResolvedValue({ _id: 'd1', title: 'Old laptop', status: 'draft' });
    await openForm();
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect(await screen.findByText(/Old laptop.*saved as a draft/)).toBeInTheDocument();
    const [values, photos] = deviceApi.create.mock.calls[0];
    expect(values).toMatchObject({ name: 'Old laptop', category: 'laptops', condition: 'fully_working', preferredService: 'refurbishment', brand: 'Dell', city: 'Bengaluru', addressArea: 'Indiranagar', status: 'draft' });
    expect(photos).toHaveLength(1);
  });

  it('will not go past the data-protection step until all three boxes are ticked', async () => {
    deviceApi.create.mockResolvedValue({ _id: 'd1', title: 'Old laptop', status: 'listed' });
    await openForm();
    await reachReview({ ticked: false, stopAtChecklist: true });
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes).toHaveLength(3);

    next();
    expect(await screen.findByText('Please tick all three boxes to continue.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Protect your data' })).toBeInTheDocument();

    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    next();
    expect(await screen.findByText('Please tick all three boxes to continue.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Protect your data' })).toBeInTheDocument();

    fireEvent.click(boxes[2]);
    expect(screen.queryByText('Please tick all three boxes to continue.')).not.toBeInTheDocument();
    next();
    await screen.findByRole('heading', { name: 'Review your listing' });
    fireEvent.click(screen.getByRole('button', { name: 'Publish listing' }));
    await waitFor(() => expect(deviceApi.create).toHaveBeenCalled());
    expect(deviceApi.create.mock.calls[0][0]).toMatchObject({ status: 'listed' });
  });

  it('turns the draft and publish buttons off again if a box is unticked on the way back', async () => {
    await openForm();
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: /Back/ }));
    await screen.findByRole('heading', { name: 'Protect your data' });
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    next();
    expect(await screen.findByText('Please tick all three boxes to continue.')).toBeInTheDocument();
  });

  it('shows the server message when saving fails and keeps the form', async () => {
    deviceApi.create.mockRejectedValue({ response: { status: 500, data: { message: 'Upload service is down' } } });
    await openForm();
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect(await screen.findByText('Upload service is down')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Review your listing' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save as draft' })).not.toBeDisabled();
  });

  it('jumps to the step with the problem when the server rejects a field', async () => {
    deviceApi.create.mockRejectedValue({ response: { status: 422, data: { message: 'Validation failed', code: 'VALIDATION_ERROR', errors: [{ field: 'body.name', message: 'A device with this name already exists' }] } } });
    await openForm();
    await reachReview();
    fireEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    expect(await screen.findByText('A device with this name already exists')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tell us about the device' })).toBeInTheDocument();
  });
});

describe('Use my current location on the listing form', () => {
  const stepToPlace = async () => {
    renderApp('/list-device', signedIn(USER));
    await screen.findByRole('heading', { name: 'Tell us about the device' });
    await screen.findByRole('option', { name: 'Laptops' });
    fireEvent.change(screen.getByLabelText(/Device name/), { target: { value: 'Old laptop' } });
    fireEvent.change(screen.getByLabelText(/Category/), { target: { value: 'laptops' } });
    fireEvent.change(screen.getByLabelText(/Brand/), { target: { value: 'Dell' } });
    fireEvent.change(screen.getByLabelText(/^Model \*/), { target: { value: 'Inspiron 15' } });
    fireEvent.change(screen.getByLabelText(/Model year/), { target: { value: '2018' } });
    fireEvent.change(screen.getByLabelText(/Purchase year/), { target: { value: '2019' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await screen.findByRole('heading', { name: 'Condition and photos' });
    fireEvent.change(screen.getByLabelText('Condition *'), { target: { value: 'fully_working' } });
    fireEvent.change(screen.getByTestId('photo-input'), { target: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByRole('button', { name: /Next/ }));
    await screen.findByRole('heading', { name: 'Service and location' });
  };

  it('has no address search box, but has the phone number box', async () => {
    await stepToPlace();
    expect(screen.queryByText('Find your address')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Your phone number/)).toBeInTheDocument();
  });

  it('fills in the area and city from where the person is', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 12.97389, longitude: 77.64077 } }) },
    });
    geoApi.reverse.mockResolvedValue({ area: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', postcode: '560038' });
    await stepToPlace();
    fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }));
    await waitFor(() => expect(geoApi.reverse).toHaveBeenCalledWith(12.97389, 77.64077));
    await waitFor(() => expect(screen.getByLabelText(/Area \/ locality/)).toHaveValue('Indiranagar'));
    expect(screen.getByLabelText(/^City/)).toHaveValue('Bengaluru');
    expect(await screen.findByText(/Area and city are filled in/)).toBeInTheDocument();
  });

  it('keeps the location and asks for the area and city when the lookup fails', async () => {
    Object.defineProperty(global.navigator, 'geolocation', {
      configurable: true,
      value: { getCurrentPosition: (ok) => ok({ coords: { latitude: 12.9, longitude: 77.6 } }) },
    });
    geoApi.reverse.mockRejectedValue({ response: { status: 503, data: { message: 'down' } } });
    await stepToPlace();
    fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }));
    expect(await screen.findByText(/could not look up the address/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^City/)).toHaveValue('');
  });
});

describe('edit listing', () => {
  it('loads the listing, skips the checklist for a live one and saves changes', async () => {
    deviceApi.get.mockResolvedValue(listing({ description: 'Works well, battery is fine.', model: 'Inspiron 15', addressArea: 'Kothrud', city: 'Pune', agentPhone: '9876543210', pickupPreference: 'pickup', preferredService: 'repair', device: { photos: [{ url: '/a.png', publicId: 'a' }], modelYear: 2018, purchaseYear: 2019 } }));
    deviceApi.update.mockResolvedValue(listing({ title: 'Dell Inspiron 15 (new battery)' }));
    renderApp('/dashboard/listings/l1/edit', signedIn(USER));
    const name = await screen.findByLabelText(/Device name/);
    expect(name).toHaveValue('Dell Inspiron 15');
    await waitFor(() => expect(screen.getByLabelText(/Category/)).toHaveValue('laptops'));
    expect(screen.queryByText('Data protection')).not.toBeInTheDocument();
    fireEvent.change(name, { target: { value: 'Dell Inspiron 15 (new battery)' } });
    for (const heading of ['Condition and photos', 'Service and location', 'Review your listing']) {
      fireEvent.click(screen.getByRole('button', { name: /Next/ }));
      await screen.findByRole('heading', { name: heading });
    }
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(deviceApi.update).toHaveBeenCalled());
    expect(deviceApi.update.mock.calls[0][0]).toBe('l1');
    expect(deviceApi.update.mock.calls[0][1]).toMatchObject({ name: 'Dell Inspiron 15 (new battery)' });
  });

  it('shows an error when the listing cannot be loaded', async () => {
    deviceApi.get.mockRejectedValue({ response: { status: 404, data: { message: 'Listing not found' } } });
    renderApp('/dashboard/listings/missing/edit', signedIn(USER));
    expect(await screen.findByText('Listing not found')).toBeInTheDocument();
  });
});

describe('My listings', () => {
  const mine = (...items) => deviceApi.list.mockResolvedValue(page(items));

  it('shows the owner their listings with the right actions per status', async () => {
    mine(listing(), listing({ _id: 'l2', title: 'Spare charger', status: 'draft' }), listing({ _id: 'l3', title: 'Old router', status: 'in_service' }));
    renderApp('/dashboard/listings', signedIn(USER));
    expect(await screen.findByText('Dell Inspiron 15')).toBeInTheDocument();
    expect(lastListParams()).toMatchObject({ mine: 'true', status: '' });
    expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByText('This listing is part of a service and cannot be changed.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete Old router' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit Old router' })).not.toBeInTheDocument();
  });

  it('shows a friendly empty state', async () => {
    renderApp('/dashboard/listings', signedIn(USER));
    expect(await screen.findByText('You have not listed anything yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'List your first device' })).toHaveAttribute('href', '/list-device');
  });

  it('filters by status tab', async () => {
    mine(listing());
    renderApp('/dashboard/listings', signedIn(USER));
    await screen.findByText('Dell Inspiron 15');
    fireEvent.click(screen.getByRole('tab', { name: 'Drafts' }));
    await waitFor(() => expect(lastListParams().status).toBe('draft'));
  });

  it('withdraws a listing and refreshes', async () => {
    mine(listing());
    deviceApi.setStatus.mockResolvedValue(listing({ status: 'withdrawn' }));
    renderApp('/dashboard/listings', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText(/Dell Inspiron 15.*was withdrawn/)).toBeInTheDocument();
    expect(deviceApi.setStatus).toHaveBeenCalledWith('l1', 'withdrawn');
  });

  it('asks before deleting, and does nothing if cancelled', async () => {
    mine(listing());
    renderApp('/dashboard/listings', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dell Inspiron 15' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this listing?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(deviceApi.remove).not.toHaveBeenCalled();
  });

  it('deletes after confirmation', async () => {
    mine(listing());
    deviceApi.remove.mockResolvedValue({});
    renderApp('/dashboard/listings', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Dell Inspiron 15' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(/Dell Inspiron 15.*was deleted/)).toBeInTheDocument();
    expect(deviceApi.remove).toHaveBeenCalledWith('l1');
  });

  it('shows the readable reason when an action is refused', async () => {
    mine(listing());
    deviceApi.setStatus.mockRejectedValue({ response: { status: 409, data: { message: 'This listing is already part of a service', code: 'CONFLICT' } } });
    renderApp('/dashboard/listings', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
    expect(await screen.findByText('This listing is already part of a service')).toBeInTheDocument();
  });

  it('shows an error with retry when the list cannot load', async () => {
    deviceApi.list.mockRejectedValueOnce({ request: {} });
    renderApp('/dashboard/listings', signedIn(USER));
    expect(await screen.findByText('Could not load your listings')).toBeInTheDocument();
    deviceApi.list.mockResolvedValue(page([listing()]));
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Dell Inspiron 15')).toBeInTheDocument();
  });
});

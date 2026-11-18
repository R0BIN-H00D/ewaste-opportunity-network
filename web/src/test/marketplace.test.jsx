import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { categoryApi } from '../services/deviceApi';
import { marketApi, orderApi } from '../services/marketplaceApi';
import { refurbApi } from '../services/refurbishmentApi';
import { reviewApi } from '../services/repairApi';
import { _resetCategoriesCache } from '../hooks/useCategories';
import { orderLabel, orderSteps, parseSpecs, specsToText } from '../lib/marketplace';
import { USER, anonymous, renderApp, signedIn } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/marketplaceApi', () => ({
  marketApi: { list: vi.fn(), mine: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), enquire: vi.fn() },
  orderApi: { place: vi.fn(), list: vi.fn(), get: vi.fn(), setStatus: vi.fn(), cancel: vi.fn() },
}));
vi.mock('../services/refurbishmentApi', () => ({
  refurbApi: { opportunities: vi.fn(), offer: vi.fn(), jobs: vi.fn(), job: vi.fn(), decide: vi.fn(), withdraw: vi.fn(), handover: vi.fn(), confirmHandover: vi.fn(), advance: vi.fn(), addPhotos: vi.fn(), cancel: vi.fn() },
}));
vi.mock('../services/repairApi', async (importOriginal) => ({
  ...(await importOriginal()),
  reviewApi: { create: vi.fn(), list: vi.fn() },
}));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));

const REFURB = { ...USER, _id: 's1', name: 'Ravi Kumar', role: 'refurbisher' };
const page = (items, meta = {}) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 12, ...meta } });
const apiError = (message, code, status = 409) => Object.assign(new Error(message), { response: { status, data: { message, code } } });
const SELLER = { _id: 's1', name: 'Ravi Kumar', businessName: 'Ravi Works', city: 'Bengaluru', ratingAvg: 4.5, ratingCount: 2 };
const product = (over = {}) => ({
  _id: 'p1', title: 'Refurbished ThinkPad T450', brand: 'Lenovo', model: 'T450', condition: 'good', price: 15000, stock: 2, photos: [],
  category: { slug: 'laptops', name: 'Laptops' }, status: 'active', isRefurbished: true, label: 'Refurbished', seller: SELLER,
  specs: { RAM: '8 GB' }, refurbishmentInfo: 'New battery and SSD, fully tested.', ...over,
});
const order = (over = {}) => ({
  _id: 'o1', status: 'placed', viewerRole: 'buyer', actions: ['cancel'], canReview: false, reviewed: false,
  product: { _id: 'p1', title: 'Refurbished ThinkPad T450', condition: 'good', photo: null }, quantity: 1, priceAtOrder: 15000, total: 15000,
  paymentMethod: 'cod', paymentStatus: 'unpaid', buyer: { _id: 'u1', name: 'Asha Rao' }, seller: { _id: 's1', name: 'Ravi Kumar', businessName: 'Ravi Works' },
  history: [{ status: 'placed', at: '2026-11-15T07:00:00.000Z' }], createdAt: '2026-11-15T07:00:00.000Z', ...over,
});
const job = (over = {}) => ({
  _id: 'j1', status: 'ready_to_list', viewerRole: 'refurbisher', actions: ['list_product'], product: null,
  listing: { _id: 'l1', title: 'Lenovo ThinkPad T450', brand: 'Lenovo', model: 'T450', condition: 'minor_damage', category: { slug: 'laptops', name: 'Laptops' }, device: { photos: [] } },
  offer: { amount: 1500, status: 'accepted' }, owner: { _id: 'u1', name: 'Asha Rao' }, refurbisher: { _id: 's1', name: 'Ravi Kumar', businessName: 'Ravi Works' },
  beforePhotos: [], afterPhotos: [{ url: '/uploads/a.png', publicId: 'a' }], workLog: [], history: [{ status: 'offered', at: '2026-11-15T07:00:00.000Z' }],
  confirmations: {}, pickup: null, createdAt: '2026-11-15T07:00:00.000Z', ...over,
});

beforeEach(() => {
  vi.resetAllMocks();
  _resetCategoriesCache();
  setAccessToken(null);
  categoryApi.list.mockResolvedValue([{ slug: 'laptops', name: 'Laptops' }]);
  marketApi.list.mockResolvedValue(page([]));
  marketApi.mine.mockResolvedValue(page([]));
  orderApi.list.mockResolvedValue(page([]));
});

describe('marketplace helpers', () => {
  it('parses specifications written one per line', () => {
    expect(parseSpecs('RAM: 8 GB\n\nStorage: 256 GB SSD: fast')).toEqual({ specs: { RAM: '8 GB', Storage: '256 GB SSD: fast' } });
    expect(parseSpecs('RAM 8 GB').error).toMatch(/Name: value/);
    expect(parseSpecs('RAM:').error).toBeTruthy();
    expect(specsToText({ RAM: '8 GB', CPU: 'i5' })).toBe('RAM: 8 GB\nCPU: i5');
  });
  it('tracks an order and shows how far a cancelled one got', () => {
    const state = (o) => Object.fromEntries(orderSteps(o).map((s) => [s.key, s.state]));
    expect(state({ status: 'ready' })).toMatchObject({ placed: 'done', confirmed: 'done', ready: 'current', completed: 'todo' });
    expect(Object.values(state({ status: 'completed' })).every((s) => s === 'done')).toBe(true);
    expect(state({ status: 'cancelled', history: [{ status: 'placed' }, { status: 'confirmed' }, { status: 'cancelled' }] })).toMatchObject({ confirmed: 'done', ready: 'todo' });
    expect(orderLabel('delivered')).toBe('Handed over');
  });
});

describe('public marketplace', () => {
  it('lists products with the Refurbished label, condition, price and seller', async () => {
    marketApi.list.mockResolvedValue(page([product()]));
    renderApp('/marketplace', anonymous());
    expect(await screen.findByRole('link', { name: 'View Refurbished ThinkPad T450' })).toHaveAttribute('href', '/marketplace/p1');
    const card = within(screen.getByRole('article'));
    expect(card.getByText('Refurbished')).toBeInTheDocument();
    expect(card.getByText('Good')).toBeInTheDocument();
    expect(card.getByText('₹15,000')).toBeInTheDocument();
    expect(card.getByText(/Ravi Works, Bengaluru/)).toBeInTheDocument();
    expect(screen.getByText('1 product found')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /donation marketplace/ })).toHaveAttribute('href', '/donations');
  });

  it('filters by condition and sorts through the API', async () => {
    marketApi.list.mockResolvedValue(page([product()]));
    renderApp('/marketplace', anonymous());
    await screen.findByRole('article');
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'like_new' } });
    await waitFor(() => expect(marketApi.list.mock.calls.at(-1)[0]).toMatchObject({ condition: 'like_new' }));
    fireEvent.change(screen.getByLabelText('Sort by'), { target: { value: 'price_asc' } });
    await waitFor(() => expect(marketApi.list.mock.calls.at(-1)[0]).toMatchObject({ condition: 'like_new', sort: 'price_asc' }));
  });

  it('searches by keyword and price range', async () => {
    renderApp('/marketplace', anonymous());
    await screen.findByText('No refurbished products yet');
    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'dell' } });
    fireEvent.change(screen.getByLabelText('Lowest price (₹)'), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText('Highest price (₹)'), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(marketApi.list.mock.calls.at(-1)[0]).toMatchObject({ q: 'dell', minPrice: '5000', maxPrice: '20000' }));
  });

  it('rejects a reversed price range without calling the API again', async () => {
    renderApp('/marketplace', anonymous());
    await screen.findByText('No refurbished products yet');
    const calls = marketApi.list.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Lowest price (₹)'), { target: { value: '500' } });
    fireEvent.change(screen.getByLabelText('Highest price (₹)'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('The lowest price is above the highest price.')).toBeInTheDocument();
    expect(marketApi.list.mock.calls.length).toBe(calls);
  });

  it('shows a helpful empty state with a way back when filters match nothing', async () => {
    renderApp('/marketplace?q=zzz', anonymous());
    expect(await screen.findByText('No products match your search')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(marketApi.list.mock.calls.at(-1)[0].q).toBeFalsy()); // empty filters are dropped by the API layer
  });

  it('shows a retryable error when the marketplace cannot load', async () => {
    marketApi.list.mockRejectedValueOnce(apiError('Server error', 'SERVER_ERROR', 500));
    marketApi.list.mockResolvedValue(page([product()]));
    renderApp('/marketplace', anonymous());
    expect(await screen.findByText('Could not load the marketplace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(await screen.findByRole('article')).toBeInTheDocument();
  });
});

describe('the marketplace inside the dashboard', () => {
  const sidebar = () => screen.getByRole('complementary', { name: 'Dashboard navigation' });

  it('keeps the side panel on the list and on a product, and links stay inside the dashboard', async () => {
    marketApi.list.mockResolvedValue(page([product()]));
    marketApi.get.mockResolvedValue(product());
    renderApp('/dashboard/marketplace', signedIn(USER));
    const card = await screen.findByRole('link', { name: 'View Refurbished ThinkPad T450' });
    expect(sidebar()).toBeInTheDocument();
    expect(card).toHaveAttribute('href', '/dashboard/marketplace/p1');
    fireEvent.click(card);
    await screen.findByRole('button', { name: 'Order this device' });
    expect(sidebar()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Marketplace/, current: false, hidden: false })).toBeTruthy();
  });

  it('still shows the plain public page, without the side panel, to visitors', async () => {
    marketApi.list.mockResolvedValue(page([product()]));
    renderApp('/marketplace', anonymous());
    expect(await screen.findByRole('link', { name: 'View Refurbished ThinkPad T450' })).toHaveAttribute('href', '/marketplace/p1');
    expect(screen.queryByRole('complementary', { name: 'Dashboard navigation' })).not.toBeInTheDocument();
  });
});

describe('product page', () => {
  it('shows the label, condition, what was done, specifications and the seller', async () => {
    marketApi.get.mockResolvedValue(product());
    renderApp('/marketplace/p1', anonymous());
    expect(await screen.findByRole('heading', { level: 1, name: 'Refurbished ThinkPad T450' })).toBeInTheDocument();
    expect(screen.getAllByText('Refurbished').length).toBeGreaterThan(0);
    expect(screen.getByText('Good')).toBeInTheDocument();
    expect(screen.getByText('New battery and SSD, fully tested.')).toBeInTheDocument();
    expect(screen.getByText('RAM')).toBeInTheDocument();
    expect(screen.getByText('8 GB')).toBeInTheDocument();
    expect(screen.getByText(/Ravi Works, Bengaluru/)).toBeInTheDocument();
    expect(screen.getByText('2 in stock')).toBeInTheDocument();
  });

  it('asks visitors to log in before ordering or asking a question', async () => {
    marketApi.get.mockResolvedValue(product());
    renderApp('/marketplace/p1', anonymous());
    expect(await screen.findByRole('link', { name: 'Log in to order or ask a question' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('button', { name: 'Order this device' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Ask the seller a question' })).not.toBeInTheDocument();
  });

  it('checks the quantity, places the order and opens it', async () => {
    marketApi.get.mockResolvedValue(product());
    orderApi.place.mockResolvedValue(order());
    orderApi.get.mockResolvedValue(order());
    renderApp('/marketplace/p1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Order this device' }));
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Choose a quantity between 1 and 2.')).toBeInTheDocument();
    expect(orderApi.place).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    expect(screen.getByText('Total: ₹30,000')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Pay the seller directly'));
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Enter the area or locality to deliver to.')).toBeInTheDocument();
    expect(screen.getByText('Enter the city (letters only).')).toBeInTheDocument();
    expect(screen.getByText('Enter a valid 6-digit pincode.')).toBeInTheDocument();
    expect(orderApi.place).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Area or locality'), { target: { value: 'Indiranagar' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Bengaluru' } });
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '56003' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('Enter a valid 6-digit pincode.')).toBeInTheDocument();
    expect(orderApi.place).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '560038' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    await waitFor(() => expect(orderApi.place).toHaveBeenCalledWith({ productId: 'p1', quantity: 2, paymentMethod: 'offline', deliveryArea: 'Indiranagar', deliveryCity: 'Bengaluru', deliveryPincode: '560038' }));
    expect(await screen.findByText('Your order was placed. The seller will confirm it soon.')).toBeInTheDocument();
  });

  it('shows the reason when an order is refused', async () => {
    marketApi.get.mockResolvedValue(product());
    orderApi.place.mockRejectedValue(apiError('You already have an open order for this product', 'ALREADY_ORDERED'));
    renderApp('/marketplace/p1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Order this device' }));
    fireEvent.change(screen.getByLabelText('Area or locality'), { target: { value: 'Indiranagar' } });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Bengaluru' } });
    fireEvent.change(screen.getByLabelText('Pincode'), { target: { value: '560038' } });
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));
    expect(await screen.findByText('You already have an open order for this product')).toBeInTheDocument();
  });

  it('sends a question to the seller', async () => {
    marketApi.get.mockResolvedValue(product());
    marketApi.enquire.mockResolvedValue({ sent: true });
    renderApp('/marketplace/p1', signedIn(USER));
    const box = await screen.findByRole('textbox', { name: 'Ask the seller a question' });
    fireEvent.change(box, { target: { value: 'hi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    expect(await screen.findByText('Write a short question for the seller.')).toBeInTheDocument();
    expect(marketApi.enquire).not.toHaveBeenCalled();
    fireEvent.change(box, { target: { value: 'Does it come with a charger?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send question' }));
    await waitFor(() => expect(marketApi.enquire).toHaveBeenCalledWith('p1', 'Does it come with a charger?'));
    expect(await screen.findByText(/Your question was sent to the seller/)).toBeInTheDocument();
  });

  it('lets sellers edit their own product instead of ordering it', async () => {
    marketApi.get.mockResolvedValue(product({ isMine: true }));
    renderApp('/marketplace/p1', signedIn(REFURB));
    expect(await screen.findByRole('link', { name: 'Edit it' })).toHaveAttribute('href', '/dashboard/products/p1/edit');
    expect(screen.queryByRole('button', { name: 'Order this device' })).not.toBeInTheDocument();
  });

  it('says so when the product is sold, and when it does not exist', async () => {
    marketApi.get.mockResolvedValue(product({ status: 'sold', stock: 0 }));
    renderApp('/marketplace/p1', signedIn(USER));
    expect(await screen.findByText('This product is no longer available.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Order this device' })).not.toBeInTheDocument();
  });

  it('reports an unknown product as not found', async () => {
    marketApi.get.mockRejectedValue(apiError('Product not found', 'NOT_FOUND', 404));
    renderApp('/marketplace/nope', anonymous());
    expect(await screen.findByText('Product not found')).toBeInTheDocument();
  });
});

describe('my products', () => {
  it('is for refurbishers only', async () => {
    renderApp('/dashboard/products', signedIn(USER));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'My products' })).not.toBeInTheDocument());
    expect(marketApi.mine).not.toHaveBeenCalled();
  });

  it('lists products, hides one and shows it again', async () => {
    marketApi.mine.mockResolvedValue(page([product()]));
    marketApi.update.mockResolvedValue(product({ status: 'hidden' }));
    renderApp('/dashboard/products', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Hide Refurbished ThinkPad T450' }));
    await waitFor(() => expect(marketApi.update).toHaveBeenCalled());
    const [id, form] = marketApi.update.mock.calls[0];
    expect(id).toBe('p1');
    expect(form.get('status')).toBe('hidden');
    expect(await screen.findByText('The product is hidden from the marketplace.')).toBeInTheDocument();
    expect(marketApi.mine.mock.calls.length).toBeGreaterThan(1); // reloaded
  });

  it('filters by status', async () => {
    renderApp('/dashboard/products', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('tab', { name: 'Hidden' }));
    await waitFor(() => expect(marketApi.mine.mock.calls.at(-1)[0]).toMatchObject({ status: 'hidden' }));
  });

  it('asks before removing a product and shows why it cannot be removed', async () => {
    marketApi.mine.mockResolvedValue(page([product()]));
    marketApi.remove.mockRejectedValue(apiError('Finish or cancel the open orders for this product first', 'HAS_OPEN_ORDERS'));
    renderApp('/dashboard/products', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Refurbished ThinkPad T450' }));
    expect(marketApi.remove).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Remove product' }));
    expect(await screen.findByText('Finish or cancel the open orders for this product first')).toBeInTheDocument();
  });

  it('has a friendly empty state', async () => {
    renderApp('/dashboard/products', signedIn(REFURB));
    expect(await screen.findByText('You have no products yet')).toBeInTheDocument();
  });
});

describe('product form', () => {
  it('checks the required fields before sending anything', async () => {
    renderApp('/dashboard/products/new', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'List this product' }));
    expect(await screen.findByText('Enter a title of at least 3 characters.')).toBeInTheDocument();
    expect(screen.getByText('Choose a category.')).toBeInTheDocument();
    expect(screen.getByText('Choose the condition. Buyers always see it.')).toBeInTheDocument();
    expect(screen.getByText(/Say what was repaired, replaced or tested/)).toBeInTheDocument();
    expect(screen.getByText('Enter a price of 0 or more.')).toBeInTheDocument();
    expect(screen.getByText('Add at least one photo of the product.')).toBeInTheDocument();
    expect(marketApi.create).not.toHaveBeenCalled();
  });

  it('lists a finished job: prefills from it, needs no new photo and sends the job id', async () => {
    refurbApi.job.mockResolvedValue(job());
    marketApi.create.mockResolvedValue(product());
    renderApp('/dashboard/products/new?job=j1', signedIn(REFURB));
    expect(await screen.findByLabelText('Title')).toHaveValue('Lenovo ThinkPad T450');
    await screen.findByRole('option', { name: 'Laptops' });
    expect(screen.getByLabelText('Category')).toHaveValue('laptops');
    expect(screen.queryByLabelText('Stock')).not.toBeInTheDocument(); // one device, one item

    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'good' } });
    fireEvent.change(screen.getByLabelText('What was done to it'), { target: { value: 'New battery and a fresh SSD.' } });
    fireEvent.change(screen.getByLabelText('Price (₹)'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: 'List this product' }));
    await waitFor(() => expect(marketApi.create).toHaveBeenCalled());
    const form = marketApi.create.mock.calls[0][0];
    expect(form.get('jobId')).toBe('j1');
    expect(form.get('condition')).toBe('good');
    expect(form.get('price')).toBe('15000');
    expect(form.get('category')).toBe('laptops');
    expect(form.has('stock')).toBe(false);
    expect(await screen.findByText('Your product is now on the marketplace.')).toBeInTheDocument();
  });

  it('will not list a job that is not ready', async () => {
    refurbApi.job.mockResolvedValue(job({ status: 'testing', actions: ['advance'] }));
    renderApp('/dashboard/products/new?job=j1', signedIn(REFURB));
    expect(await screen.findByText(/This job is not ready to list yet/)).toBeInTheDocument();
  });

  it('shows the server reason when listing is refused', async () => {
    refurbApi.job.mockResolvedValue(job());
    marketApi.create.mockRejectedValue(apiError('Only a job that is ready to list can be listed', 'JOB_NOT_READY'));
    renderApp('/dashboard/products/new?job=j1', signedIn(REFURB));
    await screen.findByRole('option', { name: 'Laptops' });
    fireEvent.change(await screen.findByLabelText('Condition'), { target: { value: 'good' } });
    fireEvent.change(screen.getByLabelText('What was done to it'), { target: { value: 'New battery and a fresh SSD.' } });
    fireEvent.change(screen.getByLabelText('Price (₹)'), { target: { value: '15000' } });
    fireEvent.click(screen.getByRole('button', { name: 'List this product' }));
    expect(await screen.findByText('Only a job that is ready to list can be listed')).toBeInTheDocument();
  });

  it('edits a product, checks the specifications and saves the changes', async () => {
    marketApi.get.mockResolvedValue(product({ isMine: true, photos: [{ url: '/uploads/p.png', publicId: 'p' }] }));
    marketApi.update.mockResolvedValue(product({ status: 'hidden', price: 14000 }));
    renderApp('/dashboard/products/p1/edit', signedIn(REFURB));
    expect(await screen.findByLabelText('Title')).toHaveValue('Refurbished ThinkPad T450');
    expect(screen.getByLabelText('Specifications (optional)')).toHaveValue('RAM: 8 GB');

    fireEvent.change(screen.getByLabelText('Specifications (optional)'), { target: { value: 'RAM 8 GB' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText(/Write each specification as/)).toBeInTheDocument();
    expect(marketApi.update).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Specifications (optional)'), { target: { value: 'RAM: 16 GB' } });
    fireEvent.change(screen.getByLabelText('Price (₹)'), { target: { value: '14000' } });
    fireEvent.change(screen.getByLabelText('Visibility'), { target: { value: 'hidden' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(marketApi.update).toHaveBeenCalled());
    const [id, form] = marketApi.update.mock.calls[0];
    expect(id).toBe('p1');
    expect(form.get('price')).toBe('14000');
    expect(form.get('status')).toBe('hidden');
    expect(form.get('stock')).toBe('2');
    expect(JSON.parse(form.get('specs'))).toEqual({ RAM: '16 GB' });
    expect(await screen.findByText('Your changes were saved.')).toBeInTheDocument();
  });
});

describe('refurbishment job page', () => {
  it('offers to list a finished job as a product', async () => {
    refurbApi.job.mockResolvedValue(job());
    renderApp('/dashboard/refurbishment/j1', signedIn(REFURB));
    expect(await screen.findByRole('link', { name: 'List as a product' })).toHaveAttribute('href', '/dashboard/products/new?job=j1');
  });

  it('tells the owner their device is on sale again once it is listed', async () => {
    refurbApi.job.mockResolvedValue(job({ status: 'listed', viewerRole: 'owner', actions: [], product: 'p1' }));
    renderApp('/dashboard/refurbishment/j1', signedIn(USER));
    expect(await screen.findByText(/Your device was refurbished and is on sale again/)).toBeInTheDocument();
  });
});

describe('orders list', () => {
  it('shows buyers their purchases', async () => {
    orderApi.list.mockResolvedValue(page([order()]));
    renderApp('/dashboard/orders', signedIn(USER));
    expect(await screen.findByRole('link', { name: 'View order for Refurbished ThinkPad T450' })).toHaveAttribute('href', '/dashboard/orders/o1');
    expect(screen.getByText(/Seller Ravi Works/)).toBeInTheDocument();
    expect(orderApi.list.mock.calls.at(-1)[0]).toMatchObject({ as: 'buyer' });
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
  });

  it('lets a refurbisher switch between orders received and their own purchases', async () => {
    orderApi.list.mockResolvedValue(page([order({ viewerRole: 'seller' })]));
    renderApp('/dashboard/orders', signedIn(REFURB));
    expect(await screen.findByText(/Buyer Asha Rao/)).toBeInTheDocument();
    expect(orderApi.list.mock.calls.at(-1)[0]).toMatchObject({ as: 'seller' });
    fireEvent.click(screen.getByRole('tab', { name: 'My purchases' }));
    await waitFor(() => expect(orderApi.list.mock.calls.at(-1)[0]).toMatchObject({ as: 'buyer' }));
  });

  it('has friendly empty states', async () => {
    renderApp('/dashboard/orders', signedIn(USER));
    expect(await screen.findByText('You have not ordered anything yet')).toBeInTheDocument();
  });
});

describe('order page', () => {
  it('lets the seller confirm and then mark the order ready', async () => {
    orderApi.get.mockResolvedValue(order({ viewerRole: 'seller', actions: ['confirm', 'cancel'] }));
    orderApi.setStatus.mockResolvedValue(order({ viewerRole: 'seller', status: 'confirmed', actions: ['mark_ready', 'cancel'] }));
    renderApp('/dashboard/orders/o1', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm the order' }));
    await waitFor(() => expect(orderApi.setStatus).toHaveBeenCalledWith('o1', 'confirmed'));
    expect(await screen.findByRole('button', { name: 'Mark ready' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm the order' })).not.toBeInTheDocument();
  });

  it('shows the seller the buyer and the delivery area only, with a note about payment', async () => {
    orderApi.get.mockResolvedValue(order({ viewerRole: 'seller', actions: [], deliveryArea: 'Indiranagar', notes: 'Evenings please', paymentMethod: 'cod' }));
    renderApp('/dashboard/orders/o1', signedIn(REFURB));
    expect(await screen.findByText('Buyer: Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('Indiranagar')).toBeInTheDocument();
    expect(screen.getByText(/Cash on delivery \(not paid yet\)/)).toBeInTheDocument();
    expect(screen.getByText(/The platform only keeps a record/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Refurbished ThinkPad T450' })).toHaveAttribute('href', '/dashboard/marketplace/p1');
  });

  it('tells the seller the order is waiting for the buyer after handover', async () => {
    orderApi.get.mockResolvedValue(order({ viewerRole: 'seller', status: 'delivered', actions: [] }));
    renderApp('/dashboard/orders/o1', signedIn(REFURB));
    expect(await screen.findByText(/Waiting for the buyer to confirm they received it/)).toBeInTheDocument();
  });

  it('lets the buyer confirm receipt, then review the seller', async () => {
    orderApi.get.mockResolvedValue(order({ status: 'delivered', actions: ['complete'] }));
    orderApi.setStatus.mockResolvedValue(order({ status: 'completed', actions: [], paymentStatus: 'paid_offline', canReview: true }));
    renderApp('/dashboard/orders/o1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'I received it' }));
    await waitFor(() => expect(orderApi.setStatus).toHaveBeenCalledWith('o1', 'completed'));
    fireEvent.click(await screen.findByRole('button', { name: 'Review the seller' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Submit review' }));
    expect(await screen.findByText('Choose a star rating.')).toBeInTheDocument();
    expect(reviewApi.create).not.toHaveBeenCalled();

    orderApi.get.mockResolvedValue(order({ status: 'completed', actions: [], reviewed: true, canReview: false }));
    reviewApi.create.mockResolvedValue({ _id: 'r1' });
    fireEvent.click(within(screen.getByRole('group', { name: /Overall rating/ })).getByRole('radio', { name: '5 stars' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit review' }));
    await waitFor(() => expect(reviewApi.create).toHaveBeenCalledWith({ contextType: 'order', contextId: 'o1', rating: 5 }));
    expect(await screen.findByText('You reviewed this seller. Thank you.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review the seller' })).not.toBeInTheDocument();
  });

  it('cancels with an optional reason after confirming', async () => {
    orderApi.get.mockResolvedValue(order());
    orderApi.cancel.mockResolvedValue(order({ status: 'cancelled', actions: [], cancelReason: 'Changed my mind' }));
    renderApp('/dashboard/orders/o1', signedIn(USER));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel this order' }));
    expect(orderApi.cancel).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByLabelText('Reason (optional)'), { target: { value: 'Changed my mind' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel order' }));
    await waitFor(() => expect(orderApi.cancel).toHaveBeenCalledWith('o1', 'Changed my mind'));
    expect(await screen.findByText('Cancelled: Changed my mind')).toBeInTheDocument();
  });

  it('shows the server reason when a step is refused', async () => {
    orderApi.get.mockResolvedValue(order({ viewerRole: 'seller', actions: ['confirm'] }));
    orderApi.setStatus.mockRejectedValue(apiError('This product is not on sale or has too little stock to confirm this order', 'OUT_OF_STOCK'));
    renderApp('/dashboard/orders/o1', signedIn(REFURB));
    fireEvent.click(await screen.findByRole('button', { name: 'Confirm the order' }));
    expect(await screen.findByText(/too little stock to confirm/)).toBeInTheDocument();
  });

  it('offers nothing to do once an order is finished', async () => {
    orderApi.get.mockResolvedValue(order({ status: 'completed', actions: [], paymentStatus: 'paid_offline' }));
    renderApp('/dashboard/orders/o1', signedIn(USER));
    expect(await screen.findByText(/Cash on delivery \(paid, recorded\)/)).toBeInTheDocument();
    expect(screen.queryByText('What to do next')).not.toBeInTheDocument();
  });

  it('reports an order that is not theirs as not found', async () => {
    orderApi.get.mockRejectedValue(apiError('Order not found', 'NOT_FOUND', 404));
    renderApp('/dashboard/orders/o9', signedIn(USER));
    expect(await screen.findByText('Order not found')).toBeInTheDocument();
  });
});

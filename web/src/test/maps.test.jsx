import { fireEvent, screen, within } from '@testing-library/react';
import { setAccessToken } from '../services/api';
import { categoryApi, deviceApi } from '../services/deviceApi';
import { centerApi } from '../services/recyclingApi';
import { _resetCategoriesCache } from '../hooks/useCategories';
import { centerMarkers, listingMarkers, toLatLng, unplaced } from '../lib/maps';
import { anonymous, renderApp } from './helpers';

vi.mock('../services/authApi', () => ({ authApi: { me: vi.fn(), resendVerification: vi.fn() }, userApi: {}, verificationApi: {} }));
vi.mock('../services/deviceApi', () => ({
  categoryApi: { list: vi.fn() },
  deviceApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), setStatus: vi.fn(), remove: vi.fn() },
  reportApi: { create: vi.fn() },
}));
vi.mock('../services/recyclingApi', () => ({ centerApi: { list: vi.fn(), get: vi.fn() }, recyclingApi: {} }));
vi.mock('../services/api', async (importOriginal) => ({
  ...(await importOriginal()),
  getHealth: () => Promise.resolve({ success: true, data: { db: 'connected' } }),
}));
// The real map needs a browser to draw in; what matters here is which pins the pages hand to it.
vi.mock('../components/maps/MapView', () => ({
  default: ({ markers, label }) => (
    <div role="region" aria-label={label}>{markers.map((m) => <span key={m.id} data-testid="pin" data-position={m.position.join(',')} data-to={m.to}>{m.title}</span>)}</div>
  ),
}));

const page = (items) => ({ items, meta: { total: items.length, page: 1, pages: 1, limit: 12 } });
const listing = (over = {}) => ({
  _id: 'l1', title: 'Dell Inspiron 15', status: 'listed', isOwner: false, condition: 'fully_working', preferredService: 'reuse', expectedPrice: 1,
  category: { slug: 'laptops', name: 'Laptops' }, brand: 'Dell', city: 'Bengaluru', addressArea: 'Indiranagar', device: { photos: [] },
  publicLocation: { type: 'Point', coordinates: [77.6412, 12.9716] }, ...over,
});
const centre = (over = {}) => ({ _id: 'c1', name: 'GreenCycle', city: 'Bengaluru', authorized: true, acceptedCategories: [], location: { type: 'Point', coordinates: [77.62, 12.95] }, ratingAvg: 0, ratingCount: 0, ...over });

beforeEach(() => {
  vi.resetAllMocks();
  _resetCategoriesCache();
  setAccessToken(null);
  categoryApi.list.mockResolvedValue([{ slug: 'laptops', name: 'Laptops' }]);
  deviceApi.list.mockResolvedValue(page([]));
  centerApi.list.mockResolvedValue(page([]));
});

describe('map helpers', () => {
  it('turns a GeoJSON point into a Leaflet position, and refuses anything that is not a point', () => {
    expect(toLatLng({ type: 'Point', coordinates: [77.6, 12.9] })).toEqual([12.9, 77.6]);
    for (const bad of [null, undefined, {}, { coordinates: [1] }, { coordinates: ['a', 'b'] }, { coordinates: [200, 10] }, { coordinates: [10, 95] }, { coordinates: [1, 2, 3] }]) expect(toLatLng(bad)).toBeNull();
  });

  it('marks listings by their PUBLIC location only, never the exact one', () => {
    const exact = { type: 'Point', coordinates: [77.5946, 12.9716] };
    const fuzzed = { type: 'Point', coordinates: [77.6012, 12.9744] };
    const [m] = listingMarkers([listing({ location: exact, publicLocation: fuzzed })]);
    expect(m.position).toEqual([12.9744, 77.6012]);
    expect(m).toMatchObject({ id: 'l1', title: 'Dell Inspiron 15', subtitle: 'Indiranagar, Bengaluru', to: '/devices/l1' });
    expect(listingMarkers([listing({ location: exact, publicLocation: undefined })])).toEqual([]); // no public point: not placed, and the exact one is not used instead
  });

  it('marks centres by their published location, and counts what could not be placed', () => {
    const markers = centerMarkers([centre(), centre({ _id: 'c2', location: undefined })]);
    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ id: 'c1', to: '/recycling-centers/c1', position: [12.95, 77.62] });
    expect(unplaced([1, 2, 3], [1])).toBe(2);
    expect(unplaced([], [])).toBe(0);
  });
});

describe('Browse devices on a map', () => {
  it('offers a map view alongside grid and list, and starts on the grid', async () => {
    deviceApi.list.mockResolvedValue(page([listing()]));
    renderApp('/browse', anonymous());
    await screen.findByText('1 device found');
    expect(screen.getByRole('button', { name: 'Map view' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('region', { name: /Map of the devices/ })).not.toBeInTheDocument();
  });

  it('shows a pin for each device with an approximate place, says how many have none, and keeps the list', async () => {
    deviceApi.list.mockResolvedValue(page([listing(), listing({ _id: 'l2', title: 'No place', publicLocation: undefined })]));
    renderApp('/browse?view=map', anonymous());
    const map = await screen.findByRole('region', { name: 'Map of the devices on this page' });
    const pins = within(map).getAllByTestId('pin');
    expect(pins).toHaveLength(1);
    expect(pins[0]).toHaveAttribute('data-position', '12.9716,77.6412');
    expect(pins[0]).toHaveAttribute('data-to', '/devices/l1');
    expect(screen.getByText(/never the exact address/)).toBeInTheDocument();
    expect(screen.getByText(/1 of these has no location and is only in the list below/)).toBeInTheDocument();
    const list = screen.getByRole('list', { name: 'Devices on the map' });
    expect(within(list).getByRole('link', { name: 'Dell Inspiron 15' })).toHaveAttribute('href', '/devices/l1');
    expect(within(list).getByRole('link', { name: 'No place' })).toBeInTheDocument();
  });

  it('switches to the map and back, keeping the search', async () => {
    deviceApi.list.mockResolvedValue(page([listing()]));
    const { router } = renderApp('/browse?q=dell', anonymous());
    await screen.findByText('1 device found');
    fireEvent.click(screen.getByRole('button', { name: 'Map view' }));
    expect(await screen.findByRole('region', { name: /Map of the devices/ })).toBeInTheDocument();
    expect(router.state.location.search).toContain('view=map');
    expect(router.state.location.search).toContain('q=dell');
    fireEvent.click(screen.getByRole('button', { name: 'Grid view' }));
    expect(screen.queryByRole('region', { name: /Map of the devices/ })).not.toBeInTheDocument();
    expect(router.state.location.search).not.toContain('view=');
  });
});

describe('Recycling centres on a map', () => {
  it('starts as a list and shows the centres on a map on request', async () => {
    centerApi.list.mockResolvedValue(page([centre(), centre({ _id: 'c2', name: 'No address yet', location: undefined })]));
    const { router } = renderApp('/recycling-centers', anonymous());
    await screen.findByText('2 centres found');
    expect(screen.queryByRole('region', { name: 'Map of recycling centres' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Map view' }));
    const map = await screen.findByRole('region', { name: 'Map of recycling centres' });
    expect(within(map).getAllByTestId('pin')).toHaveLength(1);
    expect(within(map).getByTestId('pin')).toHaveAttribute('data-to', '/recycling-centers/c1');
    expect(screen.getByText(/1 of these has no map location and is only in the list below/)).toBeInTheDocument();
    expect(screen.getByText('No address yet')).toBeInTheDocument(); // the list stays under the map
    expect(router.state.location.search).toContain('view=map');
  });

  it('keeps the map when searching and paging, and drops it when asked for the list', async () => {
    centerApi.list.mockResolvedValue(page([centre()]));
    const { router } = renderApp('/recycling-centers?view=map&city=Pune', anonymous());
    await screen.findByRole('region', { name: 'Map of recycling centres' });
    fireEvent.change(screen.getByLabelText('City'), { target: { value: 'Mumbai' } });
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(router.state.location.search).toContain('view=map');
    expect(router.state.location.search).toContain('city=Mumbai');
    fireEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(router.state.location.search).not.toContain('view=');
    expect(router.state.location.search).toContain('city=Mumbai');
  });
});
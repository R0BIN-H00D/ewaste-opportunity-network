import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AddressSearch from '../components/devices/AddressSearch';
import { geoApi } from '../services/geoApi';

vi.mock('../services/geoApi', () => ({ geoApi: { search: vi.fn() } }));

const place = (over = {}) => ({ label: 'Indiranagar, Bengaluru, Karnataka, India', lat: 12.9716, lng: 77.64123, area: 'Indiranagar', city: 'Bengaluru', state: 'Karnataka', postcode: '560038', ...over });
const type = (text) => fireEvent.change(screen.getByLabelText('Address, area or landmark'), { target: { value: text } });
const apiError = (message, status = 503) => Object.assign(new Error(message), { response: { status, data: { message, code: 'GEOCODER_UNAVAILABLE' } } });

beforeEach(() => vi.clearAllMocks());

describe('AddressSearch', () => {
  it('searches what was typed and hands back the area, city and point of the place that is chosen', async () => {
    geoApi.search.mockResolvedValue([place(), place({ label: 'Another place', lat: 13, lng: 77.5, area: '', city: 'Hosur' })]);
    const onPick = vi.fn();
    render(<AddressSearch onPick={onPick} />);
    type('  12 MG Road  ');
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    const list = await screen.findByRole('list', { name: 'Places found' });
    expect(geoApi.search).toHaveBeenCalledWith('12 MG Road');
    expect(within(list).getAllByRole('button')).toHaveLength(2);
    fireEvent.click(within(list).getByRole('button', { name: /Indiranagar, Bengaluru/ }));
    expect(onPick).toHaveBeenCalledWith({ area: 'Indiranagar', city: 'Bengaluru', lat: 12.9716, lng: 77.64123 });
    expect(screen.queryByRole('list', { name: 'Places found' })).not.toBeInTheDocument();
  });

  it('works with the Enter key too, and asks for more characters first', async () => {
    geoApi.search.mockResolvedValue([]);
    render(<AddressSearch onPick={vi.fn()} />);
    type('ab');
    fireEvent.submit(screen.getByRole('button', { name: /Search/ }).closest('form'));
    expect(screen.getByText('Type at least 3 characters of the address.')).toBeInTheDocument();
    expect(geoApi.search).not.toHaveBeenCalled();
    type('abc road');
    fireEvent.submit(screen.getByRole('button', { name: /Search/ }).closest('form'));
    await waitFor(() => expect(geoApi.search).toHaveBeenCalledTimes(1));
  });

  it('says so when nothing matches, and points to typing the area and city', async () => {
    geoApi.search.mockResolvedValue([]);
    render(<AddressSearch onPick={vi.fn()} />);
    type('nowhere at all');
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByText(/Nothing found/)).toBeInTheDocument();
  });

  it('shows the server\'s message when the service is unavailable, and can be tried again', async () => {
    geoApi.search.mockRejectedValueOnce(apiError('Address search is unavailable right now. Please enter the area and city yourself.')).mockResolvedValueOnce([place()]);
    render(<AddressSearch onPick={vi.fn()} />);
    type('12 MG Road');
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByText(/enter the area and city yourself/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search/ })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: /Search/ }));
    expect(await screen.findByRole('list', { name: 'Places found' })).toBeInTheDocument();
    expect(screen.queryByText(/enter the area and city yourself/)).not.toBeInTheDocument();
  });

  it('credits the map data', () => {
    render(<AddressSearch onPick={vi.fn()} />);
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();
  });
});
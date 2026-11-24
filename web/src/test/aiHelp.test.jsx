import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AiAssist from '../components/devices/AiAssist';
import SmartMatches from '../components/devices/SmartMatches';
import { aiApi, matchApi } from '../services/aiApi';
import { technicianApi } from '../services/repairApi';

vi.mock('../services/aiApi', () => ({
  aiApi: { status: vi.fn(), analyzeDevice: vi.fn(), advice: vi.fn() },
  matchApi: { forListing: vi.fn() },
}));
vi.mock('../services/repairApi', () => ({ technicianApi: { recommendations: vi.fn() } }));

const result = (over = {}) => ({
  source: 'ai',
  title: 'Dell Inspiron 15 laptop',
  category: { slug: 'laptop', name: 'Laptop' },
  brand: 'Dell',
  model: 'Inspiron 15',
  condition: 'major_damage',
  problems: ['Cracked screen'],
  advice: { recommendation: 'repair', alternatives: ['refurbishment'], reasons: ['A screen swap is cheaper than a new laptop.'], skillsNeeded: ['Laptop screen replacement'] },
  estimate: { isEstimate: true, currency: 'INR', resale: { min: 8000, max: 12000 }, repair: { min: 3000, max: 5000 } },
  notice: 'A suggestion, not a promise.',
  ...over,
});
const photo = new File(['x'], 'd.png', { type: 'image/png' });
const categories = [{ slug: 'laptop', name: 'Laptop' }];

function setup(values = {}) {
  const store = { name: '', brand: '', model: '', conditionNote: '', ...values };
  const setValue = vi.fn((k, v) => { store[k] = v; });
  const onApplied = vi.fn();
  render(<AiAssist files={[photo]} getValues={(k) => (k ? store[k] : store)} setValue={setValue} categories={categories} onApplied={onApplied} />);
  return { setValue, onApplied };
}

beforeEach(() => vi.clearAllMocks());

describe('AI help on the device form', () => {
  it('tells people their photos go to Google, and only sends them on the button press', async () => {
    aiApi.status.mockResolvedValue({ photoAi: true });
    setup();
    expect(await screen.findByText(/Your photos are sent to Google only when you press the button/)).toBeInTheDocument();
    expect(aiApi.analyzeDevice).not.toHaveBeenCalled();
  });

  it('shows what it found with rough prices and fills the form only when asked', async () => {
    aiApi.status.mockResolvedValue({ photoAi: true });
    aiApi.analyzeDevice.mockResolvedValue(result());
    const { setValue, onApplied } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest from my photos' }));
    expect(await screen.findByText('Best next step: Repair')).toBeInTheDocument();
    expect(screen.getByText(/₹3,000 to ₹5,000/)).toBeInTheDocument();
    expect(screen.getByText(/rough estimates, not offers/)).toBeInTheDocument();
    expect(aiApi.analyzeDevice).toHaveBeenCalledWith([photo], '');
    expect(setValue).not.toHaveBeenCalled(); // nothing is filled until the person says so

    fireEvent.click(screen.getByRole('button', { name: 'Use these details' }));
    const filled = Object.fromEntries(setValue.mock.calls.map(([k, v]) => [k, v]));
    expect(filled).toMatchObject({ name: 'Dell Inspiron 15 laptop', category: 'laptop', brand: 'Dell', model: 'Inspiron 15', condition: 'major_damage', preferredService: 'repair', conditionNote: 'Likely problems: Cracked screen.' });
    expect(onApplied).toHaveBeenCalled();
  });

  it('does not overwrite a condition note the person already wrote', async () => {
    aiApi.status.mockResolvedValue({ photoAi: true });
    aiApi.analyzeDevice.mockResolvedValue(result());
    const { setValue } = setup({ conditionNote: 'Bought in 2019, charger included.' });
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest from my photos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use these details' }));
    expect(setValue.mock.calls.map(([k]) => k)).not.toContain('conditionNote');
  });

  it('does not suggest a service the person cannot list (reuse or donation)', async () => {
    aiApi.status.mockResolvedValue({ photoAi: true });
    aiApi.analyzeDevice.mockResolvedValue(result({ advice: { recommendation: 'reuse', alternatives: ['donation'], reasons: ['It works.'] } }));
    const { setValue } = setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest from my photos' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Use these details' }));
    expect(setValue.mock.calls.map(([k]) => k)).not.toContain('preferredService');
  });

  it('uses only the words and sends no photo when photo reading is off', async () => {
    aiApi.status.mockResolvedValue({ photoAi: false });
    aiApi.analyzeDevice.mockResolvedValue(result({ source: 'rules' }));
    setup({ name: 'Dell laptop will not turn on' });
    expect(await screen.findByText(/Photo reading is switched off/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Suggest from my words' }));
    await waitFor(() => expect(aiApi.analyzeDevice).toHaveBeenCalledWith([], 'Dell laptop will not turn on'));
    expect(await screen.findByText(/Suggested from simple rules/)).toBeInTheDocument();
  });

  it('shows why the AI could not be used, and keeps working', async () => {
    aiApi.status.mockResolvedValue({ photoAi: true });
    aiApi.analyzeDevice.mockResolvedValue(result({ source: 'rules', unavailableReason: 'The free AI quota for today is used up. Try again tomorrow.' }));
    setup();
    fireEvent.click(await screen.findByRole('button', { name: 'Suggest from my photos' }));
    expect(await screen.findByText(/quota for today is used up/)).toBeInTheDocument();
  });
});

describe('smart suggestions on my device', () => {
  const listing = (preferredService) => ({ _id: 'l1', preferredService });
  const open = (service) => render(<MemoryRouter><SmartMatches listing={listing(service)} /></MemoryRouter>);

  it('shows refurbishers and wanted requests with the reasons for a refurbishment listing', async () => {
    matchApi.forListing.mockImplementation(async (_id, kind) => (kind === 'refurbishers'
      ? [{ id: 'r1', name: 'Near Works', reasons: ['Takes this kind of device', '2.1 km away'], score: 82 }]
      : [{ id: 'w1', title: 'Dell laptops wanted', reasons: ['Looking for Dell'], score: 70 }]));
    open('refurbishment');
    expect(await screen.findByText('Near Works')).toBeInTheDocument();
    expect(screen.getByText(/2\.1 km away/)).toBeInTheDocument();
    expect(await screen.findByText('Dell laptops wanted')).toBeInTheDocument();
    expect(screen.getByText('82% match')).toBeInTheDocument();
  });

  it('shows recyclers for a recycling listing', async () => {
    matchApi.forListing.mockResolvedValue([{ id: 'c1', name: 'Green Recyclers', reasons: ['Handles hazardous parts safely'], score: 90 }]);
    open('recycling');
    expect(await screen.findByText('Green Recyclers')).toBeInTheDocument();
    expect(matchApi.forListing).toHaveBeenCalledWith('l1', 'recyclers', expect.anything());
  });

  it('links technicians for a repair listing', async () => {
    technicianApi.recommendations.mockResolvedValue([{ technician: { _id: 't1', name: 'Ravi Kumar' }, score: 77, reasons: ['Specialises in this type of device'] }]);
    open('repair');
    expect(await screen.findByRole('link', { name: 'Ravi Kumar' })).toHaveAttribute('href', '/technicians/t1');
  });

  it('asks the AI for advice about the listing on request', async () => {
    technicianApi.recommendations.mockResolvedValue([]);
    aiApi.advice.mockResolvedValue(result());
    open('repair');
    fireEvent.click(await screen.findByRole('button', { name: /Should I repair, refurbish, reuse or recycle this/ }));
    expect(await screen.findByText('Best next step: Repair')).toBeInTheDocument();
    expect(aiApi.advice).toHaveBeenCalledWith({ listingId: 'l1' });
  });
});

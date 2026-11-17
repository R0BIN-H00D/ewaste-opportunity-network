import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AiSuggestion from '../components/devices/AiSuggestion';
import { confidenceLabel, isEmptySuggestion, toSavedSuggestion } from '../lib/ai';
import { aiApi } from '../services/aiApi';

vi.mock('../services/aiApi', () => ({ aiApi: { classify: vi.fn() } }));

const answer = (over = {}) => ({
  source: 'rules', usedPhoto: false, confidence: 0.6, fallbackReason: 'not_configured',
  category: { _id: 'c1', name: 'Laptop', slug: 'laptop' }, deviceType: 'Laptop', brand: 'Dell',
  visibleDamage: ['Scratches'], possibleRepairs: ['Hinge check'],
  disclaimer: 'This is only a suggestion. A photo cannot show damage inside.',
  ...over,
});
const FILE = new File(['x'], 'a.png', { type: 'image/png' });

beforeEach(() => vi.clearAllMocks());

describe('suggestion helpers', () => {
  it('says how sure in words, never as a percentage', () => {
    expect(confidenceLabel(0.9)).toBe('Fairly sure');
    expect(confidenceLabel(0.5)).toBe('Not very sure');
    expect(confidenceLabel(0.1)).toBe('Only a guess');
    expect(confidenceLabel(undefined)).toBe('Only a guess');
  });
  it('knows when nothing was found', () => {
    expect(isEmptySuggestion(answer({ category: null, brand: null, visibleDamage: [], possibleRepairs: [] }))).toBe(true);
    expect(isEmptySuggestion(answer())).toBe(false);
    expect(isEmptySuggestion(null)).toBe(true);
  });
  it('saves only what the server accepts, with no confirmed flag of its own', () => {
    const saved = toSavedSuggestion(answer({ confidence: 0.6666 }));
    expect(saved).toEqual({ source: 'rules', category: 'laptop', type: 'Laptop', brand: 'Dell', visibleDamage: ['Scratches'], possibleRepairs: ['Hinge check'], confidence: 0.67 });
    expect(saved).not.toHaveProperty('confirmedByUser');
    expect(toSavedSuggestion(answer({ category: null, brand: null, deviceType: null }))).not.toHaveProperty('category');
  });
});

describe('AiSuggestion', () => {
  const setup = (props = {}) => {
    const onUse = vi.fn();
    render(<AiSuggestion getText={() => ({ title: 'Dell laptop', description: '' })} photo={null} onUse={onUse} {...props} />);
    return onUse;
  };

  it('is only a suggestion: nothing is applied until "Use this"', async () => {
    aiApi.classify.mockResolvedValue(answer());
    const onUse = setup();
    fireEvent.click(screen.getByRole('button', { name: /Suggest what this is/ }));
    expect(await screen.findByText('Laptop')).toBeInTheDocument();
    expect(aiApi.classify).toHaveBeenCalledWith({ title: 'Dell laptop', description: '' }, null);
    expect(screen.getByText('From your words · Not very sure')).toBeInTheDocument();
    expect(screen.getByText(/Damage you mentioned:/)).toBeInTheDocument();
    expect(screen.getByText(/A photo cannot show damage inside/)).toBeInTheDocument();
    expect(onUse).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use this' }));
    expect(onUse).toHaveBeenCalledWith(expect.objectContaining({ brand: 'Dell' }));
    expect(screen.getByText('Added to the form. You can still change it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use this' })).not.toBeInTheDocument();
  });

  it('says when it read the photo, and sends the photo', async () => {
    aiApi.classify.mockResolvedValue(answer({ source: 'gemini', usedPhoto: true, confidence: 0.9, visibleDamage: ['Cracked screen'] }));
    setup({ photo: FILE });
    fireEvent.click(screen.getByRole('button', { name: /Suggest what this is/ }));
    expect(await screen.findByText('From your photo · Fairly sure')).toBeInTheDocument();
    expect(screen.getByText(/Damage that looks visible:/)).toBeInTheDocument();
    expect(aiApi.classify.mock.calls[0][1]).toBe(FILE);
  });

  it('asks for a photo or a name first, rather than sending nothing', () => {
    setup({ getText: () => ({ title: '', description: '' }) });
    fireEvent.click(screen.getByRole('button', { name: /Suggest what this is/ }));
    expect(screen.getByText('Add a photo or type the device name first.')).toBeInTheDocument();
    expect(aiApi.classify).not.toHaveBeenCalled();
  });

  it('says plainly when it could not tell, and offers nothing to use', async () => {
    aiApi.classify.mockResolvedValue(answer({ category: null, brand: null, visibleDamage: [], possibleRepairs: [], confidence: 0 }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Suggest what this is/ }));
    expect(await screen.findByText('We could not tell what this is. Please choose the category yourself.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Use this' })).not.toBeInTheDocument();
  });

  it('says why it failed and keeps the form usable', async () => {
    aiApi.classify.mockRejectedValue({ response: { status: 429, data: { message: 'Too many suggestions just now.' } } });
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Suggest what this is/ }));
    expect(await screen.findByText('Too many suggestions just now.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Suggest what this is/ })).toBeEnabled();
  });

  it('shows it is working, and can ask again afterwards', async () => {
    let finish;
    aiApi.classify.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    setup();
    fireEvent.click(screen.getByRole('button', { name: /Suggest what this is/ }));
    expect(screen.getByRole('button', { name: /Looking/ })).toBeDisabled();
    finish(answer());
    await waitFor(() => expect(screen.getByRole('button', { name: /Suggest again/ })).toBeEnabled());
  });
});
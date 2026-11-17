import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import SchedulePickup from '../components/handover/SchedulePickup';
import SlotChoices, { dayLabel, slotHours, toLocalInput } from '../components/handover/SlotChoices';
import { pickupApi } from '../services/pickupApi';

vi.mock('../services/pickupApi', () => ({ pickupApi: { slots: vi.fn(), list: vi.fn() } }));

const KEYS = ['08:00-10:00', '10:00-12:00', '12:00-14:00', '14:00-16:00', '16:00-18:00'];
const LABELS = ['Morning', 'Late morning', 'Midday', 'Afternoon', 'Evening'];
const day = (date, { open = [0, 1, 2, 3, 4], busy = [] } = {}) => ({
  date,
  slots: KEYS.map((key, i) => ({
    key,
    label: LABELS[i],
    start: new Date(Date.UTC(2099, 0, Number(date.slice(-2)), 2 + i * 2, 30)).toISOString(),
    available: open.includes(i) && !busy.includes(i),
    ...(!open.includes(i) ? { reason: 'too_soon' } : busy.includes(i) ? { reason: 'busy' } : {}),
  })),
});
const catalogue = (days) => ({ cutoffHours: 2, maxReschedules: 3, timezone: 'Asia/Kolkata', days });

beforeEach(() => vi.clearAllMocks());

describe('slot helpers', () => {
  it('words a day and its hours the way people do', () => {
    expect(dayLabel('2026-11-18')).toBe('Wed 18 Nov');
    expect(dayLabel('junk')).toBe('junk');
    expect(slotHours('08:00-10:00')).toBe('8-10 am');
    expect(slotHours('10:00-12:00')).toBe('10 am-12 pm');
    expect(slotHours('12:00-14:00')).toBe('12-2 pm');
    expect(slotHours('x')).toBe('x');
  });
  it('writes a date as a datetime-local value', () => {
    expect(toLocalInput(new Date(2026, 10, 18, 9, 5))).toBe('2026-11-18T09:05');
  });
});

describe('SlotChoices', () => {
  it('offers the days that have room and disables the closed windows', async () => {
    pickupApi.slots.mockResolvedValue(catalogue([day('2099-01-01', { open: [] }), day('2099-01-02', { open: [1, 2, 3, 4], busy: [1] })]));
    render(<SlotChoices onPick={vi.fn()} selected="" />);
    expect(await screen.findByText('Open times')).toBeInTheDocument();
    expect(screen.getByText(/until 2 hours before/)).toBeInTheDocument();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Morning/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Late morning/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Late morning/ })).toHaveAttribute('title', 'You already have something then');
    expect(screen.getByRole('button', { name: /Morning/ })).toHaveAttribute('title', 'Starts too soon');
    expect(screen.getByRole('button', { name: /Afternoon/ })).toBeEnabled();
  });

  it('reports the window picked and shows it as pressed', async () => {
    pickupApi.slots.mockResolvedValue(catalogue([day('2099-01-02')]));
    const onPick = vi.fn();
    const { rerender } = render(<SlotChoices onPick={onPick} selected="" />);
    fireEvent.click(await screen.findByRole('button', { name: /Afternoon/ }));
    expect(onPick).toHaveBeenCalledWith({ start: '2099-01-02T08:30:00.000Z', key: '14:00-16:00' });
    rerender(<SlotChoices onPick={onPick} selected="2099-01-02T08:30:00.000Z" />);
    expect(screen.getByRole('button', { name: /Afternoon/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows nothing when the windows cannot be loaded', async () => {
    pickupApi.slots.mockRejectedValue(new Error('offline'));
    const { container } = render(<SlotChoices onPick={vi.fn()} selected="" />);
    await waitFor(() => expect(pickupApi.slots).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('shows nothing when no day has an open window', async () => {
    pickupApi.slots.mockResolvedValue(catalogue([day('2099-01-01', { open: [] })]));
    const { container } = render(<SlotChoices onPick={vi.fn()} selected="" />);
    await waitFor(() => expect(pickupApi.slots).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SchedulePickup with open times', () => {
  it('fills in the date and time window when one is picked, and sends both', async () => {
    pickupApi.slots.mockResolvedValue(catalogue([day('2099-01-02')]));
    const onSubmit = vi.fn();
    render(<SchedulePickup title="Arrange pickup" submitLabel="Save pickup" onSubmit={onSubmit} />);
    fireEvent.click(await screen.findByRole('button', { name: /Afternoon/ }));
    expect(screen.getByLabelText('Time window (optional)')).toHaveValue('14:00-16:00');
    fireEvent.click(screen.getByRole('button', { name: 'Save pickup' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ date: '2099-01-02T08:30:00.000Z', timeSlot: '14:00-16:00' });
  });

  it('still works by typing when the windows cannot be loaded', async () => {
    pickupApi.slots.mockRejectedValue(new Error('offline'));
    const onSubmit = vi.fn();
    render(<SchedulePickup title="Arrange pickup" submitLabel="Save pickup" onSubmit={onSubmit} />);
    await waitFor(() => expect(pickupApi.slots).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2099-03-04T10:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save pickup' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].timeSlot).toBeUndefined();
  });

  it('forgets the highlighted window when the time is edited by hand', async () => {
    pickupApi.slots.mockResolvedValue(catalogue([day('2099-01-02')]));
    render(<SchedulePickup title="Arrange pickup" submitLabel="Save pickup" onSubmit={vi.fn()} />);
    const afternoon = await screen.findByRole('button', { name: /Afternoon/ });
    fireEvent.click(afternoon);
    expect(afternoon).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Date and time'), { target: { value: '2099-03-04T10:00' } });
    expect(afternoon).toHaveAttribute('aria-pressed', 'false');
  });
});
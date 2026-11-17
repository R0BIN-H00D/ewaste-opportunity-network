import { CONTEXT_LABELS, byTime, chatTime, clockTime, contextLabel, dayLabel, sameDay } from '../lib/chat';
import { getCounts, refreshCounts, resetCounts, setCounts, subscribeCounts } from '../services/unread';
import { chatApi, notificationApi } from '../services/chatApi';

vi.mock('../services/chatApi', () => ({
  chatApi: { unreadCount: vi.fn() },
  notificationApi: { unreadCount: vi.fn() },
}));

const now = new Date(2026, 10, 16, 15, 0); // 16 Nov 2026, 3 PM

describe('contextLabel', () => {
  it('says what each kind of conversation is about', () => {
    expect(contextLabel('service')).toBe('Repair');
    expect(contextLabel('order')).toBe('Order');
    expect(contextLabel('enquiry')).toBe('Question about a device');
    expect(Object.keys(CONTEXT_LABELS).every((k) => contextLabel(k).length > 0)).toBe(true);
  });
  it('falls back for a kind it does not know', () => {
    expect(contextLabel('something new')).toBe('Conversation');
    expect(contextLabel(undefined)).toBe('Conversation');
  });
});

describe('chatTime', () => {
  it('is a time of day today', () => {
    expect(chatTime(new Date(2026, 10, 16, 9, 5), now)).toBe('9:05 AM');
    expect(chatTime(new Date(2026, 10, 16, 15, 45), now)).toBe('3:45 PM');
  });
  it('is "Yesterday", then a date, then a date with the year', () => {
    expect(chatTime(new Date(2026, 10, 15, 23, 59), now)).toBe('Yesterday');
    expect(chatTime(new Date(2026, 2, 2), now)).toMatch(/^2 Mar$/);
    expect(chatTime(new Date(2025, 11, 31), now)).toMatch(/31 Dec 2025/);
  });
  it('goes by the calendar day, not 24 hours', () => {
    expect(chatTime(new Date(2026, 10, 15, 1, 0), new Date(2026, 10, 16, 0, 10))).toBe('Yesterday');
  });
  it('is empty without a date', () => {
    expect(chatTime(null, now)).toBe('');
    expect(chatTime(undefined, now)).toBe('');
  });
});

describe('dayLabel and sameDay', () => {
  it('labels a run of messages', () => {
    expect(dayLabel(new Date(2026, 10, 16, 8), now)).toBe('Today');
    expect(dayLabel(new Date(2026, 10, 15, 8), now)).toBe('Yesterday');
    expect(dayLabel(new Date(2026, 10, 1, 8), now)).toMatch(/1 Nov 2026/);
  });
  it('compares calendar days', () => {
    expect(sameDay(new Date(2026, 10, 16, 0, 1), new Date(2026, 10, 16, 23, 59))).toBe(true);
    expect(sameDay(new Date(2026, 10, 16, 23, 59), new Date(2026, 10, 17, 0, 1))).toBe(false);
  });
});

describe('clockTime and byTime', () => {
  it('formats a clock time or nothing', () => {
    expect(clockTime(new Date(2026, 10, 16, 0, 30))).toBe('12:30 AM');
    expect(clockTime(null)).toBe('');
  });
  it('orders oldest first without touching the input', () => {
    const input = [{ id: 'b', createdAt: '2026-11-16T10:00:00Z' }, { id: 'a', createdAt: '2026-11-16T09:00:00Z' }, { id: 'c', createdAt: '2026-11-16T11:00:00Z' }];
    expect(byTime(input).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    expect(input.map((m) => m.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('the unread badge numbers', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetCounts();
  });

  it('start at zero and tell subscribers when they change', () => {
    const seen = [];
    const off = subscribeCounts(() => seen.push({ ...getCounts() }));
    setCounts({ messages: 3 });
    setCounts({ notifications: 2 });
    off();
    setCounts({ messages: 9 });
    expect(seen).toEqual([{ notifications: 0, messages: 3 }, { notifications: 2, messages: 3 }]);
  });

  it('are read from the server together', async () => {
    notificationApi.unreadCount.mockResolvedValue(4);
    chatApi.unreadCount.mockResolvedValue(7);
    await refreshCounts();
    expect(getCounts()).toEqual({ notifications: 4, messages: 7 });
  });

  it('keep the old number when one of the two asks fails', async () => {
    setCounts({ notifications: 4, messages: 7 });
    notificationApi.unreadCount.mockRejectedValue(new Error('offline'));
    chatApi.unreadCount.mockResolvedValue(1);
    await refreshCounts();
    expect(getCounts()).toEqual({ notifications: 4, messages: 1 });
  });
});

import { useEffect, useState } from 'react';
import { pickupApi } from '../../services/pickupApi';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

/** "Wed 18 Nov" for a `YYYY-MM-DD` day. */
export function dayLabel(date) {
  const [y, m, d] = String(date).split('-').map(Number);
  if (!y || !m || !d) return String(date);
  return `${WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** "8-10 am", "12-2 pm", "11 am-1 pm" for a "08:00-10:00" window. */
export function slotHours(key) {
  const [a, b] = String(key).split('-').map((p) => Number.parseInt(p, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return String(key);
  const h = (n) => (n % 12 === 0 ? 12 : n % 12);
  const ap = (n) => (n < 12 ? 'am' : 'pm');
  return ap(a) === ap(b) ? `${h(a)}-${h(b)} ${ap(b)}` : `${h(a)} ${ap(a)}-${h(b)} ${ap(b)}`;
}

/** A Date as the value a datetime-local field takes, in the browser's own time zone. */
export function toLocalInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * The collection windows the server says are open, a day at a time (FR-PICK-001). Picking one calls `onPick({ start, key })`.
 * If they cannot be loaded this shows nothing and the person types a date and time as before.
 */
export default function SlotChoices({ onPick, selected }) {
  const [catalogue, setCatalogue] = useState(null);
  const [day, setDay] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const data = await pickupApi.slots(controller.signal);
        if (!controller.signal.aborted && Array.isArray(data?.days)) setCatalogue(data);
      } catch {
        // Not fatal: the date and time fields below still work.
      }
    })();
    return () => controller.abort();
  }, []);

  const days = (catalogue?.days || []).filter((d) => d.slots.some((s) => s.available));
  if (!days.length) return null;
  const current = days.find((d) => d.date === day) || days[0];

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">Open times</legend>
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
        India time. A booking can be changed until {catalogue.cutoffHours} hours before it starts, up to {catalogue.maxReschedules} times.
      </p>
      <label className="block text-sm">
        <span className="sr-only">Day</span>
        <select className="input" value={current.date} onChange={(e) => setDay(e.target.value)}>
          {days.map((d) => <option key={d.date} value={d.date}>{dayLabel(d.date)}</option>)}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        {current.slots.map((s) => {
          const on = selected === s.start;
          return (
            <button
              key={s.key}
              type="button"
              className={`btn ${on ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={on}
              disabled={!s.available}
              title={s.available ? undefined : (s.reason === 'busy' ? 'You already have something then' : 'Starts too soon')}
              onClick={() => onPick({ start: s.start, key: s.key })}
            >
              {s.label} · {slotHours(s.key)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
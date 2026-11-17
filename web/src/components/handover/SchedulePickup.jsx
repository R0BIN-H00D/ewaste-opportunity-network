import { useState } from 'react';
import { CalendarClock } from 'lucide-react';
import TextField from '../ui/TextField';
import ActionBox from './ActionBox';
import SlotChoices, { toLocalInput } from './SlotChoices';
import { FUTURE_DATE_MESSAGE, futureDate } from '../../lib/handover';

/**
 * Schedule or reschedule a pickup, collection or handover. The date must be in the future; the server enforces the
 * reschedule limits. `onSubmit({ date (ISO), timeSlot?, notes? })` performs the request. `children` (current time, hints) show above the form.
 */
export default function SchedulePickup({ title, icon = CalendarClock, dateLabel = 'Date and time', notesLabel = 'Notes (optional)', notesAs = 'textarea', submitLabel, hint, busy, onSubmit, children }) {
  const [date, setDate] = useState('');
  const [slot, setSlot] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [picked, setPicked] = useState('');

  const submit = (e) => {
    e.preventDefault();
    const when = futureDate(date);
    if (!when) return setError(FUTURE_DATE_MESSAGE);
    setError('');
    return onSubmit({ date: when.toISOString(), ...(slot.trim() ? { timeSlot: slot.trim() } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) });
  };

  return (
    <ActionBox title={title} icon={icon}>
      {children}
      <form onSubmit={submit} noValidate className="space-y-3">
        <SlotChoices selected={picked} onPick={({ start, key }) => { setPicked(start); setDate(toLocalInput(new Date(start))); setSlot(key); setError(''); }} />
        <TextField label={dateLabel} type="datetime-local" value={date} onChange={(e) => { setDate(e.target.value); setPicked(''); }} error={error} />
        <TextField label="Time window (optional)" value={slot} onChange={(e) => setSlot(e.target.value)} placeholder="10:00-12:00" maxLength={40} />
        <TextField as={notesAs === 'textarea' ? 'textarea' : 'input'} rows={notesAs === 'textarea' ? 2 : undefined} label={notesLabel} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        <button type="submit" className="btn btn-primary" disabled={busy}>{submitLabel}</button>
        {hint && <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{hint}</p>}
      </form>
    </ActionBox>
  );
}

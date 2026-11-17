import { useState } from 'react';
import { MapPin, Search } from 'lucide-react';
import Alert from '../ui/Alert';
import TextField from '../ui/TextField';
import { geoApi } from '../../services/geoApi';
import { toApiError } from '../../utils/errors';

/**
 * Looks up a typed address and lets the person pick the right place, which fills in the area, the city and the map point.
 * It is a convenience: when the search is unavailable the message says to type the area and city, which always works.
 * `onPick({ area, city, lat, lng })`.
 */
export default function AddressSearch({ onPick }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');

  const search = async (e) => {
    e?.preventDefault();
    const q = text.trim();
    if (q.length < 3) return setError('Type at least 3 characters of the address.');
    setBusy(true);
    setError('');
    try {
      setResults(await geoApi.search(q));
    } catch (err) {
      setResults(null);
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="glass-subtle space-y-3 p-4">
      <p className="text-sm font-semibold text-ink dark:text-white">Find your address</p>
      <form onSubmit={search} noValidate className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1">
          <TextField label="Address, area or landmark" value={text} onChange={(e) => { setText(e.target.value); setError(''); }} placeholder="e.g. 12 MG Road, Bengaluru" maxLength={120} />
        </div>
        <button type="submit" className="btn btn-glass" disabled={busy}><Search size={16} aria-hidden /> {busy ? 'Searching…' : 'Search'}</button>
      </form>
      <Alert variant="error">{error}</Alert>
      {results && results.length === 0 && <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Nothing found. Try fewer words, or type the area and city below.</p>}
      {results && results.length > 0 && (
        <ul className="space-y-2" aria-label="Places found">
          {results.map((r) => (
            <li key={`${r.lat},${r.lng}`}>
              <button type="button" className="glass-subtle flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-black/5 dark:text-[#E8F1EB] dark:hover:bg-white/10" onClick={() => { onPick({ area: r.area, city: r.city, lat: r.lat, lng: r.lng }); setResults(null); }}>
                <MapPin size={16} aria-hidden className="mt-0.5 shrink-0" /> <span>{r.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">Map data © OpenStreetMap contributors. Others only ever see an approximate area.</p>
    </div>
  );
}
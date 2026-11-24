import { useEffect, useRef, useState } from 'react';
import { LocateFixed } from 'lucide-react';
import { geoApi } from '../../services/geoApi';

// What to tell the person for each reason the browser gives for not finding them (GeolocationPositionError.code).
const REASONS = {
  1: 'Location is blocked for this site. Allow it with the lock icon in the address bar, then press the button again. Or type the address yourself.',
  2: 'Your device could not find where it is. Turn on location (GPS) and try again, or type the address yourself.',
  3: 'Finding your location took too long. Try again, or type the address yourself.',
};

/**
 * "Use my current location": asks the browser where the person is, looks up the address for that spot and hands it to the form
 * (`onDetected(place)`, with `area`, `city`, `state` and `postcode`). It is always optional: when the browser cannot say, or the
 * address service is out of reach, it explains why and the person types the address instead.
 */
export default function DetectLocationButton({ onDetected, label = 'Use my current location', className = '' }) {
  const [state, setState] = useState({ busy: false, text: '', tone: 'info' });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const say = (text, tone = 'info', busy = false) => alive.current && setState({ busy, text, tone });

  const found = async (pos) => {
    const lat = Number(pos.coords.latitude.toFixed(5));
    const lng = Number(pos.coords.longitude.toFixed(5));
    try {
      const place = await geoApi.reverse(lat, lng);
      if (!place || (!place.area && !place.city && !place.postcode)) return say('We found where you are, but nothing is known about this spot. Please type the address.', 'warn');
      onDetected({ ...place, lat, lng });
      const where = [place.area, place.city].filter(Boolean).join(', ');
      return say(`Location detected${where ? `: ${where}` : ''}. Check it and fix anything that is not right.`, 'ok');
    } catch {
      return say('We found where you are, but could not look up the address just now. Please type it.', 'warn');
    }
  };

  const run = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return say('This browser cannot share its location. Please type the address.', 'warn');
    say('Finding your location…', 'info', true);
    return navigator.geolocation.getCurrentPosition(
      found,
      (err) => say(REASONS[err?.code] || REASONS[2], 'warn'),
      { timeout: 12000, maximumAge: 60000 },
    );
  };

  const color = { ok: 'text-success', warn: 'text-warning', info: 'text-ink-muted dark:text-[#9FB2A7]' }[state.tone];
  return (
    <div className={className}>
      <button type="button" className="btn btn-glass" onClick={run} disabled={state.busy}>
        <LocateFixed size={16} aria-hidden /> {state.busy ? 'Detecting…' : label}
      </button>
      {state.text && <p role={state.tone === 'warn' ? 'alert' : 'status'} className={`mt-2 text-sm ${color}`}>{state.text}</p>}
    </div>
  );
}

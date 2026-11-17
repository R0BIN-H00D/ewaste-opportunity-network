import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import Alert from '../ui/Alert';
import { aiApi } from '../../services/aiApi';
import { confidenceLabel, isEmptySuggestion } from '../../lib/ai';
import { toApiError } from '../../utils/errors';

/**
 * "Suggest what this is" on the listing form (FR-AI-001..004). It shows what came back with a plain warning that a photo cannot
 * show internal damage, and only fills the form in when the person chooses "Use this" (FR-AI-002).
 * `getText()` returns { title, description }; `photo` is the first photo (a File) or null; `onUse(suggestion)` applies it.
 */
export default function AiSuggestion({ getText, photo, onUse }) {
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError] = useState('');
  const [used, setUsed] = useState(false);

  const ask = async () => {
    const text = getText();
    if (!photo && (text.title || '').trim().length < 2) return setError('Add a photo or type the device name first.');
    setBusy(true);
    setError('');
    setUsed(false);
    try {
      setSuggestion(await aiApi.classify(text, photo));
    } catch (err) {
      setError(toApiError(err).message);
    } finally {
      setBusy(false);
    }
  };

  const s = suggestion;
  const line = (label, value) => <p key={label} className="text-sm"><span className="font-semibold">{label}:</span> {value}</p>;
  return (
    <div className="glass-subtle space-y-2 p-4" aria-live="polite">
      <p className="text-sm font-semibold text-ink dark:text-white">Not sure what to choose?</p>
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">We can suggest a category from your photo and the words you typed. You decide what to keep.</p>
      <button type="button" className="btn btn-glass" onClick={ask} disabled={busy}>
        <Sparkles size={16} aria-hidden /> {busy ? 'Looking…' : s ? 'Suggest again' : 'Suggest what this is'}
      </button>
      {error && <Alert variant="error">{error}</Alert>}
      {s && (isEmptySuggestion(s) ? (
        <p className="text-sm">We could not tell what this is. Please choose the category yourself.</p>
      ) : (
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-[#9FB2A7]">{s.usedPhoto ? 'From your photo' : 'From your words'} · {confidenceLabel(s.confidence)}</p>
          {s.category && line('Category', s.category.name)}
          {s.brand && line('Brand', s.brand)}
          {s.visibleDamage?.length > 0 && line(s.usedPhoto ? 'Damage that looks visible' : 'Damage you mentioned', s.visibleDamage.join(', '))}
          {s.possibleRepairs?.length > 0 && line('A repairer might look at', s.possibleRepairs.join(', '))}
          {s.disclaimer && <p className="pt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">{s.disclaimer}</p>}
          {used ? (
            <p className="flex items-center gap-1 text-sm"><Check size={14} aria-hidden /> Added to the form. You can still change it.</p>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => { onUse(s); setUsed(true); }}>Use this</button>
          )}
        </div>
      ))}
    </div>
  );
}
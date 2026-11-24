import { useEffect, useState } from 'react';
import { Lightbulb, Sparkles } from 'lucide-react';
import Alert from '../ui/Alert';
import { aiApi } from '../../services/aiApi';
import { friendlyMessage, toApiError } from '../../utils/errors';
import { CONDITIONS, LISTABLE_SERVICES, SERVICES, labelOf } from '../../lib/devices';

const money = (n) => `₹${new Intl.NumberFormat('en-IN').format(n)}`;
const rangeText = (r) => (r ? `${money(r.min)} to ${money(r.max)}` : '');

/** What the AI (or the rules) found: the device, rough values, and what to do with it. Used on the form and on a listing. */
export function AdviceView({ result }) {
  const { advice, estimate } = result;
  const rows = [
    ['Worth about', rangeText(estimate?.resale)],
    ['Repair would cost about', rangeText(estimate?.repair)],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-3 text-sm text-ink dark:text-[#E8F1EB]">
      <p className="flex items-center gap-2 font-semibold text-ink dark:text-white">
        <Lightbulb size={16} aria-hidden /> Best next step: {labelOf(SERVICES, advice.recommendation)}
        {advice.alternatives?.length > 0 && <span className="font-normal text-ink-muted dark:text-[#9FB2A7]"> (or {advice.alternatives.map((a) => labelOf(SERVICES, a).toLowerCase()).join(', ')})</span>}
      </p>
      {advice.reasons?.length > 0 && <ul className="list-disc space-y-1 pl-5">{advice.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {result.problems?.length > 0 && <p><span className="font-semibold">Likely problems:</span> {result.problems.join(', ')}.</p>}
      {advice.skillsNeeded?.length > 0 && <p><span className="font-semibold">A technician should know:</span> {advice.skillsNeeded.join(', ')}.</p>}
      {rows.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="font-semibold">{k}</dt><dd className="font-numeric">{v}</dd></div>))}
        </dl>
      )}
      {advice.safetyTip && <p className="text-ink-muted dark:text-[#9FB2A7]">{advice.safetyTip}</p>}
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
        {result.source === 'ai' ? 'Suggested by AI. ' : 'Suggested from simple rules. '}Prices are rough estimates, not offers. {result.notice}
      </p>
    </div>
  );
}

/**
 * "Suggest from my photos": sends the chosen photos (and the words already typed) to the server's free AI, then lets the
 * person fill the form with what it found. Nothing is filled until they press "Use these details".
 */
export default function AiAssist({ files, getValues, setValue, categories, onApplied, onEstimate }) {
  const [photoAi, setPhotoAi] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => { aiApi.status().then((s) => setPhotoAi(Boolean(s.photoAi))).catch(() => setPhotoAi(false)); }, []);

  const words = () => {
    const v = getValues();
    return [v.name, v.brand, v.model, v.conditionNote].filter(Boolean).join('. ');
  };
  const canRun = files.length > 0 || words().trim().length > 0;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const found = await aiApi.analyzeDevice(photoAi ? files : [], words());
      setResult(found);
      onEstimate?.(found.estimate?.resale || null); // the price the AI expects is offered again on the price step
    } catch (err) {
      setError(friendlyMessage(toApiError(err)));
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    const set = (name, value) => value && setValue(name, value, { shouldValidate: true, shouldDirty: true });
    if (result.title) set('name', result.title);
    if (result.category && categories.some((c) => c.slug === result.category.slug)) set('category', result.category.slug);
    set('brand', result.brand);
    set('model', result.model);
    if (result.condition && CONDITIONS.some(([v]) => v === result.condition)) set('condition', result.condition);
    const rec = result.advice?.recommendation;
    if (LISTABLE_SERVICES.includes(rec)) set('preferredService', rec);
    if (result.problems?.length && !getValues('conditionNote')?.trim()) set('conditionNote', `Likely problems: ${result.problems.join(', ')}.`);
    onApplied?.('Filled in from the suggestion. Check the details below.');
  };

  return (
    <section className="glass-subtle space-y-3 p-4" aria-label="AI help">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink dark:text-white"><Sparkles size={16} aria-hidden /> Let AI help fill this in</p>
      <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">
        {photoAi
          ? 'Reads your photos with a free AI (Google Gemini) to suggest the brand, model, condition, likely problems and a rough value. Your photos are sent to Google only when you press the button.'
          : 'Photo reading is switched off, so this uses only the words you typed. Add the name or a description first.'}
      </p>
      <Alert variant="error">{error}</Alert>
      <button type="button" className="btn btn-glass" disabled={busy || !canRun} onClick={run}>{busy ? 'Thinking…' : photoAi ? 'Suggest from my photos' : 'Suggest from my words'}</button>
      {result && (
        <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
          {result.unavailableReason && <Alert variant="info">{result.unavailableReason}</Alert>}
          <p className="text-sm text-ink dark:text-[#E8F1EB]">
            <span className="font-semibold">{result.title || 'Device'}</span>
            {result.category && ` · ${result.category.name}`}
            {result.condition && ` · ${labelOf(CONDITIONS, result.condition)}`}
          </p>
          <AdviceView result={result} />
          <button type="button" className="btn btn-primary" onClick={apply}>Use these details</button>
        </div>
      )}
    </section>
  );
}

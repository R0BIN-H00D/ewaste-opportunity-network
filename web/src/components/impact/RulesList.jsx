import GlassCard from '../glass/GlassCard';
import { useFetch } from '../../hooks/useFetch';
import { impactApi } from '../../services/impactApi';

/** How the Green Score is made, read from the server so what is shown is exactly what runs (P9-03). Hidden if it cannot load. */
export default function RulesList() {
  const { data } = useFetch((signal) => impactApi.rules(signal), []);
  if (!data) return null;
  return (
    <GlassCard as="section" aria-labelledby="rules-h" className="space-y-3">
      <h2 id="rules-h" className="text-xl font-bold text-ink dark:text-white">How the Green Score works</h2>
      <ul className="space-y-2" aria-label="Points for each activity">
        {data.rules.map((r) => (
          <li key={r.key} className="flex gap-3 text-sm text-ink dark:text-[#E8F1EB]">
            <span className="w-12 shrink-0 font-numeric font-bold text-primary dark:text-primary-tint">+{r.points}</span>
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
      <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted dark:text-[#9FB2A7]">
        {data.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
      <p className="text-sm text-ink dark:text-[#E8F1EB]">Levels: {data.levels.map((l) => `${l.name} from ${l.min}`).join(', ')}.</p>
    </GlassCard>
  );
}

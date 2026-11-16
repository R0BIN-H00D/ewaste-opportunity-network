import { Check } from 'lucide-react';
import { assetUrl } from '../../services/api';
import { formatDate, journeySteps, statusLabel } from '../../lib/requests';

/** The journey as a horizontal tracker (wraps on small screens) plus an accessible list for screen readers. */
export function Tracker({ request }) {
  const steps = journeySteps(request);
  return (
    <ol className="flex flex-wrap gap-x-2 gap-y-3" aria-label="Repair progress">
      {steps.map((s, i) => (
        <li key={s.key} className="flex items-center gap-2" aria-current={s.state === 'current' ? 'step' : undefined}>
          <span
            aria-hidden
            className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
              s.state === 'done' ? 'bg-success text-white' : s.state === 'current' ? 'bg-primary text-white dark:bg-primary-tint dark:text-canvas-dark' : 'bg-gray-500/20 text-ink-muted dark:text-gray-300'
            }`}
          >
            {s.state === 'done' ? <Check size={14} /> : i + 1}
          </span>
          <span className={`text-sm ${s.state === 'todo' ? 'text-ink-muted dark:text-[#9FB2A7]' : 'font-semibold text-ink dark:text-white'}`}>
            {s.label}
            <span className="sr-only">{s.state === 'done' ? ' (done)' : s.state === 'current' ? ' (current step)' : ' (not yet)'}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export function PhotoGrid({ photos, label }) {
  if (!photos?.length) return null;
  return (
    <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4" aria-label={label}>
      {photos.map((p) => (
        <li key={p.publicId || p.url}>
          <a href={assetUrl(p.url)} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-xl">
            <img src={assetUrl(p.url)} alt={label} loading="lazy" className="h-full w-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Newest first. Only what the server sent: no invented events. */
export function History({ request }) {
  const items = [...(request.statusHistory || [])].reverse();
  const notes = request.repairNotes || [];
  return (
    <div className="space-y-4">
      <ol className="space-y-3" aria-label="History">
        {items.map((h, i) => (
          <li key={`${h.status}-${h.at}-${i}`} className="border-l-2 border-primary/30 pl-3 text-sm">
            <p className="font-semibold text-ink dark:text-white">{statusLabel(h.status)}</p>
            <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(h.at)}</p>
            {h.note && <p className="mt-1 text-ink dark:text-[#E8F1EB]">{h.note}</p>}
            <PhotoGrid photos={h.photos} label="Photo from this step" />
          </li>
        ))}
      </ol>
      {notes.length > 0 && (
        <div>
          <h3 className="text-sm font-bold text-ink dark:text-white">Repair notes</h3>
          <ul className="mt-2 space-y-2">
            {[...notes].reverse().map((n, i) => (
              <li key={i} className="rounded-xl bg-primary/5 p-3 text-sm text-ink dark:text-[#E8F1EB]">
                {n.text}
                <span className="mt-1 block text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(n.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

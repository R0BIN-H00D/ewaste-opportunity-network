import { useState } from 'react';
import { Battery, Camera, ClipboardList, Droplets, Monitor, PlugZap, Power, Shield, Usb, Volume2 } from 'lucide-react';
import GlassCard from '../glass/GlassCard';
import { aboutRows } from '../../lib/devices';
import { PRODUCT_CONDITIONS } from '../../lib/marketplace';

const SHOWN = 4; // working condition, battery, screen and scratches come first
const ICONS = { power: Power, battery: Battery, screen: Monitor, body: Shield, charging: PlugZap, ports: Usb, sound: Volume2, camera: Camera, water: Droplets };
const DOT = { good: 'bg-success', warn: 'bg-warning', bad: 'bg-danger' };
const TONE_WORDS = { good: 'Good', warn: 'Minor issue', bad: 'Needs attention' };

/**
 * "About this device": how each part is doing, as a grid of small tiles, with the seller's own remarks. The first four parts are
 * shown; "Read more" opens the rest and the remarks.
 */
export default function AboutDevice({ product }) {
  const [open, setOpen] = useState(false);
  const rows = aboutRows(product.conditionDetails);
  const note = (product.conditionNote || '').trim();
  const grade = PRODUCT_CONDITIONS.find(([v]) => v === product.condition)?.[1];
  const shown = open ? rows : rows.slice(0, SHOWN);
  const hasMore = rows.length > SHOWN || Boolean(note);

  return (
    <GlassCard as="section" aria-label="About this device" className="space-y-4 !rounded-3xl !p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-lg font-bold text-ink dark:text-white">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary dark:text-primary-tint"><ClipboardList size={18} /></span>
          About this device
        </h2>
        {grade && <p className="rounded-full bg-primary/10 px-3.5 py-1.5 text-sm font-semibold text-primary dark:text-primary-tint">{`Overall condition: ${grade}`}</p>}
      </div>
      {rows.length > 0 ? (
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shown.map((r) => {
            const Icon = ICONS[r.key] || Shield;
            return (
              <div key={r.key} className="flex items-start gap-3 rounded-2xl bg-black/[0.03] p-3.5 dark:bg-white/5">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/80 text-ink-muted shadow-sm dark:bg-white/10 dark:text-[#9FB2A7]"><Icon size={17} /></span>
                <div className="min-w-0">
                  <dt className="text-xs font-medium text-ink-muted dark:text-[#9FB2A7]">{r.label}</dt>
                  <dd className="mt-0.5 flex items-start gap-2 text-sm font-semibold leading-snug text-ink dark:text-white">
                    <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[r.tone]}`} />
                    {r.answer}
                    <span className="sr-only"> ({TONE_WORDS[r.tone]})</span>
                  </dd>
                </div>
              </div>
            );
          })}
        </dl>
      ) : (
        <p className="rounded-2xl bg-black/[0.03] p-4 text-sm text-ink-muted dark:bg-white/5 dark:text-[#9FB2A7]">The seller has not added the details of each part yet. You can ask the seller a question below.</p>
      )}
      {open && note && (
        <div className="rounded-2xl border border-primary/15 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-ink dark:text-white">Other notes from the seller</p>
          <p className="mt-1 whitespace-pre-line leading-relaxed text-ink dark:text-[#E8F1EB]">{note}</p>
        </div>
      )}
      {hasMore && (
        <button type="button" className="btn btn-glass w-full justify-center" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Show less' : 'Read more'}
        </button>
      )}
    </GlassCard>
  );
}

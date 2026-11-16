import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

/** Disclosure list: one panel open at a time, keyboard and screen-reader friendly. */
export default function Accordion({ items }) {
  const base = useId();
  const [open, setOpen] = useState(-1);
  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q} className="glass-subtle">
            <h3>
              <button
                type="button"
                id={`${base}-h${i}`}
                aria-expanded={isOpen}
                aria-controls={`${base}-p${i}`}
                onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 px-5 text-left text-sm font-semibold text-ink dark:text-white"
              >
                {item.q}
                <ChevronDown size={18} aria-hidden className={`shrink-0 transition ${isOpen ? 'rotate-180' : ''}`} />
              </button>
            </h3>
            <div id={`${base}-p${i}`} role="region" aria-labelledby={`${base}-h${i}`} hidden={!isOpen} className="px-5 pb-4 text-sm text-ink-muted dark:text-[#9FB2A7]">
              {item.a}
            </div>
          </div>
        );
      })}
    </div>
  );
}

import { ChevronLeft, ChevronRight } from 'lucide-react';

// Window of page numbers around the current page, with first/last always present.
function windowOf(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1]);
  const list = [...set].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const out = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) out.push('gap-' + n);
    out.push(n);
  });
  return out;
}

export default function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null;
  const btn = 'btn btn-glass !min-h-[40px] !px-3';
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-2">
      <button type="button" className={btn} disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page">
        <ChevronLeft size={16} aria-hidden />
      </button>
      {windowOf(page, pages).map((n) =>
        typeof n === 'string' ? (
          <span key={n} aria-hidden className="px-1 text-ink-muted">…</span>
        ) : (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            aria-label={`Page ${n}`}
            aria-current={n === page ? 'page' : undefined}
            className={n === page ? 'btn btn-primary !min-h-[40px] !px-4' : btn}
          >
            {n}
          </button>
        ),
      )}
      <button type="button" className={btn} disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page">
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  );
}

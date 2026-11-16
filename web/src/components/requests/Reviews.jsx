import { useState } from 'react';
import ErrorState from '../ui/ErrorState';
import Pagination from '../ui/Pagination';
import Skeleton from '../ui/Skeleton';
import { Stars } from '../ui/StarInput';
import { useFetch } from '../../hooks/useFetch';
import { reviewApi } from '../../services/repairApi';
import { formatDate } from '../../lib/requests';

/** Public reviews of one provider with a rating summary. Shows only what was recorded; nothing is invented. */
export default function Reviews({ targetId }) {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch((signal) => reviewApi.list({ target: targetId, page, limit: 5 }, signal), [targetId, page]);

  if (error) return <ErrorState error={error} onRetry={reload} title="Could not load reviews" />;
  if (loading && !data) return <div aria-busy><Skeleton className="h-24 w-full" /></div>;
  const { items, meta } = data;
  const s = meta.summary;

  return (
    <section aria-labelledby="reviews-title" className="space-y-4">
      <h2 id="reviews-title" className="text-lg font-bold text-ink dark:text-white">Reviews</h2>
      {s.count === 0 ? (
        <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">No reviews yet. Customers can review a technician after a completed repair.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-6">
            <div>
              <p className="font-numeric text-4xl font-extrabold text-primary dark:text-primary-tint">{s.average.toFixed(1)}</p>
              <Stars value={s.average} />
              <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{s.count} {s.count === 1 ? 'review' : 'reviews'}</p>
            </div>
            <ul className="min-w-[200px] flex-1 space-y-1" aria-label="Rating breakdown">
              {[5, 4, 3, 2, 1].map((n) => (
                <li key={n} className="flex items-center gap-2 text-xs text-ink dark:text-white">
                  <span className="w-12">{n} {n === 1 ? 'star' : 'stars'}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-500/20"><span className="block h-full bg-warning" style={{ width: `${(s.distribution[n] / s.count) * 100}%` }} /></span>
                  <span className="w-6 text-right">{s.distribution[n]}</span>
                </li>
              ))}
            </ul>
          </div>
          <ul className={`space-y-3 ${loading ? 'opacity-60' : ''}`}>
            {items.map((r) => (
              <li key={r._id} className="rounded-2xl bg-primary/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink dark:text-white">{r.reviewer.name}</p>
                  <Stars value={r.rating} size={14} />
                </div>
                {r.comment && <p className="mt-1 text-sm text-ink dark:text-[#E8F1EB]">{r.comment}</p>}
                <p className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(r.createdAt)}</p>
              </li>
            ))}
          </ul>
          <Pagination page={meta.page} pages={meta.pages} onChange={setPage} />
        </>
      )}
    </section>
  );
}

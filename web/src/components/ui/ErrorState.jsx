import { RefreshCw, TriangleAlert } from 'lucide-react';
import GlassCard from '../glass/GlassCard';

export default function ErrorState({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <GlassCard role="alert" className="mx-auto max-w-xl text-center">
      <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-danger/10 text-danger">
        <TriangleAlert size={28} aria-hidden />
      </span>
      <h2 className="text-lg font-bold text-ink dark:text-white">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted dark:text-[#9FB2A7]">{error?.message || 'Please try again.'}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn btn-glass mt-4">
          <RefreshCw size={16} aria-hidden /> Try again
        </button>
      )}
    </GlassCard>
  );
}

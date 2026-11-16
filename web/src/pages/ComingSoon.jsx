import { useLocation } from 'react-router-dom';
import GlassCard from '../components/glass/GlassCard';

// Temporary placeholder for routes whose real pages land in later phases (see docs/tasklist.md).
export default function ComingSoon() {
  const { pathname } = useLocation();
  return (
    <div className="mx-auto max-w-2xl px-4 py-24">
      <GlassCard className="text-center">
        <h1 className="text-2xl font-bold text-ink dark:text-white">Coming soon</h1>
        <p className="mt-2 text-ink-muted dark:text-[#9FB2A7]">
          <code>{pathname}</code> is scheduled for a later development phase.
        </p>
      </GlassCard>
    </div>
  );
}

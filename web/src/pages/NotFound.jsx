import { Link } from 'react-router-dom';
import GlassCard from '../components/glass/GlassCard';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <GlassCard className="text-center">
        <h1 className="text-3xl font-bold text-ink dark:text-white">Page not found</h1>
        <p className="mt-2 text-ink-muted dark:text-[#9FB2A7]">The page you're looking for doesn't exist.</p>
        <Link to="/" className="btn btn-primary mt-6">Back to home</Link>
      </GlassCard>
    </div>
  );
}

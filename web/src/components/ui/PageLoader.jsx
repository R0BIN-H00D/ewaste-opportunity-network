export default function PageLoader({ label = 'Loading…' }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[40vh] items-center justify-center">
      <div className="skeleton h-3 w-40" aria-hidden />
      <span className="sr-only">{label}</span>
    </div>
  );
}

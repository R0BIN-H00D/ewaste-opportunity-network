export default function Skeleton({ className = '' }) {
  return <div aria-hidden className={`skeleton ${className}`} />;
}

/** The Green Score as a ring: how far through the current level, with the score in the middle. Read out in words for screen readers. */
export default function GreenRing({ score, level, size = 140 }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, Math.max(0, level?.progress ?? 0));
  const words = level?.next
    ? `Green Score ${score}, level ${level.name}, ${Math.max(0, level.next.min - score)} points to ${level.next.name}`
    : `Green Score ${score}, level ${level?.name || ''}, the highest level`;
  return (
    <svg role="img" aria-label={words} viewBox="0 0 120 120" width={size} height={size}>
      <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-primary/15 dark:stroke-primary-tint/20" />
      <circle
        cx="60" cy="60" r={radius} fill="none" strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${circumference * progress} ${circumference}`}
        transform="rotate(-90 60 60)"
        className="stroke-primary dark:stroke-primary-tint"
        data-testid="ring-progress"
      />
      <text x="60" y="68" textAnchor="middle" fontSize="30" fontWeight="800" className="fill-primary dark:fill-primary-tint">{score}</text>
    </svg>
  );
}

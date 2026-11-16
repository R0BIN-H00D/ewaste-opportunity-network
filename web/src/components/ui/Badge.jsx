const TONES = {
  neutral: 'bg-gray-500/15 text-ink dark:text-gray-200',
  green: 'bg-success/15 text-[#166534] dark:text-green-300',
  amber: 'bg-warning/15 text-[#92400E] dark:text-amber-300',
  red: 'bg-danger/15 text-danger dark:text-red-300',
  blue: 'bg-info/15 text-[#075985] dark:text-sky-300',
};

export default function Badge({ tone = 'neutral', children, className = '' }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]} ${className}`}>{children}</span>;
}

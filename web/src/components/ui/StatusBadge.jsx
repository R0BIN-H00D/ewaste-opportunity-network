const STYLES = {
  not_submitted: ['Not submitted', 'bg-gray-500/15 text-ink dark:text-gray-200'],
  pending: ['Pending review', 'bg-warning/15 text-[#92400E] dark:text-amber-300'],
  approved: ['Approved', 'bg-success/15 text-[#166534] dark:text-green-300'],
  rejected: ['Rejected', 'bg-danger/15 text-danger dark:text-red-300'],
  resubmission_required: ['Resubmission required', 'bg-danger/15 text-danger dark:text-red-300'],
};

export default function StatusBadge({ status }) {
  const [label, cls] = STYLES[status] || [status, STYLES.not_submitted[1]];
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${cls}`}>{label}</span>;
}

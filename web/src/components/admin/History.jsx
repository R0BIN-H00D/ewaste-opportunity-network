import { formatDate } from '../../lib/requests';
import { actionLabel } from '../../lib/admin';

/** What administrators did to this person or submission, newest first. */
export default function History({ items = [] }) {
  if (!items.length) return <p className="text-sm text-ink-muted dark:text-[#9FB2A7]">Nothing has been done here yet.</p>;
  return (
    <ol className="space-y-2">
      {items.map((h) => (
        <li key={h._id} className="rounded-xl border border-white/30 bg-white/30 px-3 py-2 text-sm dark:bg-white/5">
          <p className="font-semibold text-ink dark:text-white">{actionLabel(h.action)}</p>
          <p className="text-xs text-ink-muted dark:text-[#9FB2A7]">{formatDate(h.at)}{h.admin?.name ? ` · ${h.admin.name}` : ''}</p>
          {h.reason && <p className="mt-1 text-ink dark:text-[#E8F1EB]">{h.reason}</p>}
        </li>
      ))}
    </ol>
  );
}

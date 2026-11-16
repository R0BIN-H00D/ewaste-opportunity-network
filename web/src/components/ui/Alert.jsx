import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const STYLES = {
  error: { box: 'border-danger/40 bg-danger/10 text-danger dark:text-red-300', icon: AlertCircle, role: 'alert' },
  success: { box: 'border-success/40 bg-success/10 text-[#166534] dark:text-green-300', icon: CheckCircle2, role: 'status' },
  info: { box: 'border-info/40 bg-info/10 text-[#075985] dark:text-sky-300', icon: Info, role: 'status' },
};

export default function Alert({ variant = 'info', children, className = '' }) {
  if (!children) return null;
  const { box, icon: Icon, role } = STYLES[variant];
  return (
    <div role={role} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${box} ${className}`}>
      <Icon size={18} aria-hidden className="mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

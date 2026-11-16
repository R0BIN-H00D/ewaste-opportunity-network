import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Accessible dialog: Escape and backdrop close it, Tab stays inside, focus returns to the opener. */
export default function Modal({ open, onClose, title, children, footer, size = 'md' }) {
  const titleId = useId();
  const panel = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const first = panel.current?.querySelector(FOCUSABLE);
    (first || panel.current)?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const items = [...panel.current.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const [head, tail] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === head) {
        e.preventDefault();
        tail.focus();
      } else if (!e.shiftKey && document.activeElement === tail) {
        e.preventDefault();
        head.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  // Rendered on <body>: a frosted-glass ancestor (backdrop-filter) would otherwise trap `position: fixed` inside itself.
  return createPortal(
    <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: 'var(--scrim)' }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`glass-strong max-h-[90vh] w-full ${size === 'xl' ? 'max-w-3xl' : 'max-w-md'} overflow-y-auto p-6 !bg-[var(--c-surface-solid)]`}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-lg font-bold text-ink dark:text-white">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close dialog" className="rounded-lg p-1 text-ink-muted hover:text-ink dark:hover:text-white">
            <X size={20} aria-hidden />
          </button>
        </div>
        <div className="text-sm text-ink dark:text-[#E8F1EB]">{children}</div>
        {footer && <div className="mt-5 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

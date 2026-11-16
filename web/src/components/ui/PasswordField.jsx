import { forwardRef, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const PasswordField = forwardRef(function PasswordField({ label, error, hint, id, className = '', ...props }, ref) {
  const auto = useId();
  const inputId = id || auto;
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-ink dark:text-white">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className="input pr-12"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-ink-muted hover:text-ink dark:text-[#9FB2A7] dark:hover:text-white"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {hint && !error && (
        <p id={`${inputId}-hint`} className="mt-1 text-xs text-ink-muted dark:text-[#9FB2A7]">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${inputId}-error`} role="alert" className="mt-1 text-xs font-medium text-danger dark:text-red-300">
          {error}
        </p>
      )}
    </div>
  );
});

export default PasswordField;

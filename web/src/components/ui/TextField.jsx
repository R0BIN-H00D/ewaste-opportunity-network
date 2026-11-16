import { forwardRef, useId } from 'react';

/** Label + input + hint + inline error, wired for screen readers (aria-invalid / aria-describedby). */
const TextField = forwardRef(function TextField({ label, error, hint, id, as = 'input', className = '', children, ...props }, ref) {
  const Tag = as;
  const auto = useId();
  const inputId = id || auto;
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-ink dark:text-white">
        {label}
      </label>
      <Tag ref={ref} id={inputId} className="input" aria-invalid={error ? 'true' : undefined} aria-describedby={describedBy} {...props}>
        {children}
      </Tag>
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

export default TextField;

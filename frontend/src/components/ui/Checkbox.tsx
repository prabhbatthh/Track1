import { useId, type InputHTMLAttributes, type Ref } from 'react';
import { Check } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  ref?: Ref<HTMLInputElement>;
}

export function Checkbox({ ref, id, className, label, error, disabled, ...props }: CheckboxProps) {
  const generatedId = useId();
  const checkboxId = id ?? generatedId;
  const errorId = `${checkboxId}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label
        htmlFor={checkboxId}
        className={cn(
          'inline-flex items-center gap-2 text-sm text-foreground',
          disabled && 'cursor-not-allowed opacity-50',
        )}
      >
        <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
          <input
            ref={ref}
            id={checkboxId}
            type="checkbox"
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className={cn(
              'peer size-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-border bg-surface',
              'checked:border-primary checked:bg-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              'disabled:cursor-not-allowed',
              className,
            )}
            {...props}
          />
          <Check className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100" />
        </span>
        {label}
      </label>
      {error && (
        <p id={errorId} role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

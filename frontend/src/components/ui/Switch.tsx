import { useId } from 'react';

import { cn } from '@/lib/cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

export function Switch({ checked, onCheckedChange, disabled, label, id, className }: SwitchProps) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  const labelId = label ? `${switchId}-label` : undefined;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-sm text-foreground',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
    >
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        aria-label={label ? undefined : 'Toggle'}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
          checked ? 'bg-primary' : 'bg-border-muted',
          className,
        )}
      >
        <span
          className={cn(
            'absolute left-0 top-0.5 size-5 rounded-full bg-surface shadow transition-transform',
            checked ? 'translate-x-[22px]' : 'translate-x-0.5',
          )}
        />
      </button>
      {label && (
        <span id={labelId} onClick={disabled ? undefined : () => onCheckedChange(!checked)}>
          {label}
        </span>
      )}
    </span>
  );
}

import { cn } from '@/lib/cn';

export interface MenuToggleIconProps {
  open: boolean;
  duration?: number;
  className?: string;
}

export function MenuToggleIcon({ open, duration = 300, className }: MenuToggleIconProps) {
  const barStyle = { transitionDuration: `${duration}ms` };

  return (
    <span aria-hidden="true" className={cn('relative flex size-4 flex-col items-center justify-center', className)}>
      <span
        className="absolute h-0.5 w-4 rounded-full bg-current transition-transform ease-out"
        style={{ ...barStyle, transform: open ? 'rotate(45deg)' : 'translateY(-5px)' }}
      />
      <span
        className="absolute h-0.5 w-4 rounded-full bg-current transition-opacity ease-out"
        style={{ ...barStyle, opacity: open ? 0 : 1 }}
      />
      <span
        className="absolute h-0.5 w-4 rounded-full bg-current transition-transform ease-out"
        style={{ ...barStyle, transform: open ? 'rotate(-45deg)' : 'translateY(5px)' }}
      />
    </span>
  );
}

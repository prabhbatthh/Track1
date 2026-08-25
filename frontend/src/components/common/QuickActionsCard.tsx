import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface QuickAction {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
}

export interface QuickActionsCardProps {
  title?: string;
  actions: QuickAction[];
}

export function QuickActionsCard({ title, actions }: QuickActionsCardProps) {
  const { t } = useTranslation();

  if (actions.length === 0) return null;

  return (
    <div className="rounded-lg bg-ink p-6">
      <p className="text-lg font-semibold text-ink-foreground">
        {title ?? t('common.quickActionsTitle')}
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/6 p-3 text-left transition-all duration-150 hover:-translate-y-0.5 hover:bg-white/10 active:translate-y-0"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <action.icon className="size-4" />
            </span>
            <span className="text-sm font-medium text-ink-foreground">{action.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

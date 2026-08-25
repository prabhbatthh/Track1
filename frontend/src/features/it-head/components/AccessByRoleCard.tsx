import { KeyRound, Shield, ShieldCheck, UserCheck, Users, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import type { RoleBreakdownEntry } from '@/providers/AuthProvider';

const ROLE_ICONS: Record<string, LucideIcon> = {
  member: Users,
  guardian: ShieldCheck,
  manager: UserCheck,
  'it-head': KeyRound,
  admin: Shield,
};

const ROLE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
  member: { bg: 'bg-primary/10', text: 'text-primary', bar: 'bg-primary' },
  guardian: { bg: 'bg-info/10', text: 'text-info', bar: 'bg-info' },
  manager: { bg: 'bg-success/10', text: 'text-success', bar: 'bg-success' },
  'it-head': { bg: 'bg-purple-500/10', text: 'text-purple-600 dark:text-purple-300', bar: 'bg-purple-600' },
  admin: { bg: 'bg-danger/10', text: 'text-danger', bar: 'bg-danger' },
};

const ROLE_TIERS: Record<string, string> = {
  member: 'Standard',
  guardian: 'Guardian Tier',
  manager: 'Management',
  'it-head': 'System Lead',
  admin: 'Super Admin',
};

export function AccessByRoleCard({ roles }: { roles: RoleBreakdownEntry[] }) {
  const { t } = useTranslation();
  const activeRoles = roles.filter((r) => r.role !== 'librarian');
  const total = activeRoles.reduce((sum, r) => sum + r.count, 0);

  return (
    <Card className="flex h-full flex-col justify-between">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('itHead.accessByRole.title')}</CardTitle>
        <span className="text-xs font-semibold text-muted-foreground">
          {t('itHead.accessByRole.totalMembers', { count: total })}
        </span>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        {/* Full-width Proportional Segmented Stacked Bar */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-border bg-secondary/30 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">Role Distribution</span>
            <span>{activeRoles.length} Active Roles</span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary gap-0.5">
            {activeRoles.map((r) => {
              const widthPct = total > 0 ? (r.count / total) * 100 : 0;
              const colors = ROLE_COLORS[r.role] ?? { bar: 'bg-primary' };
              return (
                <div
                  key={r.role}
                  className={`h-full transition-all ${colors.bar}`}
                  style={{ width: `${Math.max(1.5, widthPct)}%` }}
                  title={`${r.role}: ${r.count} (${widthPct.toFixed(1)}%)`}
                />
              );
            })}
          </div>
        </div>

        {/* Detailed Role List with Icons, Permission Tiers & Badges */}
        <div className="flex flex-col divide-y divide-border/60">
          {activeRoles.map((r) => {
            const Icon = ROLE_ICONS[r.role] ?? Users;
            const colors = ROLE_COLORS[r.role] ?? {
              bg: 'bg-secondary',
              text: 'text-foreground',
              bar: 'bg-primary',
            };
            const percent = total > 0 ? ((r.count / total) * 100).toFixed(1) : '0';
            const tier = ROLE_TIERS[r.role] ?? 'Custom';

            return (
              <div
                key={r.role}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${colors.bg} ${colors.text}`}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">
                      {t(`itHead.accessByRole.roles.${r.role}`, { defaultValue: r.role })}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{tier}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="rounded-md bg-secondary/80 px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                    {percent}%
                  </span>
                  <span className="w-10 text-right text-sm font-bold text-foreground">
                    {r.count}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

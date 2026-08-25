import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { TrendLineChart } from '@/components/common';
import { Loader, Modal } from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatCurrency, formatMonth } from '@/lib/format';
import { useAuth, type MonthlyFigure } from '@/providers/AuthProvider';

export type StatKey = 'revenueMtd' | 'expensesMtd' | 'netProfitMtd' | 'totalMembers';

export interface StatTrendModalProps {
  statKey: StatKey | null;
  onClose: () => void;
}

const STAT_TITLE_KEYS: Record<StatKey, string> = {
  revenueMtd: 'admin.stats.revenueMtd',
  expensesMtd: 'admin.stats.expensesMtd',
  netProfitMtd: 'admin.stats.netProfitMtd',
  totalMembers: 'admin.stats.totalMembers',
};

const MONEY_FIELD: Record<Exclude<StatKey, 'totalMembers'>, keyof MonthlyFigure> = {
  revenueMtd: 'revenue',
  expensesMtd: 'expenses',
  netProfitMtd: 'net_profit',
};

const MONEY_COLOR: Record<Exclude<StatKey, 'totalMembers'>, string> = {
  revenueMtd: 'var(--color-primary)',
  expensesMtd: 'var(--color-danger)',
  netProfitMtd: 'var(--color-success)',
};

function MoneyTrendBody({ statKey, months }: { statKey: Exclude<StatKey, 'totalMembers'>; months: MonthlyFigure[] }) {
  const { t } = useTranslation();
  const field = MONEY_FIELD[statKey];

  return (
    <div className="flex flex-col gap-4">
      <TrendLineChart
        data={months.map((m) => ({ label: formatMonth(m.month), value: m[field] as number }))}
        color={MONEY_COLOR[statKey]}
        valueFormatter={formatCurrency}
        ariaLabel={t(STAT_TITLE_KEYS[statKey])}
        axisPrefix="₹"
      />
      <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        {months.map((m) => (
          <div key={m.month} className="flex items-center justify-between">
            <span className="text-foreground">{formatMonth(m.month)}</span>
            <span
              className={cn(
                'font-medium text-foreground',
                statKey === 'netProfitMtd' && (m.net_profit >= 0 ? 'text-success' : 'text-danger'),
              )}
            >
              {formatCurrency(m[field] as number)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MembersTrendBody({
  months,
}: {
  months: { month: string; new_members: number; total_members: number }[];
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-4">
      <TrendLineChart
        data={months.map((m) => ({ label: formatMonth(m.month), value: m.total_members }))}
        color="var(--color-info)"
        ariaLabel={t(STAT_TITLE_KEYS.totalMembers)}
      />
      <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-sm">
        {months.map((m) => (
          <div key={m.month} className="flex items-center justify-between">
            <span className="text-foreground">{formatMonth(m.month)}</span>
            <span className="text-muted-foreground">
              {t('admin.reports.membershipGrowthLabels.newMembers', { count: m.new_members })}
              {' · '}
              {t('admin.reports.membershipGrowthLabels.totalMembers', { count: m.total_members })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Mounted fresh via `key={statKey}` in StatTrendModal so each stat gets its own loading state.
function StatTrendBody({ statKey }: { statKey: StatKey }) {
  const { t } = useTranslation();
  const { getProfitAndLossReport, getMembershipGrowthReport } = useAuth();
  const [content, setContent] = useState<ReactNode | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<ReactNode> {
      if (statKey === 'totalMembers') {
        const report = await getMembershipGrowthReport();
        return <MembersTrendBody months={report.months} />;
      }
      const report = await getProfitAndLossReport();
      return <MoneyTrendBody statKey={statKey} months={report.months} />;
    }

    load()
      .then((node) => !cancelled && setContent(node))
      .catch(() => !cancelled && setHasError(true));

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statKey]);

  if (hasError) {
    return <p className="text-sm text-danger">{t('common.errors.generic')}</p>;
  }

  if (!content) {
    return (
      <div className="flex justify-center py-8">
        <Loader />
      </div>
    );
  }

  return <>{content}</>;
}

export function StatTrendModal({ statKey, onClose }: StatTrendModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={statKey !== null}
      onClose={onClose}
      title={statKey ? t(STAT_TITLE_KEYS[statKey]) : undefined}
      className="max-w-lg"
    >
      {statKey && <StatTrendBody key={statKey} statKey={statKey} />}
    </Modal>
  );
}

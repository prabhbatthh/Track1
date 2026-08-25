import { useTranslation } from 'react-i18next';

import { MultiLineTrendChart } from '@/components/common';
import { Modal } from '@/components/ui';
import { formatWeekday } from '@/lib/format';
import type { ManagerDashboardStats } from '@/providers/AuthProvider';

export interface LibraryActivityModalProps {
  open: boolean;
  onClose: () => void;
  activity: ManagerDashboardStats['library_activity'];
}

export function LibraryActivityModal({ open, onClose, activity }: LibraryActivityModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('managerDashboard.libraryActivity.title', { defaultValue: 'Library Activity (Last 7 Days)' })}
    >
      <div className="flex flex-col gap-4 py-2">
        <MultiLineTrendChart
          ariaLabel={t('managerDashboard.libraryActivity.title', { defaultValue: 'Library Activity (Last 7 Days)' })}
          showPointLabels
          data={activity.map((day) => ({
            label: formatWeekday(day.date),
            values: { issued: day.issued, returned: day.returned },
          }))}
          series={[
            {
              key: 'issued',
              label: t('managerDashboard.libraryActivity.issued', { defaultValue: 'Books Issued' }),
              color: 'var(--color-primary)',
            },
            {
              key: 'returned',
              label: t('managerDashboard.libraryActivity.returned', { defaultValue: 'Books Returned' }),
              color: 'var(--color-info)',
            },
          ]}
        />
      </div>
    </Modal>
  );
}

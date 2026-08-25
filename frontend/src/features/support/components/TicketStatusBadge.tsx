import { useTranslation } from 'react-i18next';

import { Badge, type BadgeVariant } from '@/components/ui';
import type { SupportTicketStatus } from '@/providers/AuthProvider';

const STATUS_VARIANT: Record<SupportTicketStatus, BadgeVariant> = {
  open: 'warning',
  resolved: 'info',
  closed: 'success',
};

export function TicketStatusBadge({ status }: { status: SupportTicketStatus }) {
  const { t } = useTranslation();
  return <Badge variant={STATUS_VARIANT[status]}>{t(`support.status.${status}`)}</Badge>;
}

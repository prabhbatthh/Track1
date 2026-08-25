import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ExportButton } from '@/components/common';
import { Badge, EmptyState, Loader, Modal } from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAuth, type PaymentRecord } from '@/providers/AuthProvider';

export interface ChildPaymentHistoryModalProps {
  childId: string | null;
  childName: string;
  onClose: () => void;
}

function PaymentHistoryBody({ childId }: { childId: string }) {
  const { t } = useTranslation();
  const { getChildPayments } = useAuth();
  const [payments, setPayments] = useState<PaymentRecord[] | null>(null);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getChildPayments(childId)
      .then((result) => !cancelled && setPayments(result))
      .catch(() => !cancelled && setHasError(true));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId]);

  if (hasError) {
    return <p className="text-sm text-danger">{t('common.errors.generic')}</p>;
  }

  if (payments === null) {
    return (
      <div className="flex justify-center py-8">
        <Loader />
      </div>
    );
  }

  if (payments.length === 0) {
    return (
      <EmptyState
        title={t('guardian.paymentHistory.empty.title')}
        description={t('guardian.paymentHistory.empty.description')}
      />
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {payments.map((payment) => (
          <li
            key={payment.id}
            className="flex items-center justify-between gap-2 rounded-lg border border-border p-3 text-sm"
          >
            <div>
              <p className="font-medium text-foreground">{payment.label}</p>
              <p className="text-xs text-muted-foreground">{formatDate(payment.created_at)}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-foreground">{formatCurrency(payment.amount)}</span>
              <Badge variant={payment.status === 'success' ? 'success' : 'outline'}>
                {payment.status}
              </Badge>
            </div>
          </li>
        ))}
      </ul>
      <ExportButton
        className="mt-4"
        filename="child-payment-history"
        title={t('guardian.paymentHistory.title')}
        headers={[
          t('profile.paymentHistory.table.label'),
          t('profile.paymentHistory.table.amount'),
          t('profile.paymentHistory.table.status'),
          t('profile.paymentHistory.table.date'),
        ]}
        rows={payments.map((payment) => [
          payment.label,
          formatCurrency(payment.amount),
          payment.status,
          formatDate(payment.created_at),
        ])}
      />
    </>
  );
}

export function ChildPaymentHistoryModal({
  childId,
  childName,
  onClose,
}: ChildPaymentHistoryModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={childId !== null}
      onClose={onClose}
      title={`${t('guardian.paymentHistory.title')} — ${childName}`}
    >
      {childId && <PaymentHistoryBody key={childId} childId={childId} />}
    </Modal>
  );
}

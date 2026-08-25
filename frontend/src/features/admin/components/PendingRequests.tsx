import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Pagination, TableToolbar } from '@/components/common';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog } from '@/components/ui';
import { usePagination } from '@/hooks';
import { getErrorMessage } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAuth, type BillingRequestRecord, type BillingRequestType } from '@/providers/AuthProvider';

const typeLabelKey: Record<BillingRequestType, string> = {
  refund: 'admin.pendingRequests.types.refundRequest',
  fee_waiver: 'admin.pendingRequests.types.feeWaiverRequest',
};

type PendingAction = { request: BillingRequestRecord; kind: 'approve' | 'reject' };

export interface PendingRequestsProps {
  requests: BillingRequestRecord[];
  onDecided: () => void;
}

// Financial actions get a confirmation step since approving/rejecting money requests
// shouldn't be a single misclick.
export function PendingRequests({ requests, onDecided }: PendingRequestsProps) {
  const { t } = useTranslation();
  const { approveBillingRequest, rejectBillingRequest } = useAuth();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [isDeciding, setIsDeciding] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortValue, setSortValue] = useState('newest');

  const filteredRequests = useMemo(() => {
    const items = [...requests].filter((request) => {
      const statusMatches = statusFilter === 'all' || request.status === statusFilter;
      const typeMatches = typeFilter === 'all' || request.type === typeFilter;
      return statusMatches && typeMatches;
    });

    switch (sortValue) {
      case 'oldest':
        return items.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      case 'amount-high':
        return items.sort((a, b) => b.amount - a.amount);
      case 'amount-low':
        return items.sort((a, b) => a.amount - b.amount);
      case 'member':
        return items.sort((a, b) => a.member_name.localeCompare(b.member_name));
      case 'newest':
      default:
        return items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
  }, [requests, statusFilter, typeFilter, sortValue]);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(filteredRequests, 5);

  async function confirm() {
    if (!pendingAction) return;
    const { request, kind } = pendingAction;
    setIsDeciding(true);
    try {
      await (kind === 'approve' ? approveBillingRequest : rejectBillingRequest)(request.id);
      toast.success(
        t(
          kind === 'approve' ? 'admin.pendingRequests.approveToast' : 'admin.pendingRequests.rejectToast',
          { name: request.member_name },
        ),
      );
      setPendingAction(null);
      onDecided();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsDeciding(false);
    }
  }

  function resetToolbar() {
    setStatusFilter('all');
    setTypeFilter('all');
    setSortValue('newest');
    setPage(1);
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>{t('admin.pendingRequests.title')}</CardTitle>
        <TableToolbar
          variant="icon-only"
          filters={[
            {
              label: t('admin.pendingRequests.filters.statusLabel'),
              value: statusFilter,
              onChange: (value) => {
                setStatusFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('admin.pendingRequests.filters.statusOptions.all') },
                { value: 'pending', label: t('admin.pendingRequests.filters.statusOptions.pending') },
                { value: 'approved', label: t('admin.pendingRequests.filters.statusOptions.approved') },
                { value: 'rejected', label: t('admin.pendingRequests.filters.statusOptions.rejected') },
              ],
            },
            {
              label: t('admin.pendingRequests.filters.typeLabel'),
              value: typeFilter,
              onChange: (value) => {
                setTypeFilter(value);
                setPage(1);
              },
              options: [
                { value: 'all', label: t('admin.pendingRequests.filters.typeOptions.all') },
                { value: 'refund', label: t(typeLabelKey.refund) },
                { value: 'fee_waiver', label: t(typeLabelKey.fee_waiver) },
              ],
            },
          ]}
          sort={{
            label: t('common.actions.sort'),
            value: sortValue,
            onChange: (value) => {
              setSortValue(value);
              setPage(1);
            },
            options: [
              { value: 'newest', label: t('admin.pendingRequests.sort.newestFirst') },
              { value: 'oldest', label: t('admin.pendingRequests.sort.oldestFirst') },
              { value: 'amount-high', label: t('admin.pendingRequests.sort.amountHighToLow') },
              { value: 'amount-low', label: t('admin.pendingRequests.sort.amountLowToHigh') },
              { value: 'member', label: t('admin.pendingRequests.sort.memberName') },
            ],
          }}
          onReset={resetToolbar}
          resetLabel={t('common.actions.reset')}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">

        {filteredRequests.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t('common.emptyState.noResults')}
          </div>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {paginatedItems.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-col gap-2 rounded-lg border border-border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{t(typeLabelKey[request.type])}</Badge>
                      <span className="font-medium text-foreground">
                        ₹{request.amount.toLocaleString('en-IN')}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatDate(request.created_at)}</span>
                    </div>
                    <p className="mt-1 text-sm text-foreground">{request.reason}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('admin.pendingRequests.from', { name: request.member_name })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => setPendingAction({ request, kind: 'reject' })}
                    >
                      {t('common.actions.reject')}
                    </Button>
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => setPendingAction({ request, kind: 'approve' })}
                    >
                      {t('common.actions.approve')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={5}
              onPageChange={setPage}
            />
          </>
        )}
      </CardContent>

      <Dialog
        open={pendingAction !== null}
        onClose={() => setPendingAction(null)}
        onConfirm={confirm}
        isConfirming={isDeciding}
        title={t(
          pendingAction?.kind === 'reject'
            ? 'admin.pendingRequests.confirmRejectTitle'
            : 'admin.pendingRequests.confirmApproveTitle',
        )}
        description={
          pendingAction
            ? t('admin.pendingRequests.confirmDescription', {
                name: pendingAction.request.member_name,
                amount: `₹${pendingAction.request.amount.toLocaleString('en-IN')}`,
              })
            : undefined
        }
        confirmLabel={t(
          pendingAction?.kind === 'reject' ? 'common.actions.reject' : 'common.actions.approve',
        )}
        confirmVariant={pendingAction?.kind === 'reject' ? 'danger' : 'success'}
      />
    </Card>
  );
}

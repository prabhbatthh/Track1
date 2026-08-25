import { useTranslation } from 'react-i18next';

import { Pagination } from '@/components/common';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { usePagination } from '@/hooks';
import { comingSoonToast } from '@/lib/comingSoonToast';
import type { WalkInRequest } from '@/mocks/manager';

export interface WalkInAssistanceProps {
  requests: WalkInRequest[];
  onBookSeat?: () => void;
  onIssueBook?: () => void;
}

// Front-desk queue: members who show up without an online seat/book
// reservation. The manager takes their email and completes it for them.
export function WalkInAssistance({ requests, onBookSeat, onIssueBook }: WalkInAssistanceProps) {
  const { t } = useTranslation();
  const sortedRequests = [...requests].sort(
    (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
  );

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(sortedRequests, 5);

  function handleAction(request: WalkInRequest) {
    const toastKey = request.type === 'seat' ? 'bookSeatToast' : 'issueBookToast';
    comingSoonToast(t(`managerDashboard.walkIns.${toastKey}`, { name: request.memberName }));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('managerDashboard.walkIns.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sortedRequests.length === 0 ? (
          <EmptyState
            title={t('managerDashboard.walkIns.emptyTitle')}
            description={t('managerDashboard.walkIns.emptyDescription')}
            action={
              onBookSeat && (
                <Button size="sm" onClick={onBookSeat}>
                  {t('managerDashboard.walkIns.bookSeat')}
                </Button>
              )
            }
            secondaryAction={
              onIssueBook && (
                <Button size="sm" variant="outline" onClick={onIssueBook}>
                  {t('managerDashboard.walkIns.issueBook')}
                </Button>
              )
            }
          />
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
                      <Badge variant="outline">
                        {t(`managerDashboard.walkIns.${request.type === 'seat' ? 'seatBadge' : 'bookBadge'}`)}
                      </Badge>
                      <p className="text-sm font-medium text-foreground">{request.memberName}</p>
                    </div>
                    <p className="text-xs text-muted-foreground">{request.memberEmail}</p>
                    <p className="text-xs text-muted-foreground">{request.detail}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('managerDashboard.walkIns.requestedAt', { time: request.requestedAt })}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => handleAction(request)}>
                    {t(`managerDashboard.walkIns.${request.type === 'seat' ? 'bookSeat' : 'issueBook'}`)}
                  </Button>
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
    </Card>
  );
}

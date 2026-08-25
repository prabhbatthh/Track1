import { SearchX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ExportButton, PageHeader, Pagination } from '@/components/common';
import { NoResults } from '@/components/feedback';
import {
  Avatar,
  Badge,
  SearchBar,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui';
import { formatCurrency, formatDate } from '@/lib/format';
import { useDebouncedFetch } from '@/lib/useDebouncedFetch';
import { useAuth, type AdminPaymentRecord } from '@/providers/AuthProvider';

const PAGE_SIZE = 20;
// Above the usual page size — export pulls the whole filtered month in one request
// rather than just the 20 rows currently on screen.
const EXPORT_PAGE_SIZE = 1000;
const EMPTY_PAYMENT_LIST = { items: [] as AdminPaymentRecord[], total: 0 };

export function AdminPaymentsPage() {
  const { t } = useTranslation();
  const { getAdminPayments } = useAuth();
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const [page, setPage] = useState(1);

  const { data } = useDebouncedFetch(
    () => getAdminPayments({ search, month: month || undefined, page, page_size: PAGE_SIZE }),
    [search, month, page, getAdminPayments],
    EMPTY_PAYMENT_LIST,
  );
  const { items, total } = data;

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1);
  }

  function updateMonth(value: string) {
    setMonth(value);
    setPage(1);
  }

  async function loadExportRows() {
    const result = await getAdminPayments({
      search,
      month: month || undefined,
      page: 1,
      page_size: EXPORT_PAGE_SIZE,
    });
    return result.items.map((payment) => [
      payment.member_name,
      payment.member_email,
      formatCurrency(payment.amount),
      payment.label,
      payment.status,
      formatDate(payment.created_at),
    ]);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('admin.payments.pageTitle')}
        description={t('admin.payments.pageDescription')}
      />

      {/* Styled Filter & Search Toolbar Container matching Admin Members page */}
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <SearchBar
          value={search}
          onChange={updateSearch}
          placeholder={t('admin.payments.searchPlaceholder')}
          className="max-w-sm"
        />

        <div className="flex flex-wrap items-center gap-2.5">
          <input
            type="month"
            value={month}
            onChange={(event) => updateMonth(event.target.value)}
            className="h-9 min-w-0 rounded-lg border border-border bg-secondary/50 px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label={t('admin.payments.monthFilter')}
          />
          <ExportButton
            filename="payments-report"
            title={t('admin.payments.pageTitle')}
            headers={[
              t('admin.payments.table.member'),
              t('admin.payments.table.email'),
              t('admin.payments.table.amount'),
              t('admin.payments.table.label'),
              t('admin.payments.table.status'),
              t('admin.payments.table.date'),
            ]}
            rows={loadExportRows}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <NoResults
          icon={SearchX}
          title={t('admin.payments.empty.title')}
          description={t('admin.payments.empty.description')}
        />
      ) : (
        <>
          <div className="w-full overflow-x-auto rounded-xl border border-border bg-card shadow-xs">
            <Table className="min-w-full">
              <TableHeader className="bg-secondary/20">
                <TableRow>
                  <TableHead className="whitespace-nowrap px-3 py-2.5">{t('admin.payments.table.member')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2.5">{t('admin.payments.table.amount')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2.5">{t('admin.payments.table.label')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2.5">{t('admin.payments.table.status')}</TableHead>
                  <TableHead className="whitespace-nowrap px-3 py-2.5 text-right">{t('admin.payments.table.date')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((payment) => (
                  <TableRow key={payment.id} className="transition-colors hover:bg-secondary/40">
                    <TableCell className="px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <Avatar name={payment.member_name} size="sm" />
                        <div>
                          <p className="font-semibold text-foreground text-xs sm:text-sm">{payment.member_name}</p>
                          <p className="text-xs text-muted-foreground">{payment.member_email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2.5 font-semibold text-foreground text-xs sm:text-sm">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2.5 text-xs text-foreground font-medium">
                      {payment.label}
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2.5">
                      <Badge variant={payment.status === 'success' ? 'success' : 'outline'}>
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap px-3 py-2.5 text-right text-xs text-muted-foreground">
                      {formatDate(payment.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

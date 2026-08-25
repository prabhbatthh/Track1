import { Download, LogIn, LogOut, UserCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Pagination } from '@/components/common';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState } from '@/components/ui';
import { usePagination } from '@/hooks';
import { getErrorMessage } from '@/lib/api';
import { downloadCsv } from '@/lib/export';
import { formatDate } from '@/lib/format';
import {
  useAuth,
  type LibraryVisitRecord,
  type MemberSummary,
} from '@/providers/AuthProvider';

import { MemberPicker } from './MemberPicker';

export function CheckInCheckOutCard() {
  const { t } = useTranslation();
  const { checkInMember, checkOutMember, getCurrentlyInLibrary } = useAuth();
  const [selectedMember, setSelectedMember] = useState<MemberSummary | null>(null);
  const [activeVisits, setActiveVisits] = useState<LibraryVisitRecord[]>([]);
  const [isLoadingVisits, setIsLoadingVisits] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { page, setPage, totalPages, paginatedItems, totalItems } = usePagination(activeVisits, 5);

  const refreshActiveVisits = useCallback(async () => {
    try {
      const visits = await getCurrentlyInLibrary();
      setActiveVisits(visits);
    } catch {
      setActiveVisits([]);
    }
  }, [getCurrentlyInLibrary]);

  useEffect(() => {
    let cancelled = false;
    getCurrentlyInLibrary()
      .then((visits) => {
        if (!cancelled) setActiveVisits(visits);
      })
      .catch(() => {
        if (!cancelled) setActiveVisits([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingVisits(false);
      });
    return () => {
      cancelled = true;
    };
  }, [getCurrentlyInLibrary]);

  const selectedVisit = selectedMember
    ? activeVisits.find((v) => v.member_id === selectedMember.id)
    : null;
  const isSelectedInside = Boolean(selectedVisit);

  async function handleCheckIn() {
    if (!selectedMember) return;
    setIsSubmitting(true);
    try {
      await checkInMember(selectedMember.id);
      toast.success(`${selectedMember.full_name} checked in successfully`);
      await refreshActiveVisits();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to check in member'));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCheckOut(memberId: string, memberName: string) {
    setIsSubmitting(true);
    try {
      await checkOutMember(memberId);
      toast.success(`${memberName} checked out successfully`);
      await refreshActiveVisits();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to check out member'));
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleExportCsv() {
    if (activeVisits.length === 0) {
      toast.info('No members currently in the library to export.');
      return;
    }

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const filename = `library-currently-present-${todayStr}.csv`;
      const headers = ['Member ID', 'Member Name', 'Email', 'Check-In Date', 'Check-In Time', 'Status'];

      const rows = activeVisits.map((visit) => {
        const d = new Date(visit.checked_in_at);
        const dateStr = d.toLocaleDateString('en-CA');
        const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        return [
          visit.member_id,
          visit.member_name,
          visit.member_email,
          dateStr,
          timeStr,
          'Currently in Library',
        ];
      });

      downloadCsv(filename, headers, rows);
      toast.success(`Exported ${activeVisits.length} currently present member(s) to CSV`);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to export CSV report'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCheck className="size-5 text-primary" />
          {t('managerDashboard.checkInCheckOut.title', { defaultValue: 'Library Check-In / Check-Out' })}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-lg border border-primary/20 bg-primary/10 p-4">
          <MemberPicker
            selectedMember={selectedMember}
            onSelect={setSelectedMember}
            label={t('managerDashboard.checkInCheckOut.selectMember', { defaultValue: 'Select Member for Check-In / Check-Out' })}
            searchPlaceholder={t('managerDashboard.checkInCheckOut.searchPlaceholder', { defaultValue: 'Search member by name or email…' })}
            changeLabel={t('common.change', { defaultValue: 'Change' })}
            noResultsLabel={t('common.noResults', { defaultValue: 'No members found' })}
            role="member"
            activeOnly
          />

          {selectedMember && (
            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between border-t border-border">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Current Status:{' '}
                  <Badge variant={isSelectedInside ? 'success' : 'outline'}>
                    {isSelectedInside ? 'Currently Inside' : 'Outside'}
                  </Badge>
                </p>
                {selectedVisit && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Checked in at: {formatDate(selectedVisit.checked_in_at)}
                  </p>
                )}
              </div>
              {isSelectedInside ? (
                <Button
                  variant="outline"
                  leadingIcon={<LogOut className="size-4" />}
                  disabled={isSubmitting}
                  onClick={() => handleCheckOut(selectedMember.id, selectedMember.full_name)}
                >
                  Check Out
                </Button>
              ) : (
                <Button
                  leadingIcon={<LogIn className="size-4" />}
                  disabled={isSubmitting}
                  onClick={handleCheckIn}
                >
                  Check In
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <span>Currently in Library</span>
              <Badge variant="outline">{activeVisits.length}</Badge>
            </h3>
            <Button
              size="sm"
              variant="outline"
              disabled={activeVisits.length === 0}
              onClick={handleExportCsv}
              aria-label="Export CSV"
              title={activeVisits.length === 0 ? 'No members currently in the library to export' : 'Export CSV report of members currently present'}
            >
              <Download className="size-4" />
            </Button>
          </div>

          {isLoadingVisits ? (
            <p className="text-xs text-muted-foreground">Loading active visits…</p>
          ) : activeVisits.length === 0 ? (
            <EmptyState
              title="No members inside"
              description="No members are currently checked into the library."
            />
          ) : (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2">
                {paginatedItems.map((visit) => (
                  <li
                    key={visit.id}
                    className="flex flex-col gap-2 rounded-lg border border-border p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="font-medium text-foreground">{visit.member_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {visit.member_email} · Checked in at {formatDate(visit.checked_in_at)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      leadingIcon={<LogOut className="size-3.5" />}
                      disabled={isSubmitting}
                      onClick={() => handleCheckOut(visit.member_id, visit.member_name)}
                    >
                      Check Out
                    </Button>
                  </li>
                ))}
              </ul>
              <Pagination
                currentPage={page}
                totalPages={totalPages}
                onPageChange={setPage}
                totalItems={totalItems}
                pageSize={5}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { Button, Card, CardContent, CardHeader, CardTitle, ConfirmDialog } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { useAuth, type GuardianContact, type MemberSummary } from '@/providers/AuthProvider';

import { MemberPicker } from './MemberPicker';

// Manager-side guardian management: link a student to a guardian, see who they're
// currently linked to, swap that guardian out, or remove the link entirely.
export function AddGuardianCard() {
  const { t } = useTranslation();
  const { linkGuardian, setGuardian, unlinkGuardian, getStudentGuardian } = useAuth();
  const [selectedStudent, setSelectedStudent] = useState<MemberSummary | null>(null);
  const [selectedGuardian, setSelectedGuardian] = useState<MemberSummary | null>(null);
  // Kept as {studentId, guardian} rather than a bare guardian + loading flag: picking a
  // different student then makes "we haven't loaded this one yet" derivable, so the effect
  // never needs a synchronous setState to clear stale data.
  const [fetched, setFetched] = useState<{
    studentId: string;
    guardian: GuardianContact | null;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);

  const isCurrentFor = selectedStudent !== null && fetched?.studentId === selectedStudent.id;
  const currentGuardian = isCurrentFor ? (fetched?.guardian ?? null) : null;
  const isLoadingCurrent = selectedStudent !== null && !isCurrentFor;

  async function refreshCurrent(studentId: string) {
    try {
      setFetched({ studentId, guardian: await getStudentGuardian(studentId) });
    } catch {
      setFetched({ studentId, guardian: null });
    }
  }

  // Whenever a student is picked, show who they're already linked to — that's what turns
  // this from "add" into "change/remove", and it decides which verb submit uses below.
  useEffect(() => {
    if (!selectedStudent) return;
    let cancelled = false;
    const studentId = selectedStudent.id;
    getStudentGuardian(studentId)
      .then((data) => {
        if (!cancelled) setFetched({ studentId, guardian: data });
      })
      .catch(() => {
        if (!cancelled) setFetched({ studentId, guardian: null });
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStudent, getStudentGuardian]);

  async function onSubmit() {
    if (!selectedStudent || !selectedGuardian) return;
    setIsSubmitting(true);
    try {
      const payload = {
        student_email: selectedStudent.email,
        guardian_email: selectedGuardian.email,
      };
      // PUT replaces an existing link; POST stays a strict create so an accidental
      // double-link on an unlinked student still surfaces as a conflict.
      if (currentGuardian) {
        await setGuardian(payload);
        toast.success(
          t('managerDashboard.addGuardian.updatedToast', {
            studentEmail: selectedStudent.email,
            guardianEmail: selectedGuardian.email,
          }),
        );
      } else {
        await linkGuardian(payload);
        toast.success(
          t('managerDashboard.addGuardian.successToast', {
            studentEmail: selectedStudent.email,
            guardianEmail: selectedGuardian.email,
          }),
        );
      }
      await refreshCurrent(selectedStudent.id);
      setSelectedGuardian(null);
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onRemove() {
    if (!selectedStudent) return;
    setIsRemoving(true);
    try {
      await unlinkGuardian(selectedStudent.id);
      toast.success(
        t('managerDashboard.addGuardian.removedToast', {
          studentEmail: selectedStudent.email,
        }),
      );
      setFetched({ studentId: selectedStudent.id, guardian: null });
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    } finally {
      setIsRemoving(false);
      setRemoveConfirmOpen(false);
    }
  }

  const canSubmit = selectedStudent !== null && selectedGuardian !== null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('managerDashboard.addGuardian.title')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          {t('managerDashboard.addGuardian.description')}
        </p>

        {selectedStudent && !isLoadingCurrent && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
            {currentGuardian ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t('managerDashboard.addGuardian.currentGuardian')}
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {currentGuardian.full_name}
                  </p>
                  <p className="text-sm text-muted-foreground">{currentGuardian.email}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  isLoading={isRemoving}
                  onClick={() => setRemoveConfirmOpen(true)}
                  className="w-fit"
                >
                  {t('managerDashboard.addGuardian.remove')}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t('managerDashboard.addGuardian.noGuardianYet')}
              </p>
            )}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <MemberPicker
            className="flex-1"
            selectedMember={selectedStudent}
            onSelect={setSelectedStudent}
            role="member"
            activeOnly
            label={t('managerDashboard.addGuardian.studentEmailLabel')}
            searchPlaceholder={t('managerDashboard.addGuardian.studentEmailPlaceholder')}
            changeLabel={t('managerDashboard.billingRequest.changeMember')}
            noResultsLabel={t('managerDashboard.billingRequest.noMembersFound')}
          />
          <MemberPicker
            className="flex-1"
            selectedMember={selectedGuardian}
            onSelect={setSelectedGuardian}
            role="guardian"
            activeOnly
            label={t('managerDashboard.addGuardian.guardianEmailLabel')}
            searchPlaceholder={t('managerDashboard.addGuardian.guardianEmailPlaceholder')}
            changeLabel={t('managerDashboard.billingRequest.changeMember')}
            noResultsLabel={t('managerDashboard.billingRequest.noMembersFound')}
          />
          <Button
            type="button"
            isLoading={isSubmitting}
            disabled={!canSubmit}
            onClick={onSubmit}
            className="w-fit"
          >
            {currentGuardian
              ? t('managerDashboard.addGuardian.update')
              : t('managerDashboard.addGuardian.submit')}
          </Button>
        </div>
      </CardContent>

      <ConfirmDialog
        open={removeConfirmOpen}
        title={t('managerDashboard.addGuardian.removeConfirmTitle')}
        description={t('managerDashboard.addGuardian.removeConfirmDescription', {
          guardianEmail: currentGuardian?.email ?? '',
          studentEmail: selectedStudent?.email ?? '',
        })}
        confirmLabel={t('managerDashboard.addGuardian.remove')}
        cancelLabel={t('common.actions.cancel')}
        onConfirm={onRemove}
        onCancel={() => setRemoveConfirmOpen(false)}
        isLoading={isRemoving}
        destructive
      />
    </Card>
  );
}

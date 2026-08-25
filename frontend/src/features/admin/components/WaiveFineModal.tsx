import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { ListRow } from '@/components/common';
import { Button, Input, Modal, Textarea } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { useAuth, type MemberSummary } from '@/providers/AuthProvider';

const AMOUNT_PATTERN = /^[1-9]\d*$/;
const SEARCH_DEBOUNCE_MS = 300;

const waiveFineSchema = z.object({
  amount: z.string().regex(AMOUNT_PATTERN, { message: 'Enter a whole number greater than 0' }),
  reason: z.string().trim().min(1, { message: 'Enter a reason for this waiver' }),
});

type WaiveFineFormValues = z.infer<typeof waiveFineSchema>;

export interface WaiveFineModalProps {
  open: boolean;
  onClose: () => void;
  onWaived: () => void;
}

// Admin acting directly — no separate approval step, since the admin filing this
// is also the one who'd otherwise approve it (see billing_requests.service.waive_fine).
export function WaiveFineModal({ open, onClose, onWaived }: WaiveFineModalProps) {
  const { t } = useTranslation();
  const { waiveFine, searchMembers } = useAuth();
  const [selectedMember, setSelectedMember] = useState<MemberSummary | null>(null);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberResults, setMemberResults] = useState<MemberSummary[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WaiveFineFormValues>({
    resolver: zodResolver(waiveFineSchema),
    values: { amount: '', reason: '' },
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelectedMember(null);
      setMemberQuery('');
      setMemberResults([]);
    }
  }

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      searchMembers(memberQuery)
        .then((members) => !cancelled && setMemberResults(members))
        .catch(() => !cancelled && setMemberResults([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberQuery]);

  async function onSubmit(values: WaiveFineFormValues) {
    if (!selectedMember) return;
    try {
      await waiveFine({
        member_id: selectedMember.id,
        amount: Number(values.amount),
        reason: values.reason,
      });
      toast.success(t('admin.waiveFine.successToast', { name: selectedMember.full_name }));
      reset();
      onWaived();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  const canSubmit = selectedMember !== null;

  return (
    <Modal open={open} onClose={onClose} title={t('admin.waiveFine.title')}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium text-foreground">{t('admin.waiveFine.memberLabel')}</p>
          {selectedMember ? (
            <ListRow
              title={selectedMember.full_name}
              subtitle={selectedMember.email}
              action={
                <button
                  type="button"
                  onClick={() => setSelectedMember(null)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {t('admin.waiveFine.changeMember')}
                </button>
              }
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <Input
                value={memberQuery}
                onChange={(event) => setMemberQuery(event.target.value)}
                placeholder={t('admin.waiveFine.memberSearchPlaceholder')}
                autoFocus
              />
              {memberResults.length > 0 && (
                <ul className="flex flex-col gap-1 rounded-md border border-border bg-surface p-1 shadow-panel">
                  {memberResults.map((member) => (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMember(member);
                          setMemberQuery('');
                          setMemberResults([]);
                        }}
                        className="flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left hover:bg-secondary"
                      >
                        <span className="text-sm font-medium text-foreground">{member.full_name}</span>
                        <span className="text-xs text-muted-foreground">{member.email}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {memberQuery.trim().length > 0 && memberResults.length === 0 && (
                <p className="px-1 text-xs text-muted-foreground">
                  {t('admin.waiveFine.noMembersFound')}
                </p>
              )}
            </div>
          )}
        </div>

        <Input
          label={t('admin.waiveFine.amountLabel')}
          inputMode="numeric"
          pattern="[0-9]*"
          error={errors.amount?.message}
          {...register('amount')}
        />

        <Textarea
          id="waive-fine-reason"
          label={t('admin.waiveFine.reasonLabel')}
          rows={3}
          error={errors.reason?.message}
          {...register('reason')}
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting} disabled={!canSubmit}>
            {t('admin.waiveFine.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

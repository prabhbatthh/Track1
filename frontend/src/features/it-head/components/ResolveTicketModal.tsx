import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button, Modal, Textarea } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { useAuth, type SupportTicketRecord } from '@/providers/AuthProvider';

const resolveSchema = z.object({
  resolution_note: z.string().trim().min(1, { message: 'Enter a resolution note' }),
});

type ResolveFormValues = z.infer<typeof resolveSchema>;

export interface ResolveTicketModalProps {
  ticket: SupportTicketRecord | null;
  onClose: () => void;
  onResolved: () => void;
}

export function ResolveTicketModal({ ticket, onClose, onResolved }: ResolveTicketModalProps) {
  const { t } = useTranslation();
  const { resolveSupportTicket } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ResolveFormValues>({
    resolver: zodResolver(resolveSchema),
    values: { resolution_note: '' },
  });

  async function onSubmit(values: ResolveFormValues) {
    if (!ticket) return;
    try {
      await resolveSupportTicket(ticket.id, values);
      toast.success(t('itHead.issueResolution.resolveToast', { name: ticket.raised_by_name }));
      reset();
      onResolved();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  return (
    <Modal open={ticket !== null} onClose={onClose} title={t('itHead.issueResolution.resolve')}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {ticket && <p className="text-sm text-muted-foreground">{ticket.description}</p>}
        <Textarea
          id="resolution-note"
          label={t('itHead.issueResolution.resolutionNoteLabel')}
          rows={3}
          error={errors.resolution_note?.message}
          {...register('resolution_note')}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('itHead.issueResolution.resolve')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

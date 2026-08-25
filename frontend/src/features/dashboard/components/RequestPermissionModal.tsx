import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button, Input, Modal, Textarea } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

const requestPermissionSchema = z.object({
  permission: z.string().trim().min(1, { message: 'Enter what you need permission for' }),
  reason: z.string().trim().min(1, { message: 'Enter a reason' }),
});

type RequestPermissionFormValues = z.infer<typeof requestPermissionSchema>;

export interface RequestPermissionModalProps {
  open: boolean;
  onClose: () => void;
}

export function RequestPermissionModal({ open, onClose }: RequestPermissionModalProps) {
  const { t } = useTranslation();
  const { createPermissionRequest } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RequestPermissionFormValues>({
    resolver: zodResolver(requestPermissionSchema),
    values: { permission: '', reason: '' },
  });

  async function onSubmit(values: RequestPermissionFormValues) {
    try {
      await createPermissionRequest(values);
      toast.success(t('managerDashboard.requestPermission.successToast'));
      reset();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('managerDashboard.requestPermission.title')}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label={t('managerDashboard.requestPermission.permissionLabel')}
          placeholder={t('managerDashboard.requestPermission.permissionPlaceholder')}
          error={errors.permission?.message}
          {...register('permission')}
        />
        <Textarea
          id="permission-reason"
          label={t('managerDashboard.requestPermission.reasonLabel')}
          rows={3}
          error={errors.reason?.message}
          {...register('reason')}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('managerDashboard.requestPermission.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

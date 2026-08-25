import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button, Input, Modal } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { PASSWORD_PATTERN, PHONE_PATTERN } from '@/lib/authSchema';
import { isValidEmail } from '@/lib/email';
import { useAuth } from '@/providers/AuthProvider';

const inviteMemberSchema = z.object({
  fullName: z.string().trim().min(1, { message: 'admin.inviteMember.errors.name' }),
  email: z.string().refine(isValidEmail, { message: 'admin.inviteMember.errors.email' }),
  phone: z
    .string()
    .optional()
    .refine((value) => !value || PHONE_PATTERN.test(value), {
      message: 'admin.inviteMember.errors.phone',
    }),
  password: z.string().regex(PASSWORD_PATTERN, { message: 'admin.inviteMember.errors.password' }),
});

type InviteMemberFormValues = z.infer<typeof inviteMemberSchema>;

export interface InviteMemberModalProps {
  open: boolean;
  onClose: () => void;
  onInvited: () => void;
}

// Direct account creation, not a real email-invite flow — no email sending exists in
// this stack yet. The admin sets an initial password and shares it with the member.
export function InviteMemberModal({ open, onClose, onInvited }: InviteMemberModalProps) {
  const { t } = useTranslation();
  const { createMember } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteMemberFormValues>({
    resolver: zodResolver(inviteMemberSchema),
    values: { fullName: '', email: '', phone: '', password: '' },
  });

  async function onSubmit(values: InviteMemberFormValues) {
    try {
      const member = await createMember({
        full_name: values.fullName,
        email: values.email,
        phone: values.phone || undefined,
        password: values.password,
      });
      toast.success(t('admin.inviteMember.successToast', { name: member.full_name }));
      reset();
      onInvited();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('admin.inviteMember.title')}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label={t('admin.inviteMember.fullNameLabel')}
          error={errors.fullName?.message ? t(errors.fullName.message) : undefined}
          {...register('fullName')}
        />
        <Input
          label={t('admin.inviteMember.emailLabel')}
          type="email"
          error={errors.email?.message ? t(errors.email.message) : undefined}
          {...register('email')}
        />
        <Input
          label={t('admin.inviteMember.phoneLabel')}
          type="tel"
          placeholder={t('auth.register.phoneNumberPlaceholder')}
          error={errors.phone?.message ? t(errors.phone.message) : undefined}
          {...register('phone')}
        />
        <Input
          label={t('admin.inviteMember.passwordLabel')}
          type="password"
          error={errors.password?.message ? t(errors.password.message) : undefined}
          {...register('password')}
        />
        <p className="text-xs text-muted-foreground">{t('admin.inviteMember.passwordHint')}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.actions.cancel')}
          </Button>
          <Button type="submit" isLoading={isSubmitting}>
            {t('admin.inviteMember.submit')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

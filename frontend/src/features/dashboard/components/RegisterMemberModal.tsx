import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button, Input, Modal, Select } from '@/components/ui';
import { getErrorMessage } from '@/lib/api';
import { PASSWORD_PATTERN } from '@/lib/authSchema';
import { isValidEmail } from '@/lib/email';
import { useAuth } from '@/providers/AuthProvider';

// Exactly 10 digits, starting with 6-9 (Indian mobile).
const PHONE_PATTERN = /^[6-9]\d{9}$/;

const registerMemberSchema = z.object({
  name: z.string().trim().min(1, { message: 'managerDashboard.registerMember.errors.name' }),
  email: z.string().refine(isValidEmail, { message: 'managerDashboard.registerMember.errors.email' }),
  phoneNumber: z
    .string()
    .regex(PHONE_PATTERN, { message: 'managerDashboard.registerMember.errors.phoneNumber' }),
  password: z
    .string()
    .regex(PASSWORD_PATTERN, { message: 'managerDashboard.registerMember.errors.password' }),
  membershipPlan: z.enum(['basic', 'standard', 'premium']),
});

export type RegisterMemberFormValues = z.infer<typeof registerMemberSchema>;

export interface RegisterMemberModalProps {
  open: boolean;
  onClose: () => void;
  onRegistered: () => void;
  /** Pre-fills from a pending online registration request being completed at the counter. */
  initialValues?: { name: string; email: string };
}

export function RegisterMemberModal({
  open,
  onClose,
  onRegistered,
  initialValues,
}: RegisterMemberModalProps) {
  const { t } = useTranslation();
  const { createMember } = useAuth();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<RegisterMemberFormValues>({
    resolver: zodResolver(registerMemberSchema),
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
      password: '',
      membershipPlan: 'basic',
    },
  });

  // Re-seed the form every time the modal opens, so a request's name/email
  // pre-fill it when provided and a blank form starts clean otherwise.
  useEffect(() => {
    if (!open) return;
    reset({
      name: initialValues?.name ?? '',
      email: initialValues?.email ?? '',
      phoneNumber: '',
      password: '',
      membershipPlan: 'basic',
    });
  }, [open, initialValues, reset]);

  async function onValid(values: RegisterMemberFormValues) {
    try {
      const member = await createMember({
        full_name: values.name,
        email: values.email,
        phone: values.phoneNumber,
        password: values.password,
      });
      toast.success(t('managerDashboard.registerMember.successToast', { name: member.full_name }));
      onRegistered();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('managerDashboard.registerMember.title')}>
      <form onSubmit={handleSubmit(onValid)} className="flex flex-col gap-4">
        <Input
          label={t('managerDashboard.registerMember.nameLabel')}
          placeholder={t('managerDashboard.registerMember.namePlaceholder')}
          error={errors.name?.message ? t(errors.name.message) : undefined}
          {...register('name')}
        />
        <Input
          type="email"
          label={t('managerDashboard.registerMember.emailLabel')}
          placeholder={t('managerDashboard.registerMember.emailPlaceholder')}
          error={errors.email?.message ? t(errors.email.message) : undefined}
          {...register('email')}
        />
        <Input
          type="tel"
          label={t('managerDashboard.registerMember.phoneLabel')}
          placeholder="9876543210"
          maxLength={10}
          error={errors.phoneNumber?.message ? t(errors.phoneNumber.message) : undefined}
          {...register('phoneNumber', {
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
              e.target.value = digits;
              setValue('phoneNumber', digits, { shouldValidate: true });
            },
          })}
        />
        <Input
          type="password"
          label={t('managerDashboard.registerMember.passwordLabel')}
          error={errors.password?.message ? t(errors.password.message) : undefined}
          {...register('password')}
        />
        <p className="text-xs text-muted-foreground">
          {t('managerDashboard.registerMember.passwordHint')}
        </p>
        <Select
          label={t('managerDashboard.registerMember.planLabel')}
          error={errors.membershipPlan?.message ? t(errors.membershipPlan.message) : undefined}
          options={[
            { value: 'basic', label: t('dashboard.membershipPlans.basic') },
            { value: 'standard', label: t('dashboard.membershipPlans.standard') },
            { value: 'premium', label: t('dashboard.membershipPlans.premium') },
          ]}
          {...register('membershipPlan')}
        />
        <Button type="submit" isLoading={isSubmitting}>
          {t('managerDashboard.registerMember.submit')}
        </Button>
      </form>
    </Modal>
  );
}

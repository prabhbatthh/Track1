import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Button, Input } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/lib/api';
import { resetPasswordSchema, type ResetPasswordFormValues } from '@/lib/authSchema';
import { useAuth } from '@/providers/AuthProvider';

function InvalidLink() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold text-foreground">
        {t('auth.resetPassword.invalidTitle')}
      </h1>
      <p className="text-sm text-muted-foreground">{t('auth.resetPassword.invalidDescription')}</p>
      <Link to={ROUTES.FORGOT_PASSWORD} className="font-medium text-primary hover:underline">
        {t('auth.resetPassword.requestNewLink')}
      </Link>
    </div>
  );
}

export function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [invalid, setInvalid] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  async function onSubmit(values: ResetPasswordFormValues) {
    if (!token) return;
    try {
      await resetPassword({ token, password: values.password });
      toast.success(t('auth.resetPassword.successToast'));
      navigate(ROUTES.LOGIN);
    } catch (err) {
      // A 400 here specifically means the reset link is invalid/expired (see
      // backend's InvalidResetToken) — any other failure gets the generic toast.
      if (getErrorMessage(err, '') === 'Invalid or expired reset link') {
        setInvalid(true);
      } else {
        toast.error(getErrorMessage(err, t('common.errors.generic')));
      }
    }
  }

  if (!token || invalid) {
    return <InvalidLink />;
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t('auth.resetPassword.title')}</h1>
        <p className="text-muted-foreground">{t('auth.resetPassword.subtitle')}</p>
      </div>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label={t('auth.register.password')}
          type="password"
          autoComplete="new-password"
          error={errors.password?.message ? t(errors.password.message) : undefined}
          {...register('password')}
        />
        <Input
          label={t('auth.register.confirmPassword')}
          type="password"
          autoComplete="new-password"
          error={errors.confirmPassword?.message ? t(errors.confirmPassword.message) : undefined}
          {...register('confirmPassword')}
        />
        <Button type="submit" isLoading={isSubmitting}>
          {t('auth.resetPassword.submit')}
        </Button>
      </form>
    </div>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button, Input } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/lib/api';
import { forgotPasswordSchema, type ForgotPasswordFormValues } from '@/lib/authSchema';
import { useAuth } from '@/providers/AuthProvider';

export function ForgotPassword() {
  const { t } = useTranslation();
  const { forgotPassword } = useAuth();
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    try {
      await forgotPassword(values.email);
      setSubmitted(true);
    } catch (err) {
      toast.error(getErrorMessage(err, t('common.errors.generic')));
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
        <h1 className="text-2xl font-semibold text-foreground">
          {t('auth.forgotPassword.successTitle')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('auth.forgotPassword.successDescription')}
        </p>
        <Link to={ROUTES.LOGIN} className="font-medium text-primary hover:underline">
          {t('auth.forgotPassword.backToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {t('auth.forgotPassword.title')}
        </h1>
        <p className="text-muted-foreground">{t('auth.forgotPassword.subtitle')}</p>
      </div>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label={t('auth.login.email')}
          type="email"
          autoComplete="email"
          error={errors.email?.message ? t(errors.email.message) : undefined}
          {...register('email')}
        />
        <Button type="submit" isLoading={isSubmitting}>
          {t('auth.forgotPassword.submit')}
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">
        <Link to={ROUTES.LOGIN} className="font-medium text-primary hover:underline">
          {t('auth.forgotPassword.backToLogin')}
        </Link>
      </p>
    </div>
  );
}

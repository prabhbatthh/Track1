import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, BookOpen, Shield, User } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button, Checkbox, Input, Select } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/lib/api';
import { registerSchema, type RegisterFormValues } from '@/lib/authSchema';
import { getRegistrationAvatarPresets } from '@/lib/avatarPresets';
import { usePlanOptions } from '@/lib/planOptions';
import { useAuth } from '@/providers/AuthProvider';

export function Register() {
  const { t } = useTranslation();
  const { registerAccount } = useAuth();
  const { options: planOptions, isLoading: isLoadingPlans } = usePlanOptions();
  const [step, setStep] = useState<'details' | 'role_avatar_plan'>('details');

  const {
    register,
    handleSubmit,
    setValue,
    trigger,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      accountType: 'member',
      name: '',
      email: '',
      phoneNumber: '',
      password: '',
      confirmPassword: '',
      membershipPlan: '1m',
      avatarUrl: '',
      acceptTerms: false,
    },
  });

  const accountType = watch('accountType');
  const selectedAvatar = watch('avatarUrl');

  const avatarPresets = getRegistrationAvatarPresets(accountType);

  // Default to first preset avatar if none selected
  useEffect(() => {
    if (avatarPresets.length > 0 && !selectedAvatar) {
      setValue('avatarUrl', avatarPresets[0], { shouldValidate: true });
    }
  }, [accountType, avatarPresets, selectedAvatar, setValue]);

  async function handleProceedToStep2() {
    const isValid = await trigger(['name', 'email', 'phoneNumber', 'password', 'confirmPassword', 'acceptTerms']);
    if (isValid) {
      setStep('role_avatar_plan');
    }
  }

  async function onSubmit(values: RegisterFormValues) {
    try {
      if (values.accountType === 'guardian') {
        await registerAccount(
          {
            email: values.email,
            password: values.password,
            full_name: values.name,
            phone: values.phoneNumber,
            role: 'guardian',
            avatar_url: values.avatarUrl,
          },
          ROUTES.DASHBOARD,
        );
      } else {
        const plan = planOptions.find((option) => option.value === values.membershipPlan);
        const paymentRedirect = `${ROUTES.PAYMENT}?plan=${values.membershipPlan || '1m'}&label=${encodeURIComponent(plan?.label ?? '')}`;
        await registerAccount(
          {
            email: values.email,
            password: values.password,
            full_name: values.name,
            phone: values.phoneNumber,
            role: 'member',
            avatar_url: values.avatarUrl,
          },
          paymentRedirect,
        );
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Registration failed'));
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {step === 'details' ? t('auth.register.title') : 'Role & Profile Setup'}
        </h1>
      </div>

      <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
        {step === 'details' ? (
          <>
            {/* Step 1: Basic Details (First Screen) */}
            <Input
              label={t('auth.register.fullName')}
              autoComplete="name"
              error={errors.name?.message ? t(errors.name.message) : undefined}
              {...register('name')}
            />
            <Input
              label={t('auth.register.email')}
              type="email"
              autoComplete="email"
              error={errors.email?.message ? t(errors.email.message) : undefined}
              {...register('email')}
            />
            <Input
              label={t('auth.register.phoneNumber')}
              type="tel"
              autoComplete="tel"
              placeholder={t('auth.register.phoneNumberPlaceholder')}
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

            <Checkbox
              label={t('auth.register.terms')}
              error={errors.acceptTerms?.message ? t(errors.acceptTerms.message) : undefined}
              {...register('acceptTerms')}
            />

            <Button type="button" onClick={handleProceedToStep2}>
              Proceed
            </Button>
          </>
        ) : (
          <>
            {/* Step 2: Role, Avatar, & Membership Plan (After Step 1 submission/proceed) */}

            {/* 1. Member vs Guardian Selection */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-foreground">
                Are you a Member or a Guardian?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setValue('accountType', 'member', { shouldValidate: true });
                    if (!watch('membershipPlan')) setValue('membershipPlan', '1m');
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center transition-all ${
                    accountType === 'member'
                      ? 'border-primary bg-primary/10 font-semibold text-primary ring-2 ring-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <BookOpen className="size-6" />
                  <div className="text-sm font-medium">Member</div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setValue('accountType', 'guardian', { shouldValidate: true });
                    setValue('membershipPlan', undefined);
                  }}
                  className={`flex flex-col items-center justify-center gap-2 rounded-lg border p-4 text-center transition-all ${
                    accountType === 'guardian'
                      ? 'border-primary bg-primary/10 font-semibold text-primary ring-2 ring-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <Shield className="size-6" />
                  <div className="text-sm font-medium">Guardian</div>
                </button>
              </div>
            </div>

            {/* 2. Choose Your Avatar */}
            {avatarPresets.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-card/50 p-4">
                <label className="text-sm font-medium text-foreground flex items-center gap-1.5">
                  <User className="size-4 text-primary" /> Choose your avatar
                </label>
                <div className="flex items-center gap-3 py-1">
                  {avatarPresets.map((preset, idx) => {
                    const isSelected = selectedAvatar === preset;
                    return (
                      <button
                        key={preset + idx}
                        type="button"
                        onClick={() => setValue('avatarUrl', preset, { shouldValidate: true })}
                        className={`relative size-12 rounded-full overflow-hidden border-2 transition-all focus:outline-none ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background scale-105'
                            : 'border-transparent opacity-75 hover:opacity-100'
                        }`}
                      >
                        <img src={preset} alt="Avatar option" className="size-full object-cover" />
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground italic">
                  You can change your avatar later from your profile.
                </p>
              </div>
            )}

            {/* 3. Membership Plan Selection (Only for Members) */}
            {accountType === 'member' && (
              <Select
                label={t('auth.register.membershipPlan')}
                disabled={isLoadingPlans}
                error={errors.membershipPlan?.message ? t(errors.membershipPlan.message) : undefined}
                options={planOptions.map(({ value, label }) => ({ value, label }))}
                {...register('membershipPlan')}
              />
            )}

            <div className="flex items-center gap-3 pt-2">
              <Button type="button" variant="outline" onClick={() => setStep('details')}>
                <ArrowLeft className="size-4 mr-1" /> Back
              </Button>
              <Button
                type="submit"
                className="flex-1"
                isLoading={isSubmitting}
                disabled={accountType === 'member' && isLoadingPlans}
              >
                {t('auth.register.createAccount')}
              </Button>
            </div>
          </>
        )}
      </form>

      <p className="text-sm text-muted-foreground">
        {t('auth.register.alreadyHaveAccount')}{' '}
        <Link to={ROUTES.LOGIN} className="font-medium text-primary hover:underline">
          {t('auth.register.logIn')}
        </Link>
      </p>
    </div>
  );
}

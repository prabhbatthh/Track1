import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { Button, Input } from '@/components/ui';
import { ROUTES } from '@/constants/routes';
import { getErrorMessage } from '@/lib/api';
import { loginSchema, type LoginFormValues } from '@/lib/authSchema';
import { renderGoogleSignInButton } from '@/lib/googleIdentity';
import { useAuth, type Role } from '@/providers/AuthProvider';

const ROLES: Role[] = ['admin', 'member', 'manager', 'librarian', 'it-head', 'guardian'];
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const DEMO_ROLE_LOGIN_ENABLED =
  import.meta.env.DEV || import.meta.env.MODE === 'e2e' || import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

function GoogleIcon() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}

export function Login() {
  const { t } = useTranslation();
  const { login, loginWithCredentials, loginWithGoogleToken } = useAuth();
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);

  async function signInAs(role: Role) {
    try {
      await login(role);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not preview this role'));
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || !googleButtonRef.current) return;
    renderGoogleSignInButton(googleButtonRef.current, GOOGLE_CLIENT_ID, (idToken) => {
      loginWithGoogleToken(idToken).catch((err: unknown) => {
        toast.error(getErrorMessage(err, 'Google sign-in failed'));
      });
    }).catch(() => toast.error('Could not load Google sign-in'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(values: LoginFormValues) {
    try {
      await loginWithCredentials(values.email, values.password);
    } catch (err) {
      toast.error(getErrorMessage(err, 'Log in failed'));
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4 p-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t('auth.login.title')}</h1>
      </div>

      <form className="flex flex-col gap-3" onSubmit={handleSubmit(onSubmit)} noValidate>
        <Input
          label={t('auth.login.email')}
          type="email"
          autoComplete="email"
          error={errors.email?.message ? t(errors.email.message) : undefined}
          {...register('email')}
        />
        <div className="relative">
          <Input
            label={t('auth.login.password')}
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            error={errors.password?.message ? t(errors.password.message) : undefined}
            className="pr-10"
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-8 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        <Link
          to={ROUTES.FORGOT_PASSWORD}
          className="self-end text-sm font-medium text-primary hover:underline"
        >
          {t('auth.login.forgotPassword')}
        </Link>
        <Button type="submit" isLoading={isSubmitting}>
          {t('auth.login.logInWithPassword')}
        </Button>
      </form>

      <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        {t('auth.login.or')}
        <div className="h-px flex-1 bg-border" />
      </div>

      {GOOGLE_CLIENT_ID ? (
        <div ref={googleButtonRef} className="flex justify-center" />
      ) : (
        <Button
          type="button"
          variant="outline"
          className="flex w-full items-center justify-center gap-2 font-medium"
          onClick={() => {
            toast.info('Google Sign-In requires VITE_GOOGLE_CLIENT_ID configured in your environment.');
          }}
        >
          <GoogleIcon />
          <span>Continue with Google</span>
        </Button>
      )}

      {DEMO_ROLE_LOGIN_ENABLED && (
        <>
          <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            {t('auth.login.orPreviewRole')}
            <div className="h-px flex-1 bg-border" />
          </div>

          {ROLES.map((role) => (
            <Button
              key={role}
              variant="outline"
              className="justify-start capitalize"
              onClick={() => signInAs(role)}
            >
              {t('auth.login.continueAs', { role: t(`auth.login.roles.${role}`) })}
            </Button>
          ))}
        </>
      )}
    </div>
  );
}

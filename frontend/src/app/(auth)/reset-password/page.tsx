'use client';

import { useState, Suspense, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Gamepad2, Lock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { z } from 'zod';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { resetPassword } from '@/lib/api/auth';

const resetSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirmPassword?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <Card elevation="raised">
        <CardContent className="p-6 md:p-8 flex flex-col items-center text-center gap-3">
          <XCircle className="h-10 w-10 text-error" />
          <h2 className="font-heading text-h2 text-text-primary">Invalid link</h2>
          <p className="text-body text-text-secondary">
            This reset link is missing its token. Request a new one from the login page.
          </p>
          <Link href="/forgot-password" className="mt-2">
            <Button variant="primary" size="md">Request new link</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const result = resetSchema.safeParse({ password, confirmPassword });
    if (!result.success) {
      const errs: { password?: string; confirmPassword?: string } = {};
      result.error.issues.forEach((err) => {
        errs[err.path[0] as keyof typeof errs] = err.message;
      });
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setError(null);
    setIsLoading(true);

    try {
      await resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => router.push('/login'), 2500);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setError(errorObj?.message || 'This reset link is invalid or has expired. Please request a new one.');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <Card elevation="raised">
        <CardContent className="p-6 md:p-8 flex flex-col items-center text-center gap-3">
          <CheckCircle2 className="h-10 w-10 text-success" />
          <h2 className="font-heading text-h2 text-text-primary">Password reset</h2>
          <p className="text-body text-text-secondary">Taking you to sign in...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation="raised">
      <CardContent className="p-6 md:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <h2 className="font-heading text-h2 text-text-primary">Set a new password</h2>
            <p className="text-body text-text-secondary mt-0.5">
              Choose a new password for your account.
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">
              {error}
            </div>
          )}

          <Input
            label="New Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            required
            autoComplete="new-password"
            error={fieldErrors.password}
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            required
            autoComplete="new-password"
            error={fieldErrors.confirmPassword}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            loadingText="Resetting..."
            className="mt-2"
          >
            Reset password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-float mb-3">
          <Gamepad2 className="h-7 w-7" />
        </div>
        <h1 className="font-heading text-display text-text-primary">KHEL-O</h1>
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}

'use client';

import { useState, Suspense, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Gamepad2, Mail, Lock, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { login } from '@/lib/api/auth';
import { useAuthStore } from '@/store/authStore';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { getBookingIntent, clearBookingIntent } from '@/lib/bookingIntent';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect');

  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ email?: string; password?: string }>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.issues.forEach(err => {
        fieldErrors[err.path[0] as keyof typeof fieldErrors] = err.message;
      });
      setValidationErrors(fieldErrors);
      return;
    }
    
    setValidationErrors({});
    setError(null);
    setIsLoading(true);

    try {
      const res = await login({ email, password });
      setAuth(res.user, res.accessToken, res.refreshToken);

      if (redirectPath) {
        clearBookingIntent();
        router.push(redirectPath);
      } else {
        // No ?redirect= — the app may have crashed mid-navigation before it
        // could attach one (see global-error.tsx). Fall back to a booking
        // intent persisted in localStorage, which survives a crash + reload.
        const intent = getBookingIntent();
        if (intent) {
          clearBookingIntent();
          router.push(intent.returnPath);
          return;
        }
        switch (res.user.role) {
          case 'cafe_owner':
          case 'staff':
            router.push('/owner/dashboard');
            break;
          case 'admin':
            router.push('/admin');
            break;
          default:
            router.push('/');
            break;
        }
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      setError(errorObj?.message || 'Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card elevation="raised">
      <CardContent className="p-6 md:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <h2 className="font-heading text-h2 text-text-primary">Sign in</h2>
            <p className="text-body text-text-secondary mt-0.5">
              Access your bookings and gaming passes
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">
              {error}
            </div>
          )}

          <Input
            label="Email Address"
            type="email"
            placeholder="name@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon={<Mail className="h-4 w-4" />}
            required
            autoComplete="email"
            error={validationErrors.email}
          />

          <div>
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              leftIcon={<Lock className="h-4 w-4" />}
              required
              autoComplete="current-password"
              error={validationErrors.password}
            />
            <div className="mt-1.5 text-right">
              <Link
                href="/forgot-password"
                className="text-caption font-semibold text-primary hover:underline transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          </div>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            loadingText="Signing in..."
            className="mt-2"
          >
            Sign In
          </Button>

          <div className="flex items-center gap-3 py-1">
            <div className="h-px flex-1 bg-border" />
            <span className="text-caption text-text-tertiary">or</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <GoogleSignInButton
            redirectPath={redirectPath}
            onError={(message) => setError(message)}
          />
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-float mb-3">
          <Gamepad2 className="h-7 w-7" />
        </div>
        <h1 className="font-heading text-display text-text-primary">KHEL-O</h1>
        <p className="text-body text-text-secondary mt-1">
          Book PC & console gaming cafés near you
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>

      {/* Footer Link */}
      <p className="text-center text-body text-text-secondary mt-6">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="font-semibold text-primary hover:underline transition-colors"
        >
          Create an account
        </Link>
      </p>
    </div>
  );
}

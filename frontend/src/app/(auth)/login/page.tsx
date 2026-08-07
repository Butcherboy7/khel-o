'use client';

import { useState, Suspense, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Gamepad2, Mail, Lock, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { login } from '@/lib/api/auth';
import { useAuthStore } from '@/store/authStore';

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
        router.push(redirectPath);
      } else {
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
        </form>

        {/* Google OAuth Login Placeholder */}
        <div className="mt-6 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            size="lg"
            fullWidth
            onClick={() => alert('Google OAuth sign-in will be enabled upon domain deployment.')}
            className="gap-2"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24">
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
            <span>Continue with Google</span>
          </Button>
        </div>
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
          India&apos;s Premier Gaming Café Marketplace
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

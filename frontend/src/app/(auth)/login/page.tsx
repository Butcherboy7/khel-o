'use client';

import { useState, Suspense, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Gamepad2, Mail, Lock, ShieldCheck, Store, UserCheck, Loader2 } from 'lucide-react';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { login } from '@/lib/api/auth';
import { useAuthStore } from '@/store/authStore';
import type { UserRole } from '@/types';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect');

  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }

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
    } catch (err: any) {
      setError(err?.message || 'Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const fillDemo = (role: UserRole) => {
    switch (role) {
      case 'gamer':
        setEmail('gamer@khelo.com');
        setPassword('Gamer123!');
        break;
      case 'cafe_owner':
        setEmail('owner@khelo.com');
        setPassword('Owner123!');
        break;
      case 'admin':
        setEmail('admin@khelo.com');
        setPassword('Admin123!');
        break;
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

        {/* Quick Demo Credentials Switcher */}
        <div className="mt-6 border-t border-border pt-4">
          <p className="text-overline text-text-secondary uppercase tracking-wider font-semibold text-center mb-3">
            Quick Fill Demo Accounts
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fillDemo('gamer')}
              className="gap-1 text-caption"
            >
              <UserCheck className="h-3.5 w-3.5" />
              <span>Gamer</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fillDemo('cafe_owner')}
              className="gap-1 text-caption"
            >
              <Store className="h-3.5 w-3.5" />
              <span>Owner</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fillDemo('admin')}
              className="gap-1 text-caption"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Admin</span>
            </Button>
          </div>
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

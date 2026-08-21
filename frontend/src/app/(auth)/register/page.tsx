'use client';

import { useState, Suspense, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Gamepad2, Mail, Lock, User, Phone, Loader2 } from 'lucide-react';
import { z } from 'zod';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { register } from '@/lib/api/auth';
import { useAuthStore } from '@/store/authStore';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { getBookingIntent, clearBookingIntent } from '@/lib/bookingIntent';

const registerSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  phoneNumber: z.string().regex(/^(\+91|0)?[6-9]\d{9}$/, 'Please enter a valid Indian phone number'),
});

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectPath = searchParams.get('redirect');

  const setAuth = useAuthStore((s) => s.setAuth);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<{ fullName?: string; email?: string; password?: string; phoneNumber?: string }>({});
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    const result = registerSchema.safeParse({ fullName, email, password, phoneNumber });
    if (!result.success) {
      const fieldErrors: { fullName?: string; email?: string; password?: string; phoneNumber?: string } = {};
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
      const res = await register({
        fullName,
        email,
        password,
        phoneNumber: phoneNumber || undefined,
      });
      setAuth(res.user, res.accessToken, res.refreshToken);

      if (redirectPath) {
        clearBookingIntent();
        router.push(redirectPath);
      } else {
        // No ?redirect= — fall back to a booking intent persisted in
        // localStorage, which survives a crash + reload (see
        // global-error.tsx) that could otherwise drop the query param.
        const intent = getBookingIntent();
        if (intent) {
          clearBookingIntent();
          router.push(intent.returnPath);
        } else {
          router.push('/');
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please check your inputs.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card elevation="raised">
      <CardContent className="p-6 md:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <h2 className="font-heading text-h2 text-text-primary">Create Account</h2>
            <p className="text-body text-text-secondary mt-0.5">
              Book stations, get discounts, and join events
            </p>
          </div>

          {error && (
            <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">
              {error}
            </div>
          )}

          <Input
            label="Full Name *"
            type="text"
            placeholder="e.g. Rahul Sharma"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            leftIcon={<User className="h-4 w-4" />}
            required
            error={validationErrors.fullName}
          />

          <Input
            label="Email Address *"
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
            label="Phone Number *"
            type="tel"
            placeholder="+91 98765 43210"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            leftIcon={<Phone className="h-4 w-4" />}
            hint="Used for booking updates and offers"
            required
            error={validationErrors.phoneNumber}
          />

          <Input
            label="Password *"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            required
            autoComplete="new-password"
            error={validationErrors.password}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
            loadingText="Creating account..."
            className="mt-2"
          >
            Register Account
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

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-float mb-3">
          <Gamepad2 className="h-7 w-7" />
        </div>
        <h1 className="font-heading text-display text-text-primary">KHEL-O</h1>
        <p className="text-body text-text-secondary mt-1">
          Join India&apos;s Premier Gaming Network
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <RegisterForm />
      </Suspense>

      {/* Footer Link */}
      <p className="text-center text-body text-text-secondary mt-6">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-semibold text-primary hover:underline transition-colors"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

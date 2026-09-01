'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Gamepad2, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { forgotPassword } from '@/lib/api/auth';

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    const result = emailSchema.safeParse({ email });
    if (!result.success) {
      setFieldError(result.error.issues[0]?.message);
      return;
    }
    setFieldError(undefined);
    setIsLoading(true);

    try {
      await forgotPassword(email);
    } catch {
      // Backend never reveals whether the email exists — treat any response as success.
    } finally {
      setIsLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-float mb-3">
          <Gamepad2 className="h-7 w-7" />
        </div>
        <h1 className="font-heading text-display text-text-primary">KHEL-O</h1>
      </div>

      <Card elevation="raised">
        <CardContent className="p-6 md:p-8">
          {submitted ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-col items-center text-center gap-3 py-2"
            >
              <CheckCircle2 className="h-10 w-10 text-success" />
              <h2 className="font-heading text-h2 text-text-primary">Check your inbox</h2>
              <p className="text-body text-text-secondary">
                If <strong>{email}</strong> is registered with KHEL-O, we&apos;ve sent a link to reset your password. It expires in 30 minutes.
              </p>
              <Link href="/login" className="mt-2">
                <Button variant="ghost" size="md" className="gap-1.5">
                  <ArrowLeft className="h-4 w-4" />
                  Back to sign in
                </Button>
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <h2 className="font-heading text-h2 text-text-primary">Forgot your password?</h2>
                <p className="text-body text-text-secondary mt-0.5">
                  Enter the email on your account and we&apos;ll send you a reset link.
                </p>
              </div>

              <Input
                label="Email Address"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon={<Mail className="h-4 w-4" />}
                required
                autoComplete="email"
                error={fieldError}
              />

              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isLoading}
                loadingText="Sending..."
                className="mt-2"
              >
                Send reset link
              </Button>
            </form>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-body text-text-secondary mt-6">
        Remembered your password?{' '}
        <Link href="/login" className="font-semibold text-primary hover:underline transition-colors">
          Sign in
        </Link>
      </p>
    </div>
  );
}

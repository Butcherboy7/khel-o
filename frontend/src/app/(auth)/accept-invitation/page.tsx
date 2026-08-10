'use client';

import { useState, useEffect, Suspense, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Gamepad2, Lock, Loader2, CheckCircle2, AlertCircle, Building2 } from 'lucide-react';
import { Button, Input, Card, CardContent } from '@/components/ui';
import { getInvitationByToken, acceptInvitation, type PublicInvitationDetails } from '@/lib/api/invitations';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

function AcceptInvitationForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const setAuth = useAuthStore((s) => s.setAuth);

  const [invitation, setInvitation] = useState<PublicInvitationDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setDetailsError('Invalid or missing invitation link. Please request a new invitation from the cafe owner.');
      setIsLoadingDetails(false);
      return;
    }

    getInvitationByToken(token)
      .then((res) => {
        setInvitation(res.invitation);
      })
      .catch((err: unknown) => {
        const message = err instanceof Error ? err.message : 'Invitation link is invalid or has expired.';
        setDetailsError(message);
      })
      .finally(() => {
        setIsLoadingDetails(false);
      });
  }, [token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;

    if (password.length < 6) {
      setFormError('Password must be at least 6 characters long.');
      return;
    }

    if (password !== confirmPassword) {
      setFormError('Passwords do not match.');
      return;
    }

    setFormError(null);
    setIsSubmitting(true);

    try {
      const res = await acceptInvitation({ token, password });
      setAuth(res.user as unknown as User, res.accessToken, res.refreshToken);
      router.push('/owner/dashboard');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to accept invitation. Please try again.';
      setFormError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoadingDetails) {
    return (
      <Card elevation="raised">
        <CardContent className="p-8 text-center flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-body text-text-secondary">Verifying staff invitation...</p>
        </CardContent>
      </Card>
    );
  }

  if (detailsError || !invitation) {
    return (
      <Card elevation="raised">
        <CardContent className="p-8 text-center flex flex-col items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-error/10 text-error">
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="font-heading text-h3 text-text-primary">Invitation Link Invalid</h2>
            <p className="text-body text-text-secondary mt-1">{detailsError}</p>
          </div>
          <Button variant="outline" onClick={() => router.push('/login')} className="mt-2">
            Go to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card elevation="raised">
      <CardContent className="p-6 md:p-8">
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="flex items-center gap-3 p-3.5 rounded-xl bg-accent/10 border border-accent/20">
            <Building2 className="h-6 w-6 text-accent shrink-0" />
            <div>
              <span className="text-caption text-text-secondary uppercase tracking-wider font-semibold">
                Staff Invitation
              </span>
              <h3 className="font-heading text-h3 text-text-primary">{invitation.venueName}</h3>
            </div>
          </div>

          <div>
            <h2 className="font-heading text-h2 text-text-primary">Set Up Your Account</h2>
            <p className="text-body text-text-secondary mt-0.5">
              Welcome <strong>{invitation.fullName}</strong> ({invitation.email}). Please choose a password to complete your staff profile.
            </p>
          </div>

          {formError && (
            <div className="rounded-xl bg-error/10 border border-error/20 p-3 text-caption text-error">
              {formError}
            </div>
          )}

          <Input
            label="Create Password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            required
            minLength={6}
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="••••••••"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            leftIcon={<Lock className="h-4 w-4" />}
            required
            minLength={6}
          />

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isSubmitting}
            loadingText="Accepting Invitation..."
            className="mt-2 gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            Accept Invitation & Access Dashboard
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function AcceptInvitationPage() {
  return (
    <div className="w-full max-w-md">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-white shadow-float mb-3">
          <Gamepad2 className="h-7 w-7" />
        </div>
        <h1 className="font-heading text-display text-text-primary">KHEL-O</h1>
        <p className="text-body text-text-secondary mt-1">
          Gaming Café Staff Onboarding
        </p>
      </div>

      <Suspense
        fallback={
          <div className="flex justify-center p-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        }
      >
        <AcceptInvitationForm />
      </Suspense>
    </div>
  );
}

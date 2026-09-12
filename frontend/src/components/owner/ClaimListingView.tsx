'use client';

import { useState } from 'react';
import { KeyRound, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import { Card, CardContent, Badge, Button, Input } from '@/components/ui';
import { updateMe, changePassword } from '@/lib/api/auth';
import { useAuthStore } from '@/store/authStore';
import { isApiError } from '@/lib/api/errors';

/**
 * Blocking first-login step for a seeded lead listing.
 *
 * These accounts were created by KHEL-O, not by the venue: the café was listed
 * from public information and the login was handed over afterwards. So the very
 * first thing the real owner must do is take the account over — move it off the
 * @khel-o.com placeholder (which does not exist as a mailbox, making
 * forgot-password useless) and set a password only they know.
 *
 * Deliberately not dismissible. Until it completes, the account's recovery path
 * is an address nobody can receive mail at, on a café row that will later carry
 * bank details.
 *
 * Opening bookings is a separate, later step — see ClaimListingView's closing
 * note and POST /owner/cafe/claim. A café with no confirmed hardware stays
 * "Booking soon" until the owner adds stations, because a bookable listing with
 * no slots is worse for players than an honest one.
 */
export function ClaimListingView({ placeholderEmail }: { placeholderEmail: string }) {
  const setUser = useAuthStore((s) => s.setUser);

  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    email.trim().length > 3 &&
    currentPassword.length > 0 &&
    newPassword.length >= 8 &&
    newPassword === confirmPassword &&
    !submitting;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      // Order matters: change the email first, while the handover password is
      // still valid. If the password change went first, the credential proving
      // ownership of the email change would already be gone.
      const { user } = await updateMe({ email: email.trim(), currentPassword });
      await changePassword(currentPassword, newPassword);
      setUser(user);
    } catch (err) {
      setError(
        isApiError(err)
          ? err.message
          : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="flex flex-col items-center text-center mb-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary/10 text-primary mb-6 shadow-sm">
          <Sparkles className="h-8 w-8" />
        </div>

        <Badge variant="warning" size="md" className="mb-4">
          Finish setting up your account
        </Badge>

        <h1 className="font-heading text-display text-text-primary mb-3">
          Welcome to KHEL-O
        </h1>

        <p className="text-body text-text-secondary leading-relaxed">
          We listed your café so players nearby could find it. This account was
          created by us and still uses a temporary login, so pick your own email
          address and password to take it over.
        </p>
      </div>

      <Card elevation="raised" className="bg-surface border border-border/80">
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <Input
              label="Your email address"
              type="email"
              autoComplete="email"
              placeholder="you@yourcafe.com"
              leftIcon={<Mail className="h-4 w-4" />}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              hint={`Replaces the temporary ${placeholderEmail}. This becomes your login.`}
              required
            />

            <Input
              label="Temporary password"
              type="password"
              autoComplete="current-password"
              leftIcon={<KeyRound className="h-4 w-4" />}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              hint="The one KHEL-O gave you."
              required
            />

            <div className="h-px bg-border" />

            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              hint="At least 8 characters."
              error={
                newPassword.length > 0 && newPassword.length < 8
                  ? 'Use at least 8 characters.'
                  : undefined
              }
              required
            />

            <Input
              label="Confirm new password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              error={
                confirmPassword.length > 0 && confirmPassword !== newPassword
                  ? 'The two passwords do not match.'
                  : undefined
              }
              required
            />

            {error && (
              <p role="alert" className="text-caption text-error">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" fullWidth disabled={!canSubmit}>
              {submitting ? 'Saving…' : 'Take over this account'}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="mt-6 flex items-start gap-3 text-caption text-text-secondary">
        <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
        <span>
          Your café stays visible as <strong>Booking soon</strong> until you add
          your stations and rates. Nothing can be booked before then, and we
          never publish a price you have not set yourself.
        </span>
      </div>
    </div>
  );
}

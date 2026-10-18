'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { Button, Input } from '@/components/ui';
import { deleteAccount } from '@/lib/api/auth';
import { useAuthStore } from '@/store/authStore';
import { GoogleReauthButton } from '@/components/auth/GoogleReauthButton';

const DELETED_PATH = '/delete-account?deleted=1';

/**
 * The working half of /delete-account: Google Play needs the same deletion
 * path inside the app (Profile → Delete account) and at a public web URL, so
 * both are this one page. Signed out, it asks you to sign in first.
 */
export function DeleteAccountPanel() {
  const params = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const logoutTo = useAuthStore((s) => s.logoutTo);

  const [password, setPassword] = useState('');
  const [googleIdToken, setGoogleIdToken] = useState<string | null>(null);
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [requested, setRequested] = useState(false);

  if (params.get('deleted') === '1') {
    return (
      <Notice title="Your account is deleted">
        Your name, email, phone number and sign-in details are gone, and you&apos;ve been signed out
        on this device. Thanks for playing with us.
      </Notice>
    );
  }

  if (!isHydrated) {
    return <div className="h-40 rounded-2xl border border-border bg-card animate-pulse" aria-hidden />;
  }

  if (!user) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="text-body font-semibold text-text-primary">Sign in to delete your account</div>
        <div className="text-caption text-text-secondary">
          We need to know it&apos;s really you. Sign in with the account you want to delete, and
          you&apos;ll come straight back here.
        </div>
        <Link
          href="/login?redirect=/delete-account"
          className="inline-flex h-10 w-fit items-center rounded-xl bg-primary px-4 text-caption font-semibold !text-white !no-underline"
        >
          Sign in
        </Link>
        <div className="text-caption text-text-secondary">
          Can&apos;t sign in any more? Email{' '}
          <a href="mailto:support@khel-o.com?subject=Delete%20my%20account" className="text-primary underline">
            support@khel-o.com
          </a>{' '}
          from the address on your account and we&apos;ll delete it within 7 days.
        </div>
      </div>
    );
  }

  if (requested) {
    return (
      <Notice title="We've got your request">
        Your account runs a café, so we close it by hand: we settle any payout you&apos;re owed,
        take your café off KHEL-O, then delete your details. That takes up to 7 days, and we&apos;ll
        email {user.email} when it&apos;s done.
      </Notice>
    );
  }

  const hasPassword = user.hasPassword !== false;
  const proven = hasPassword ? password.length > 0 : Boolean(googleIdToken);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsDeleting(true);
    try {
      const res = await deleteAccount(
        hasPassword ? { currentPassword: password } : { googleIdToken: googleIdToken! },
      );
      if (res.status === 'requested') {
        setRequested(true);
      } else {
        logoutTo(DELETED_PATH);
      }
    } catch (err: any) {
      setError(err?.message || "Couldn't delete your account. Please try again.");
      setGoogleIdToken(null);
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-2xl border border-error/30 bg-card p-5"
    >
      <div className="flex flex-col gap-1">
        <div className="text-body font-semibold text-text-primary">Delete {user.email}</div>
        <div className="text-caption text-text-secondary">This can&apos;t be undone.</div>
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-error/20 bg-error/10 p-3 text-caption text-error">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {hasPassword ? (
        <Input
          label="Your password"
          type="password"
          autoComplete="current-password"
          placeholder="Confirm it's you"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      ) : googleIdToken ? (
        <div className="flex items-center gap-2 text-caption text-emerald-600">
          <CheckCircle2 className="h-4 w-4" />
          <span>Verified with Google.</span>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-caption text-text-secondary">
            You sign in with Google. Verify it&apos;s you to continue.
          </span>
          <GoogleReauthButton onToken={setGoogleIdToken} />
        </div>
      )}

      <label className="flex items-start gap-2.5 text-caption text-text-primary">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--error)]"
        />
        <span>I understand my account, badges and booking passes will be gone for good.</span>
      </label>

      <Button
        type="submit"
        variant="destructive"
        isLoading={isDeleting}
        loadingText="Deleting…"
        disabled={!understood || !proven}
        className="gap-2 self-start"
      >
        <Trash2 className="h-4 w-4" />
        Delete my account
      </Button>
    </form>
  );
}

function Notice({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div role="status" className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="flex flex-col gap-1">
        <div className="text-body font-semibold text-text-primary">{title}</div>
        <div className="text-caption text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { PauseCircle } from 'lucide-react';
import { ErrorState } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';

/** The server refuses owner data while a café is suspended (CAFE_SUSPENDED). */
export function isCafeSuspended(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'CAFE_SUSPENDED';
}

/** Says why the page is empty instead of blaming the owner's connection. */
export function SuspendedNotice() {
  return (
    <div role="status" className="my-4 flex flex-col items-center rounded-2xl border border-warning/30 bg-card p-8 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-warning/10 text-warning">
        <PauseCircle className="h-7 w-7" />
      </div>
      <h3 className="mb-1 font-heading text-h3 text-text-primary">Paused while your listing is suspended</h3>
      <p className="mb-6 max-w-sm text-body text-text-secondary">
        Bookings, offers, insights and payouts come back once KHEL-O lifts the suspension. Your dashboard shows why.
      </p>
      <div className="flex gap-2">
        <Link href="/owner/dashboard" className="rounded-xl bg-primary px-4 py-2 text-caption font-semibold text-white">
          Open dashboard
        </Link>
        <Link href="/owner/support" className="rounded-xl border border-border px-4 py-2 text-caption font-semibold text-text-primary">
          Ask KHEL-O
        </Link>
      </div>
    </div>
  );
}

/** An owner page's load error: the suspension notice when that's the reason, the usual error otherwise. */
export function OwnerLoadError({
  error,
  title,
  message,
  onRetry,
}: {
  error: unknown;
  title: string;
  message?: string;
  onRetry?: () => void;
}) {
  if (isCafeSuspended(error)) return <SuspendedNotice />;
  return <ErrorState title={title} message={message} onRetry={onRetry} />;
}

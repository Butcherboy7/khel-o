'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Building2, Copy, ExternalLink } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/keys';
import { getOwnerPayoutSummary, getOwnerCafePayouts } from '@/lib/api/owner';
import { Card, CardContent, Badge, Button, EmptyState, PageSpinner } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { MoneyExplained } from '@/components/owner/MoneyExplained';
import { useAuthStore } from '@/store/authStore';
import { isCafeSuspended, SuspendedNotice } from '@/components/owner/OwnerLoadError';

// CafePayoutStatus vocabulary for the manual bank-transfer history table.
function manualPayoutStatusBadge(status: string) {
  if (status === 'paid') return <Badge variant="success" size="sm">Paid</Badge>;
  if (status === 'pending') return <Badge variant="warning" size="sm">Ready — transfer coming</Badge>;
  if (status === 'processing') return <Badge variant="default" size="sm">Processing</Badge>;
  if (status === 'failed') return <Badge variant="error" size="sm">Failed — contact support</Badge>;
  if (status === 'on_hold') return <Badge variant="warning" size="sm">On hold</Badge>;
  if (status === 'disputed') return <Badge variant="error" size="sm">Disputed — under review</Badge>;
  return <Badge variant="default" size="sm">{status}</Badge>;
}

export default function OwnerPayoutsPage() {
  const router = useRouter();
  const activeRole = useAuthStore((s) => s.activeRole);

  // Staff cannot see the venue's financials — bounce to the dashboard instead
  // of rendering a page whose data calls will just 403. Matches the same
  // activeRole-based guard on Café settings.
  useEffect(() => {
    if (activeRole === 'staff') {
      router.push('/owner/dashboard');
    }
  }, [activeRole, router]);

  const summaryQuery = useQuery({
    queryKey: queryKeys.owner.payoutSummary,
    queryFn: getOwnerPayoutSummary,
  });

  const cafePayoutsQuery = useQuery({
    queryKey: queryKeys.owner.cafePayouts,
    queryFn: getOwnerCafePayouts,
  });

  if (summaryQuery.isLoading || cafePayoutsQuery.isLoading) {
    return (
      <PageSpinner showTip />
    );
  }

  const account = summaryQuery.data?.account ?? null;
  const payoutOnHold = summaryQuery.data?.payoutOnHold ?? false;
  const payoutHoldReason = summaryQuery.data?.payoutHoldReason ?? null;
  const payoutHistory = cafePayoutsQuery.data?.history ?? [];

  const outstandingAmount = cafePayoutsQuery.data?.availableForPayout ?? summaryQuery.data?.summary.outstandingAmount ?? 0;
  const pendingSettlement = cafePayoutsQuery.data?.pendingSettlement ?? 0;
  const totalEarnings = cafePayoutsQuery.data?.totalEarnings ?? 0;
  const totalPaid = cafePayoutsQuery.data?.totalPaid ?? summaryQuery.data?.summary.alreadyPaidOut ?? 0;

  // A suspended café gets 403s here; say so instead of showing ₹0 everywhere.
  if (isCafeSuspended(summaryQuery.error) || isCafeSuspended(cafePayoutsQuery.error)) {
    return (
      <div className="flex flex-col gap-8">
        <OwnerPageHeader
        guide="payouts"

        title="Payouts"

        description="Where your money is right now."

      />
        <SuspendedNotice />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <OwnerPageHeader
        guide="payouts"
        title="Payouts"
        description="Where your money is right now."
      />
      {payoutOnHold && (
        <Card elevation="resting" className="border border-error/30 bg-error/5">
          <CardContent className="p-4 text-caption text-error">
            Payouts to your café are currently on hold: {payoutHoldReason || 'contact KHEL-O support for details.'}
          </CardContent>
        </Card>
      )}

      {/* The money's journey, left to right: earned → clearing → ready → paid. Each step
          is a number and three words; the order itself explains how money reaches you. */}
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-tour="payout-stages" aria-label="Where your money is">
        {[
          { label: 'Earned', value: totalEarnings, note: 'after refunds', tone: 'text-text-primary' },
          { label: 'Clearing', value: pendingSettlement, note: 'takes 2–3 days', tone: pendingSettlement > 0 ? 'text-amber-700' : 'text-text-primary' },
          { label: 'Ready', value: outstandingAmount, note: 'we send it next', tone: outstandingAmount > 0 ? 'text-amber-700' : 'text-text-primary' },
          { label: 'Paid to you', value: totalPaid, note: 'in your bank', tone: 'text-success' },
        ].map((s, n) => (
          <li key={s.label} className="relative flex flex-col gap-0.5 rounded-2xl border border-border bg-card px-3 py-2.5">
            <span className="flex items-center gap-1.5 text-caption font-semibold text-text-secondary">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-text-primary">{n + 1}</span>
              {s.label}
            </span>
            <span className={`font-heading text-h2 font-bold leading-tight ${s.tone}`}>₹{s.value.toFixed(0)}</span>
            <span className="text-[11px] text-text-secondary">{s.note}</span>
          </li>
        ))}
      </ol>

      <Card data-tour="payout-where" elevation="resting">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Building2 className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-caption text-text-secondary">We send your money to</p>
              <p className="truncate font-semibold text-text-primary">
                {account ? [account.upiVpa ? `UPI ${account.upiVpa}` : '', account.bankAccountNumberMasked ? `Bank ${account.bankAccountNumberMasked}` : ''].filter(Boolean).join(' · ') : 'Nowhere yet'}
              </p>
              {account?.accountHolderName && <p className="truncate text-caption text-text-secondary">{account.accountHolderName}{account.bankIfsc ? ` · ${account.bankIfsc}` : ''}</p>}
            </div>
          </div>
          <Link href="/owner/settings?qf=payout" className="w-full sm:w-auto">
            <Button variant={account ? 'secondary' : 'primary'} size="sm" fullWidth className="gap-1.5 whitespace-nowrap sm:w-auto">
              <span>{account ? 'Change' : 'Add UPI or bank'}</span>
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </Link>
        </CardContent>
      </Card>

      {/* Manual Payout History */}
      <Card elevation="resting">
        <CardContent className="p-4 sm:p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-heading text-h3 font-bold text-text-primary">Money sent to you</h2>
          </div>

          {payoutHistory.length === 0 ? (
            <EmptyState
              title="Nothing sent yet"
              description="Each payment shows here with its bank receipt number (UTR)."
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {payoutHistory.map((p) => {
                const d = p.destination;
                const sentTo = d
                  ? [
                      d.accountHolderName,
                      d.upiVpa ? `UPI ${d.upiVpa}` : d.bankAccountNumberMasked ? `Bank ${d.bankAccountNumberMasked}${d.bankIfsc ? ` · ${d.bankIfsc}` : ''}` : null,
                    ].filter(Boolean).join(' · ')
                  : null;
                const when = p.paidAt ?? p.createdAt;
                return (
                  <li key={p.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span className="block font-heading text-h3 font-bold text-emerald-600">₹{p.amount.toFixed(2)}</span>
                        <span className="block text-caption text-text-secondary">
                          {new Date(when).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                          {p.cafeName ? ` · ${p.cafeName}` : ''}
                        </span>
                      </div>
                      {manualPayoutStatusBadge(p.status)}
                    </div>

                    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-caption">
                      {sentTo && (
                        <>
                          <dt className="text-text-secondary">Sent to</dt>
                          <dd className="min-w-0 break-words font-semibold text-text-primary">{sentTo}</dd>
                        </>
                      )}
                      <dt className="text-text-secondary">Paid via</dt>
                      <dd className="font-semibold uppercase text-text-primary">{p.paymentMethod || '—'}</dd>
                      <dt className="text-text-secondary">UTR</dt>
                      <dd className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 break-all font-mono text-xs text-text-primary">{p.utrReference || '—'}</span>
                        {p.utrReference && (
                          <button
                            type="button"
                            aria-label="Copy UTR"
                            onClick={() => navigator.clipboard?.writeText(p.utrReference as string)}
                            className="flex h-11 w-11 -my-3 flex-shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        )}
                      </dd>
                    </dl>
                    {p.adminNote && <p className="text-caption text-text-secondary">{p.adminNote}</p>}

                    <div className="flex flex-wrap items-center gap-2">
                      {p.proofImageUrl && (
                        <a
                          href={p.proofImageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-border px-3 text-caption font-semibold text-text-primary hover:bg-surface"
                        >
                          <ExternalLink className="h-4 w-4" />
                          View payment proof
                        </a>
                      )}
                    </div>

                    {p.bookings && p.bookings.length > 0 && (
                      <details className="group rounded-xl bg-surface px-3 py-2 text-caption">
                        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between font-semibold text-text-primary">
                          <span>Covers {p.bookings.length} booking{p.bookings.length > 1 ? 's' : ''}</span>
                          <span aria-hidden className="text-text-secondary transition-transform group-open:rotate-90">›</span>
                        </summary>
                        <ul className="flex flex-col divide-y divide-border pb-1">
                          {p.bookings.map((b) => (
                            <li key={b.bookingReference} className="flex items-center justify-between gap-3 py-2">
                              <span className="min-w-0">
                                <span className="block font-mono text-xs text-text-primary">{b.bookingReference}</span>
                                <span className="block text-[11px] text-text-secondary">
                                  {new Date(b.sessionDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                                </span>
                              </span>
                              <span className="font-semibold text-text-primary">₹{b.amount.toFixed(2)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
      <details data-tour="payout-drop-money" className="group rounded-2xl border border-border bg-card p-4">
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3 font-heading text-body-emphasis font-bold text-text-primary">
          Launch drop money
          <span className="text-caption font-semibold text-primary group-open:hidden">Show</span>
          <span className="hidden text-caption font-semibold text-primary group-open:inline">Hide</span>
        </summary>
        <p className="mt-1 text-caption text-text-secondary">Only for launch drops like GTA 6. Normal bookings work as shown above.</p>
        <MoneyExplained pricePerHour={250} deposit={100} className="mt-3 border-0 p-0" />
      </details>
    </div>
  );
}

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
import { OwnerStatRow } from '@/components/owner/OwnerStatRow';
import { useAuthStore } from '@/store/authStore';

// CafePayoutStatus vocabulary for the manual bank-transfer history table.
function manualPayoutStatusBadge(status: string) {
  if (status === 'paid') return <Badge variant="success" size="sm">Paid</Badge>;
  if (status === 'pending') return <Badge variant="warning" size="sm">This week&apos;s payout — awaiting transfer</Badge>;
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
  // activeRole-based guard on Café Settings.
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
  const nextPayoutDate = cafePayoutsQuery.data?.nextPayoutDate;

  return (
    <div className="flex flex-col gap-8">
      <OwnerPageHeader
        guide="payouts"
        title="Payouts"
        description="What customers paid, what KHEL-O kept, and what has reached your bank."
      />
      {payoutOnHold && (
        <Card elevation="resting" className="border border-error/30 bg-error/5">
          <CardContent className="p-4 text-caption text-error">
            Payouts to your café are currently on hold: {payoutHoldReason || 'contact KHEL-O support for details.'}
          </CardContent>
        </Card>
      )}

      {/* Four numbers that mirror the actual money flow — customer pays,
          Razorpay settles to KHEL-O, it becomes available, then it's paid
          out — so an owner can tell at a glance which stage their money is
          in instead of seeing one opaque "owed" total. */}
      <div className="flex flex-col gap-2">
        <OwnerStatRow
          stats={[
            {
              label: 'Total earnings',
              value: `₹${totalEarnings.toFixed(0)}`,
              tone: 'neutral',
              hint: 'All-time, net of refunds',
            },
            {
              label: 'Pending settlement',
              value: `₹${pendingSettlement.toFixed(0)}`,
              tone: pendingSettlement > 0 ? 'warning' : 'neutral',
              hint: 'Payment captured — Razorpay settlement pending (~2 business days)',
            },
            {
              label: 'Available for payout',
              value: `₹${outstandingAmount.toFixed(0)}`,
              tone: outstandingAmount > 0 ? 'warning' : 'neutral',
              hint: 'Settled, awaiting transfer',
            },
            {
              label: 'Paid out',
              value: `₹${totalPaid.toFixed(0)}`,
              tone: 'positive',
              hint: 'Sent to your account',
            },
          ]}
        />
        <p className="text-caption text-text-secondary px-1">
          Customer payment → Razorpay settles to KHEL-O (2–3 business days) → becomes available for
          payout → included in the next weekly payout{nextPayoutDate ? ` (${new Date(nextPayoutDate).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })})` : ''} → paid to your account.
        </p>
      </div>

      <Card elevation="resting" className="border border-border bg-surface-hover">
        <CardContent className="flex flex-col gap-3 p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-caption">
            <span className="text-text-secondary">Where it&apos;s sent: </span>
            <span className="font-bold text-text-primary">
              {account?.upiVpa || account?.bankAccountNumberMasked || 'Not added yet'}
            </span>
          </div>
          {!account && (
            <Link href="/owner/settings" className="w-full sm:w-auto">
              <Button variant="primary" size="sm" fullWidth className="gap-1.5 whitespace-nowrap sm:w-auto">
                <span>Add payout details</span>
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>

      {/* Connected Bank Account Details */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-500" />
            <span>Your bank account</span>
          </h2>

          {account ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 bg-surface-hover p-4 rounded-2xl border border-border/80">
              <div>
                <span className="text-caption text-text-secondary block">Account Holder</span>
                <span className="text-caption font-bold text-text-primary">{account.accountHolderName || '—'}</span>
              </div>
              <div>
                <span className="text-caption text-text-secondary block">Bank Account</span>
                <span className="text-caption font-bold text-text-primary">{account.bankAccountNumberMasked || '—'}</span>
              </div>
              <div>
                <span className="text-caption text-text-secondary block">Bank IFSC</span>
                <span className="text-caption font-bold text-text-primary">{account.bankIfsc || '—'}</span>
              </div>
            </div>
          ) : (
            <p className="text-caption text-text-secondary bg-surface-hover p-4 rounded-2xl border border-border/80">
              No payout account on file yet — add your bank details in Settings to receive direct bank transfers for future bookings.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Manual Payout History */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
              <Building2 className="h-5 w-5 text-emerald-500" />
              <span>Bank transfers from KHEL-O</span>
            </h2>
            <div className="text-right">
              <span className="block text-caption text-text-secondary">Owed to you</span>
              <span className="font-heading text-h3 text-amber-600">₹{outstandingAmount.toFixed(2)}</span>
            </div>
          </div>

          {payoutHistory.length === 0 ? (
            <EmptyState
              title="No manual payouts yet"
              description="Once KHEL-O sends a bank transfer for your outstanding balance, it'll appear here with the UTR reference."
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
    </div>
  );
}

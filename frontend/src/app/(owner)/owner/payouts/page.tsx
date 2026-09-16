'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Building2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/keys';
import { getOwnerPayoutSummary, getOwnerCafePayouts } from '@/lib/api/owner';
import { Card, CardContent, Badge, Button, EmptyState, PageSpinner, Tooltip } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerStatRow } from '@/components/owner/OwnerStatRow';
import { useAuthStore } from '@/store/authStore';

// CafePayoutStatus vocabulary for the manual bank-transfer history table.
function manualPayoutStatusBadge(status: string) {
  if (status === 'paid') return <Badge variant="success" size="sm">Paid</Badge>;
  if (status === 'pending' || status === 'processing') return <Badge variant="default" size="sm">Processing</Badge>;
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
      <PageSpinner />
    );
  }

  const account = summaryQuery.data?.account ?? null;
  const outstandingAmount = summaryQuery.data?.summary.outstandingAmount ?? 0;
  const alreadyPaidOut = summaryQuery.data?.summary.alreadyPaidOut ?? 0;
  const payoutOnHold = summaryQuery.data?.payoutOnHold ?? false;
  const payoutHoldReason = summaryQuery.data?.payoutHoldReason ?? null;
  const payoutHistory = cafePayoutsQuery.data?.history ?? [];

  return (
    <div className="flex flex-col gap-8">
      <OwnerPageHeader
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

      {/* Three questions, answered on open: currently owed, already paid,
          where it's sent. */}
      <Card elevation="resting" className="border border-border bg-surface-hover">
        <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-caption">
            <div className="flex justify-between sm:block">
              <span className="text-text-secondary">Currently owed:</span>{' '}
              <Tooltip content="Every captured booking KHEL-O hasn't paid out to you yet, minus any refund adjustments.">
                <span className="font-bold text-amber-700 cursor-help underline decoration-dotted">₹{outstandingAmount.toFixed(0)}</span>
              </Tooltip>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-text-secondary">Already paid:</span>{' '}
              <span className="font-bold text-emerald-700">₹{alreadyPaidOut.toFixed(0)}</span>
            </div>
            <div className="flex justify-between sm:block sm:col-span-2">
              <span className="text-text-secondary">Where it&apos;s sent:</span>{' '}
              <span className="font-bold text-text-primary">
                {account?.upiVpa || account?.bankAccountNumberMasked || 'Not added yet'}
              </span>
            </div>
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

      {/* Earnings vs payouts, kept as two distinct chains rather than one
          blended row: revenue -> fee -> net earnings, then already paid. */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-caption font-semibold text-text-secondary mb-1.5">Payouts</h3>
          <OwnerStatRow
            stats={[
              { label: 'Already paid', value: `₹${alreadyPaidOut.toFixed(0)}`, tone: 'positive' },
            ]}
          />
        </div>
      </div>

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
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-caption text-text-secondary">
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Amount</th>
                    <th className="py-3 px-4 font-semibold">Method</th>
                    <th className="py-3 px-4 font-semibold">UTR / Reference</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold">Proof</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-caption">
                  {payoutHistory.map((p) => (
                    <tr key={p.id}>
                      <td className="py-3.5 px-4 text-text-secondary">
                        {p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 font-bold text-emerald-600">₹{p.amount.toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-text-secondary uppercase">{p.paymentMethod}</td>
                      <td className="py-3.5 px-4 font-mono text-xs text-text-primary">
                        {p.utrReference}
                        {p.adminNote && (
                          <span className="block text-[11px] font-sans text-text-tertiary" title={p.adminNote}>
                            {p.adminNote}
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">{manualPayoutStatusBadge(p.status)}</td>
                      <td className="py-3.5 px-4">
                        {p.proofImageUrl ? (
                          <a href={p.proofImageUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                            View
                          </a>
                        ) : (
                          <span className="text-text-tertiary">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

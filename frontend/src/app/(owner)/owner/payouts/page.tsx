'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CreditCard,
  ShieldCheck,
  ShieldAlert,
  Clock,
  ArrowUpRight,
  Receipt,
  Building2,
} from 'lucide-react';
import { getOwnerPayoutSummary, getOwnerCafePayouts, type OwnerCafePayoutHistoryItem } from '@/lib/api/owner';
import { Card, CardContent, Badge, Button, EmptyState, PageSpinner } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerStatRow } from '@/components/owner/OwnerStatRow';
import { useAuthStore } from '@/store/authStore';

interface PayoutAccount {
  accountHolderName: string | null;
  bankAccountNumberMasked: string | null;
  bankIfsc: string | null;
  businessPan: string | null;
  upiVpa: string | null;
  payoutVerificationStatus: 'unverified' | 'test_sent' | 'verified' | null;
  verifiedName: string | null;
}

interface PayoutTransaction {
  id: string;
  bookingReference: string;
  sessionDate: string;
  grossAmount: number;
  platformFee: number;
  netSettlement: number;
  status: string;
  transferId: string | null;
  transferMethod: string;
}

interface PayoutSummary {
  totalEarnings: number;
  netSettlement: number;
  netEarnings: number;
  completedSettlements: number;
  pendingSettlements: number;
  totalGatewayFees: number;
  totalPlatformFees: number;
  totalTds: number;
  alreadyPaidOut: number;
}

function statusBadge(status: string) {
  if (status === 'transferred') return <Badge variant="success" size="sm">Transferred</Badge>;
  if (status === 'failed') return <Badge variant="error" size="sm">Failed — needs attention</Badge>;
  if (status === 'skipped_no_linked_account') return <Badge variant="warning" size="sm">No payout account yet</Badge>;
  return <Badge variant="default" size="sm">Pending</Badge>;
}

// CafePayoutStatus vocabulary (the manual bank-transfer table) — a distinct
// set of statuses from the Route transfer statuses statusBadge() above
// covers. Never conflate the two: this gates an individual payout's state,
// the other gates whether the payout destination itself is trusted.
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
  const [summary, setSummary] = useState<PayoutSummary | null>(null);
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [transactions, setTransactions] = useState<PayoutTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedTx, setSelectedTx] = useState<PayoutTransaction | null>(null);
  const [outstandingAmount, setOutstandingAmount] = useState(0);
  const [payoutHistory, setPayoutHistory] = useState<OwnerCafePayoutHistoryItem[]>([]);

  // Staff cannot see the venue's financials — bounce to the dashboard instead
  // of rendering a page whose data calls will just 403. Matches the same
  // activeRole-based guard on Café Settings.
  useEffect(() => {
    if (activeRole === 'staff') {
      router.push('/owner/dashboard');
    }
  }, [activeRole, router]);

  useEffect(() => {
    async function loadPayouts() {
      try {
        const res = await getOwnerPayoutSummary();
        setSummary(res?.summary ?? null);
        setAccount(res?.account ?? null);
        setTransactions(res?.recentTransactions ?? []);
      } catch {
        setLoadError(true);
      } finally {
        setIsLoading(false);
      }
    }
    loadPayouts();
  }, []);

  useEffect(() => {
    async function loadCafePayouts() {
      try {
        const res = await getOwnerCafePayouts();
        setOutstandingAmount(res?.outstandingAmount ?? 0);
        setPayoutHistory(res?.history ?? []);
      } catch {
        // non-fatal: the rest of the page (Route settlement summary) still renders
      }
    }
    loadCafePayouts();
  }, []);

  if (isLoading) {
    return (
      <PageSpinner />
    );
  }

  const verificationStatus = account?.payoutVerificationStatus ?? null;
  const isVerified = verificationStatus === 'verified';
  const totalPending = (summary?.pendingSettlements ?? 0) + outstandingAmount;

  return (
    <div className="flex flex-col gap-8">
      <OwnerPageHeader
        title="Payouts"
        description="What customers paid, what KHEL-O kept, and what has reached your bank."
        action={
          isVerified ? (
            <Badge variant="success" size="md" className="gap-1.5 px-3 py-1.5">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              <span>Payout destination verified</span>
            </Badge>
          ) : (
            <Badge variant="warning" size="md" className="gap-1.5 px-3 py-1.5">
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
              <span>{account ? 'Verification pending' : 'No payout details yet'}</span>
            </Badge>
          )
        }
      />

      {/* Five questions, answered on open: total earned, currently owed,
          already paid, when the pending amount arrives, where it's sent. */}
      <Card elevation="resting" className="border border-border bg-surface-hover">
        <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-caption">
            <div className="flex justify-between sm:block">
              <span className="text-text-secondary">Total earned:</span>{' '}
              <span className="font-bold text-text-primary">₹{(summary?.totalEarnings ?? 0).toFixed(0)}</span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-text-secondary">Currently owed:</span>{' '}
              <span className="font-bold text-amber-700">₹{totalPending.toFixed(0)}</span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-text-secondary">Already paid:</span>{' '}
              <span className="font-bold text-emerald-700">₹{(summary?.alreadyPaidOut ?? 0).toFixed(0)}</span>
            </div>
            <div className="flex justify-between sm:block">
              <span className="text-text-secondary">When it arrives:</span>{' '}
              <span className="font-bold text-text-primary">Paid out weekly</span>
            </div>
            <div className="flex justify-between sm:block sm:col-span-2">
              <span className="text-text-secondary">Where it's sent:</span>{' '}
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
          blended row: revenue -> fee -> net earnings, then paid -> pending. */}
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="text-caption font-semibold text-text-secondary mb-1.5">Earnings</h3>
          <OwnerStatRow
            stats={[
              { label: 'Revenue generated', value: `₹${(summary?.totalEarnings ?? 0).toFixed(0)}`, hint: 'all time' },
              { label: 'KHELO fee', value: `₹${(summary?.totalPlatformFees ?? 0).toFixed(0)}` },
              { label: 'Net earnings', value: `₹${(summary?.netEarnings ?? 0).toFixed(0)}`, tone: 'positive' },
            ]}
          />
        </div>
        <div>
          <h3 className="text-caption font-semibold text-text-secondary mb-1.5">Payouts</h3>
          <OwnerStatRow
            stats={[
              { label: 'Already paid', value: `₹${(summary?.alreadyPaidOut ?? 0).toFixed(0)}`, tone: 'positive' },
              { label: 'Pending', value: `₹${totalPending.toFixed(0)}`, tone: 'warning' },
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

      {/* Transactions & Breakdown Table */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-500" />
              <span>Booking payments</span>
            </h2>
            {transactions.length > 0 && (
              <span className="text-caption text-text-secondary">Click a row for the full fee breakdown</span>
            )}
          </div>

          {loadError && (
            <p className="text-caption text-error">Couldn&apos;t load payout data — try refreshing.</p>
          )}

          {!loadError && transactions.length === 0 && (
            <EmptyState
              title="No payouts yet"
              description="Once a gamer completes a paid booking at your café, it'll show up here with its real fee breakdown and transfer status."
            />
          )}

          {transactions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-caption text-text-secondary">
                    <th className="py-3 px-4 font-semibold">Booking Ref</th>
                    <th className="py-3 px-4 font-semibold">Date</th>
                    <th className="py-3 px-4 font-semibold">Gross Paid</th>
                    <th className="py-3 px-4 font-semibold">Platform Service Fee</th>
                    <th className="py-3 px-4 font-semibold">Net Payout</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-caption">
                  {transactions.map((tx) => (
                    <tr
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="hover:bg-surface-hover cursor-pointer transition-all"
                    >
                      <td className="py-3.5 px-4 font-bold text-text-primary">{tx.bookingReference}</td>
                      <td className="py-3.5 px-4 text-text-secondary">{tx.sessionDate}</td>
                      <td className="py-3.5 px-4 text-text-primary">₹{tx.grossAmount.toFixed(2)}</td>
                      <td className="py-3.5 px-4 text-rose-500">-₹{tx.platformFee.toFixed(2)}</td>
                      <td className="py-3.5 px-4 font-bold text-emerald-600">₹{tx.netSettlement.toFixed(2)}</td>
                      <td className="py-3.5 px-4">{statusBadge(tx.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

      {/* Fee Breakdown Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card elevation="raised" className="max-w-md w-full bg-surface border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-heading text-h3 text-text-primary">Payout Breakdown</h3>
              <button onClick={() => setSelectedTx(null)} className="text-text-tertiary hover:text-text-primary font-bold">✕</button>
            </div>

            <div className="flex flex-col gap-2.5 text-caption">
              <div className="flex justify-between">
                <span className="text-text-secondary">Booking Reference:</span>
                <span className="font-bold text-text-primary">{selectedTx.bookingReference}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Gamer Paid Amount:</span>
                <span className="font-bold text-text-primary">₹{selectedTx.grossAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Platform Service Fee:</span>
                <span className="text-rose-500">-₹{selectedTx.platformFee.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-2.5 flex justify-between font-bold text-body">
                <span className="text-text-primary">Net Settlement:</span>
                <span className="text-emerald-600">₹{selectedTx.netSettlement.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-text-secondary">Transfer Status:</span>
                {statusBadge(selectedTx.status)}
              </div>
              {selectedTx.transferId && (
                <div className="flex justify-between">
                  <span className="text-text-secondary flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> Transfer ID:</span>
                  <span className="font-mono text-xs text-text-primary">{selectedTx.transferId}</span>
                </div>
              )}
            </div>

            <Button variant="primary" onClick={() => setSelectedTx(null)} className="mt-2">
              Close
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

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
  Info,
} from 'lucide-react';
import { getOwnerPayoutSummary } from '@/lib/api/owner';
import { Card, CardContent, Badge, Button, EmptyState } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

interface PayoutAccount {
  accountHolderName: string | null;
  bankAccountNumberMasked: string | null;
  bankIfsc: string | null;
  businessPan: string | null;
  kycStatus: string;
  razorpayAccountId: string | null;
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
  completedSettlements: number;
  pendingSettlements: number;
  totalGatewayFees: number;
  totalPlatformFees: number;
  totalTds: number;
}

function statusBadge(status: string) {
  if (status === 'transferred') return <Badge variant="success" size="sm">Transferred</Badge>;
  if (status === 'failed') return <Badge variant="error" size="sm">Failed — needs attention</Badge>;
  if (status === 'skipped_no_linked_account') return <Badge variant="warning" size="sm">No payout account yet</Badge>;
  return <Badge variant="default" size="sm">Pending</Badge>;
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }

  const kycActivated = account?.kycStatus === 'activated';

  return (
    <div className="max-w-5xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-emerald-500" />
            <span>Payouts</span>
          </h1>
          <p className="text-caption text-text-secondary">Real breakdown of what gamers paid, what KHEL-O keeps, and what&apos;s transferred to your bank via Razorpay Route.</p>
        </div>

        {kycActivated ? (
          <Badge variant="success" size="md" className="gap-1.5 py-1.5 px-3">
            <ShieldCheck className="h-4 w-4" />
            <span>Payout Account Active</span>
          </Badge>
        ) : (
          <Badge variant="warning" size="md" className="gap-1.5 py-1.5 px-3">
            <ShieldAlert className="h-4 w-4" />
            <span>{account ? 'KYC Pending Verification' : 'Payout Account Not Set Up'}</span>
          </Badge>
        )}
      </div>

      {!kycActivated && (
        <Card elevation="resting" className="bg-amber-500/5 border border-amber-500/30">
          <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center flex-shrink-0">
                <Info className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-heading text-caption font-bold text-text-primary">
                  {account ? 'Your payout account is awaiting Razorpay verification' : 'Set up direct bank payouts'}
                </h3>
                <p className="text-xs text-text-secondary">
                  {account
                    ? 'Once Razorpay activates your linked account, future booking payments will transfer to your bank automatically. Until then, settlement is pending.'
                    : 'Submit your bank details and PAN to get paid directly for bookings, instead of manual settlement.'}
                </p>
              </div>
            </div>
            {!account && (
              <Link href="/owner/settings">
                <Button variant="primary" size="sm" className="gap-1.5 whitespace-nowrap">
                  <span>Set Up Payouts</span>
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {/* Earnings & Settlement Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-4 sm:p-5 flex flex-col gap-1">
            <span className="text-caption font-semibold text-text-secondary">Total Gross Earnings</span>
            <div className="font-heading text-h1 text-text-primary">₹{(summary?.totalEarnings ?? 0).toFixed(2)}</div>
            <span className="text-xs text-text-tertiary">Customer payment total</span>
          </CardContent>
        </Card>

        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-4 sm:p-5 flex flex-col gap-1">
            <span className="text-caption font-semibold text-text-secondary">Transferred to Bank</span>
            <div className="font-heading text-h1 text-emerald-600">₹{(summary?.completedSettlements ?? 0).toFixed(2)}</div>
            <span className="text-xs text-text-tertiary">Confirmed via Razorpay Route</span>
          </CardContent>
        </Card>

        <Card elevation="resting" className="bg-surface border border-border col-span-2 sm:col-span-1">
          <CardContent className="p-4 sm:p-5 flex flex-col gap-1">
            <span className="text-caption font-semibold text-text-secondary">Pending Settlement</span>
            <div className="font-heading text-h1 text-amber-600">₹{(summary?.pendingSettlements ?? 0).toFixed(2)}</div>
            <span className="text-xs text-text-tertiary">Not yet transferred</span>
          </CardContent>
        </Card>
      </div>

      {/* Connected Bank Account Details */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-500" />
            <span>Connected Razorpay Route Account</span>
          </h2>

          {account ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-surface-hover p-4 rounded-2xl border border-border/80">
              <div>
                <span className="text-xs text-text-tertiary block">Account Holder</span>
                <span className="text-caption font-bold text-text-primary">{account.accountHolderName || '—'}</span>
              </div>
              <div>
                <span className="text-xs text-text-tertiary block">Bank Account</span>
                <span className="text-caption font-bold text-text-primary">{account.bankAccountNumberMasked || '—'}</span>
              </div>
              <div>
                <span className="text-xs text-text-tertiary block">Bank IFSC</span>
                <span className="text-caption font-bold text-text-primary">{account.bankIfsc || '—'}</span>
              </div>
              <div>
                <span className="text-xs text-text-tertiary block">KYC Status</span>
                {kycActivated ? (
                  <Badge variant="success" size="sm">Verified</Badge>
                ) : (
                  <Badge variant="warning" size="sm">Pending</Badge>
                )}
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
              <span>Recent Payouts</span>
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

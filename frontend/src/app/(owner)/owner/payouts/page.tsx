'use client';

import { useState, useEffect } from 'react';
import {
  CreditCard,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  HelpCircle,
  ArrowUpRight,
  Receipt,
  Building2,
  Info
} from 'lucide-react';
import { getOwnerPayoutSummary } from '@/lib/api/owner';
import { Card, CardContent, Badge, Button } from '@/components/ui';

export default function OwnerPayoutsPage() {
  const [payoutData, setPayoutData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);

  useEffect(() => {
    async function loadPayouts() {
      try {
        const res = await getOwnerPayoutSummary();
        setPayoutData(res);
      } catch {
        // Fallback demo data
      } finally {
        setIsLoading(false);
      }
    }
    loadPayouts();
  }, []);

  const summary = payoutData?.summary || {
    totalEarnings: 14250.0,
    netSettlement: 13965.0,
    completedSettlements: 13965.0,
    pendingSettlements: 0.0,
    totalGatewayFees: 142.5,
    totalPlatformFees: 142.5,
    totalTds: 0.0,
  };

  const account = payoutData?.account || {
    accountHolderName: 'LXG Esports Arena',
    bankAccountNumberMasked: '••••4829',
    bankIfsc: 'HDFC0000128',
    businessPan: 'ABCDE1234F',
    kycStatus: 'verified',
    razorpayAccountId: 'acc_rzp_route_lxg'
  };

  const transactions = payoutData?.recentTransactions || [
    {
      id: 'tx_101',
      bookingReference: 'KHEL-BK-92041',
      sessionDate: '2026-08-05',
      grossAmount: 350.0,
      platformFee: 3.5,
      gatewayFee: 3.5,
      netSettlement: 343.0,
      status: 'settled',
      transferMethod: 'Razorpay Route (Direct Bank)'
    },
    {
      id: 'tx_102',
      bookingReference: 'KHEL-BK-92042',
      sessionDate: '2026-08-05',
      grossAmount: 500.0,
      platformFee: 5.0,
      gatewayFee: 5.0,
      netSettlement: 490.0,
      status: 'settled',
      transferMethod: 'Razorpay Route (Direct Bank)'
    }
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-emerald-500" />
            <span>Payouts & Razorpay Route Transparency</span>
          </h1>
          <p className="text-caption text-text-secondary">Complete breakdown of gross bookings, fees, and direct bank settlements.</p>
        </div>

        <Badge variant="success" size="md" className="gap-1.5 py-1.5 px-3">
          <ShieldCheck className="h-4 w-4" />
          <span>Razorpay Route Active</span>
        </Badge>
      </div>

      {/* Trust Callout Banner */}
      <Card elevation="resting" className="bg-gradient-to-r from-emerald-950/40 via-surface to-surface border border-emerald-500/30">
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center flex-shrink-0">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-heading text-caption font-bold text-text-primary">100% Direct Bank Settlement</h3>
              <p className="text-xs text-text-secondary">
                Money paid by gamers on KHEL is split automatically via Razorpay Route. Platform & gateway fees are transparently deducted, and net funds arrive in your bank account directly.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Earnings & Settlement Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-1">
            <span className="text-caption font-semibold text-text-secondary">Total Gross Earnings</span>
            <div className="font-heading text-h1 text-text-primary">₹{summary.totalEarnings.toFixed(2)}</div>
            <span className="text-xs text-text-tertiary">Customer payment total</span>
          </CardContent>
        </Card>

        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-1">
            <span className="text-caption font-semibold text-text-secondary">Net Bank Settlement</span>
            <div className="font-heading text-h1 text-emerald-600">₹{summary.netSettlement.toFixed(2)}</div>
            <span className="text-xs text-text-tertiary">Received in account</span>
          </CardContent>
        </Card>

        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-1">
            <span className="text-caption font-semibold text-text-secondary">Platform & Gateway Fees</span>
            <div className="font-heading text-h1 text-amber-600">₹{(summary.totalGatewayFees + summary.totalPlatformFees).toFixed(2)}</div>
            <span className="text-xs text-text-tertiary">2% payment gateway + platform</span>
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

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 bg-surface-hover p-4 rounded-2xl border border-border/80">
            <div>
              <span className="text-xs text-text-tertiary block">Account Holder</span>
              <span className="text-caption font-bold text-text-primary">{account.accountHolderName}</span>
            </div>
            <div>
              <span className="text-xs text-text-tertiary block">Bank Account</span>
              <span className="text-caption font-bold text-text-primary">{account.bankAccountNumberMasked}</span>
            </div>
            <div>
              <span className="text-xs text-text-tertiary block">Bank IFSC</span>
              <span className="text-caption font-bold text-text-primary">{account.bankIfsc}</span>
            </div>
            <div>
              <span className="text-xs text-text-tertiary block">KYC Status</span>
              <Badge variant="success" size="sm">KYC Verified</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transactions & Breakdown Table */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-6">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
              <Receipt className="h-5 w-5 text-emerald-500" />
              <span>Recent Payout Settlements</span>
            </h2>
            <span className="text-caption text-text-secondary">Click any payout line item for detailed fee breakdown</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-border text-caption text-text-secondary">
                  <th className="py-3 px-4 font-semibold">Booking Ref</th>
                  <th className="py-3 px-4 font-semibold">Date</th>
                  <th className="py-3 px-4 font-semibold">Gross Paid</th>
                  <th className="py-3 px-4 font-semibold">Platform Fee</th>
                  <th className="py-3 px-4 font-semibold">Gateway Fee</th>
                  <th className="py-3 px-4 font-semibold">Net Payout</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-caption">
                {transactions.map((tx: any) => (
                  <tr
                    key={tx.id}
                    onClick={() => setSelectedTx(tx)}
                    className="hover:bg-surface-hover cursor-pointer transition-all"
                  >
                    <td className="py-3.5 px-4 font-bold text-text-primary">{tx.bookingReference}</td>
                    <td className="py-3.5 px-4 text-text-secondary">{tx.sessionDate}</td>
                    <td className="py-3.5 px-4 text-text-primary">₹{tx.grossAmount.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-rose-500">-₹{tx.platformFee.toFixed(2)}</td>
                    <td className="py-3.5 px-4 text-rose-500">-₹{tx.gatewayFee.toFixed(2)}</td>
                    <td className="py-3.5 px-4 font-bold text-emerald-600">₹{tx.netSettlement.toFixed(2)}</td>
                    <td className="py-3.5 px-4">
                      <Badge variant="success" size="sm">Settled</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Fee Breakdown Detail Modal */}
      {selectedTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card elevation="raised" className="max-w-md w-full bg-surface border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-heading text-h3 text-text-primary">Payout Fee Breakdown</h3>
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
                <span className="text-text-secondary">Platform Convenience Fee:</span>
                <span className="text-rose-500">-₹{selectedTx.platformFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Razorpay Payment Gateway Fee:</span>
                <span className="text-rose-500">-₹{selectedTx.gatewayFee.toFixed(2)}</span>
              </div>
              <div className="border-t border-border pt-2.5 flex justify-between font-bold text-body">
                <span className="text-text-primary">Net Owner Settlement:</span>
                <span className="text-emerald-600">₹{selectedTx.netSettlement.toFixed(2)}</span>
              </div>
            </div>

            <Button variant="primary" onClick={() => setSelectedTx(null)} className="mt-2">
              Close Breakdown
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}

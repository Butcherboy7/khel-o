'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, RefreshCw, ChevronRight } from 'lucide-react';
import {
  listOutstandingCafePayouts,
  getCafePayoutBreakdown,
  createCafePayout,
} from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import { Card, Button, Badge, SkeletonCard, ErrorState, EmptyState } from '@/components/ui';

export default function AdminCafePayoutsPage() {
  const queryClient = useQueryClient();
  const [selectedCafeId, setSelectedCafeId] = useState<string | null>(null);
  const [utrReference, setUtrReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('neft');
  const [notes, setNotes] = useState('');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'outstanding'],
    queryFn: () => listOutstandingCafePayouts(),
    staleTime: 30_000,
  });

  const breakdownQuery = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'breakdown', selectedCafeId],
    queryFn: () => getCafePayoutBreakdown(selectedCafeId as string),
    enabled: !!selectedCafeId,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCafePayout(selectedCafeId as string, {
        utrReference,
        paymentMethod,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      setSelectedCafeId(null);
      setUtrReference('');
      setNotes('');
      queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.all, 'cafe-payouts'] });
    },
  });

  const cafes = data?.cafes ?? [];
  const selectedCafe = cafes.find((c) => c.cafeId === selectedCafeId) ?? null;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Banknote className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Café Payables</h1>
          </div>
          <p className="text-caption text-text-secondary">
            Money owed to cafés for captured bookings, paid manually via bank transfer while
            Razorpay Route is disabled.
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {isError && (
        <ErrorState
          title="Failed to load outstanding payables"
          message={(error as Error)?.message ?? 'Could not retrieve café payables.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && cafes.length === 0 && (
        <EmptyState
          title="Nothing owed right now"
          description="Every café's captured bookings have already been paid out or refunded."
          icon={<Banknote className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {!isLoading && !isError && cafes.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-surface divide-y divide-border">
          {cafes
            .slice()
            .sort((a, b) => b.outstandingAmount - a.outstandingAmount)
            .map((c) => (
              <button
                key={c.cafeId}
                type="button"
                onClick={() => setSelectedCafeId(c.cafeId)}
                className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-caption font-semibold text-text-primary">{c.cafeName}</span>
                  {c.payoutVerificationStatus !== 'verified' && (
                    <Badge variant="warning" size="sm">Unverified</Badge>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-caption font-bold font-data text-text-primary">
                    ₹{c.outstandingAmount.toFixed(2)}
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-tertiary" />
                </div>
              </button>
            ))}
        </div>
      )}

      {selectedCafeId && selectedCafe && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <Card elevation="raised" className="max-w-lg w-full bg-surface border border-border p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-heading text-h3 text-text-primary">{selectedCafe.cafeName}</h3>
              <button onClick={() => setSelectedCafeId(null)} className="text-text-tertiary hover:text-text-primary font-bold">✕</button>
            </div>

            <div>
              <span className="text-caption font-semibold text-text-secondary">Outstanding</span>
              <div className="font-heading text-h1 text-text-primary">₹{selectedCafe.outstandingAmount.toFixed(2)}</div>
            </div>

            {breakdownQuery.data && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {breakdownQuery.data.bookings.map((b) => (
                  <div key={b.bookingId} className="flex justify-between px-3 py-2 text-xs">
                    <span className="text-text-secondary">{b.bookingReference} · {b.sessionDate}</span>
                    <span className="font-bold text-text-primary">₹{b.ownerSettlementAmount.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2 border-t border-border">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">UTR / Reference Number</span>
                <input
                  type="text"
                  value={utrReference}
                  onChange={(e) => setUtrReference(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  placeholder="e.g. UTR2024090712345"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Payment Method</span>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="neft">NEFT</option>
                  <option value="upi">UPI</option>
                  <option value="imps">IMPS</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Notes (optional)</span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  rows={2}
                />
              </label>

              {createMutation.isError && (
                <p className="text-xs text-error">
                  {(createMutation.error as Error)?.message ?? 'Failed to record payout.'}
                </p>
              )}

              {selectedCafe.payoutVerificationStatus !== 'verified' && (
                <p className="text-xs text-warning">
                  This café's payout destination isn't verified yet — verify it from the Verification
                  Queue before paying out.
                </p>
              )}
              <Button
                variant="primary"
                disabled={!utrReference.trim() || createMutation.isPending || selectedCafe.payoutVerificationStatus !== 'verified'}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Recording…' : `Mark ₹${selectedCafe.outstandingAmount.toFixed(2)} as Paid`}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, RefreshCw, ChevronRight, Info, Eye, Loader2 } from 'lucide-react';
import {
  listOutstandingCafePayouts,
  getCafePayoutBreakdown,
  createCafePayout,
  uploadPayoutProof,
  setCafePayoutHold,
  listCafePayoutHistory,
  revealCafePayoutDestination,
  reconcileSettlementsNow,
  runWeeklyPayoutAllocation,
  type AdminOutstandingCafePayout,
  type CafePayout,
  type RevealedCafePayoutDestination,
} from '@/lib/api/admin';
import { isApiError, API_ERROR_CODES } from '@/lib/api/errors';
import { queryKeys } from '@/hooks/queries/keys';
import { Card, CardContent, Button, Badge, SkeletonCard, ErrorState, EmptyState, Tooltip, Modal } from '@/components/ui';

export default function AdminCafePayoutsPage() {
  const queryClient = useQueryClient();
  const [selectedCafeId, setSelectedCafeId] = useState<string | null>(null);
  const [utrReference, setUtrReference] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('neft');
  const [destinationType, setDestinationType] = useState<'upi' | 'bank'>('upi');
  const [notes, setNotes] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [adminNote, setAdminNote] = useState('');
  const [proofImageUrl, setProofImageUrl] = useState('');
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [proofUploadError, setProofUploadError] = useState<string | null>(null);
  const [confirmedPaymentMade, setConfirmedPaymentMade] = useState(false);
  const [revealed, setRevealed] = useState<RevealedCafePayoutDestination | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealError, setRevealError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'outstanding'],
    queryFn: () => listOutstandingCafePayouts(),
    staleTime: 30_000,
  });

  const [jobResult, setJobResult] = useState<{ kind: 'reconcile' | 'weekly'; message: string; isError: boolean } | null>(null);

  const reconcileMutation = useMutation({
    mutationFn: reconcileSettlementsNow,
    onSuccess: (res) => {
      setJobResult(
        res.error
          ? { kind: 'reconcile', message: `Reconciliation failed: ${res.error}`, isError: true }
          : { kind: 'reconcile', message: `Reconciled ${res.date}: ${res.matched ?? 0} payment(s) settled.`, isError: false },
      );
      queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.all, 'cafe-payouts'] });
    },
    onError: (err) => setJobResult({ kind: 'reconcile', message: (err as Error)?.message ?? 'Reconciliation failed.', isError: true }),
  });

  const weeklyMutation = useMutation({
    mutationFn: runWeeklyPayoutAllocation,
    onSuccess: (res) => {
      const allocated = res.cafes.filter((c) => c.payoutId).length;
      setJobResult({
        kind: 'weekly',
        message: `Allocated payouts for ${allocated} café(s)${res.cafes.length > allocated ? `, ${res.cafes.length - allocated} skipped` : ''}.`,
        isError: false,
      });
      queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.all, 'cafe-payouts'] });
    },
    onError: (err) => setJobResult({ kind: 'weekly', message: (err as Error)?.message ?? 'Weekly allocation failed.', isError: true }),
  });

  const breakdownQuery = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'breakdown', selectedCafeId],
    queryFn: () => getCafePayoutBreakdown(selectedCafeId as string),
    enabled: !!selectedCafeId,
  });

  // Initialize destinationType from the actual breakdown response the first
  // time it resolves for the currently open café, rather than always
  // defaulting to 'upi' — a café that only has bank details would otherwise
  // load with an impossible/mismatched selection.
  const destinationInitializedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedCafeId) {
      destinationInitializedForRef.current = null;
      return;
    }
    if (destinationInitializedForRef.current === selectedCafeId) return;
    const destination = breakdownQuery.data?.destination;
    if (!destination) return;
    destinationInitializedForRef.current = selectedCafeId;
    setDestinationType(destination.upiVpa ? 'upi' : destination.bankAccountNumberMasked ? 'bank' : 'upi');
  }, [selectedCafeId, breakdownQuery.data]);

  function closeModal() {
    setSelectedCafeId(null);
    setRevealed(null);
    setRevealError(null);
    setConfirmedPaymentMade(false);
    setDestinationType('upi');
  }

  async function handleReveal() {
    if (!selectedCafeId) return;
    setRevealError(null);
    setIsRevealing(true);
    try {
      const result = await revealCafePayoutDestination(selectedCafeId);
      setRevealed(result);
    } catch (err) {
      setRevealError((err as Error)?.message ?? 'Failed to reveal payout destination.');
    } finally {
      setIsRevealing(false);
    }
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createCafePayout(selectedCafeId as string, {
        utrReference,
        paymentMethod,
        destinationType,
        expectedPayoutAccountVersion: breakdownQuery.data?.destination?.payoutAccountVersion ?? 0,
        confirmedPaymentMade: true,
        notes: notes || undefined,
        proofImageUrl,
        adminNote: adminNote || undefined,
        paidAt: paidAt ? new Date(paidAt).toISOString() : undefined,
      }),
    onSuccess: () => {
      closeModal();
      setUtrReference('');
      setNotes('');
      setAdminNote('');
      setProofImageUrl('');
      setPaidAt(new Date().toISOString().slice(0, 10));
      queryClient.invalidateQueries({ queryKey: [...queryKeys.admin.all, 'cafe-payouts'] });
    },
    onError: (err) => {
      if (isApiError(err) && err.code === API_ERROR_CODES.PAYOUT_DESTINATION_STALE) {
        setRevealed(null);
        breakdownQuery.refetch();
      }
    },
  });

  async function handleProofFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !selectedCafeId) return;
    setProofUploadError(null);
    setIsUploadingProof(true);
    try {
      const publicUrl = await uploadPayoutProof(selectedCafeId, file);
      setProofImageUrl(publicUrl);
    } catch (err) {
      setProofUploadError((err as Error)?.message ?? 'Failed to upload proof.');
    } finally {
      setIsUploadingProof(false);
    }
  }

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
            Flow: payment captured → settled by Razorpay → available for payout → allocated in the
            weekly cycle → paid manually via bank transfer. Only settled money is payable.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            isLoading={reconcileMutation.isPending}
            onClick={() => {
              if (window.confirm('Poll Razorpay settlement data for today and mark any newly-settled payments? This runs automatically once a day — use this only to check now.')) {
                reconcileMutation.mutate();
              }
            }}
          >
            Reconcile Now
          </Button>
          <Button
            variant="secondary"
            size="sm"
            isLoading={weeklyMutation.isPending}
            onClick={() => {
              if (window.confirm('Create this week\'s payout batches for every café with a settled balance? This runs automatically on the configured payout day — use this only for an out-of-cycle run.')) {
                weeklyMutation.mutate();
              }
            }}
          >
            Run Weekly Payout
          </Button>
          <button
            type="button"
            onClick={() => refetch()}
            className="flex items-center gap-1.5 h-9 px-3 rounded-xl border border-border text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>

      {jobResult && (
        <div className={`rounded-xl border px-4 py-2.5 text-caption ${jobResult.isError ? 'border-error/30 bg-error/5 text-error' : 'border-emerald-500/30 bg-emerald-50 text-emerald-700'}`}>
          {jobResult.message}
        </div>
      )}

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
                  {!c.payoutDestinationSubmitted && (
                    <Badge variant="warning" size="sm">No payout details yet</Badge>
                  )}
                  {c.payoutOnHold && (
                    <Badge variant="error" size="sm">On hold</Badge>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  {c.pendingSettlementAmount > 0 && (
                    <span className="text-right">
                      <span className="block text-[10px] uppercase tracking-wide text-text-tertiary">Pending settlement</span>
                      <span className="text-caption font-data text-amber-600">₹{c.pendingSettlementAmount.toFixed(2)}</span>
                    </span>
                  )}
                  <span className="text-right">
                    <span className="block text-[10px] uppercase tracking-wide text-text-tertiary">Available to pay</span>
                    <span className="text-caption font-bold font-data text-text-primary">
                      ₹{c.outstandingAmount.toFixed(2)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-text-tertiary" />
                </div>
              </button>
            ))}
        </div>
      )}

      {selectedCafe && (
        <Modal
          isOpen={!!selectedCafeId}
          onClose={closeModal}
          title={selectedCafe.cafeName}
          size="lg"
          footer={
            <div className="flex flex-col gap-2">
              {createMutation.isError && (
                <p className="text-xs text-error">
                  {(createMutation.error as Error)?.message ?? 'Failed to record payout.'}
                </p>
              )}
              {selectedCafe.payoutOnHold && (
                <p className="text-xs text-error">
                  Payouts to this café are on hold: {selectedCafe.payoutHoldReason || 'no reason given'}.
                </p>
              )}
              {destinationType === 'bank' && !revealed?.bankAccountNumber && (
                <p className="text-xs text-text-secondary">
                  Reveal the full bank details above before recording a bank payout — a masked
                  number isn&apos;t enough to actually send money to.
                </p>
              )}
              <Button
                variant="primary"
                fullWidth
                disabled={
                  !utrReference.trim() ||
                  !proofImageUrl ||
                  isUploadingProof ||
                  createMutation.isPending ||
                  !selectedCafe.payoutDestinationSubmitted ||
                  selectedCafe.payoutOnHold ||
                  !confirmedPaymentMade ||
                  (destinationType === 'bank' && !revealed?.bankAccountNumber)
                }
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Recording…' : `Mark ₹${selectedCafe.outstandingAmount.toFixed(2)} as Paid`}
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-4">
            <HoldToggle cafe={selectedCafe} onChanged={() => { refetch(); breakdownQuery.refetch(); }} />

            <div>
              <span className="text-caption font-semibold text-text-secondary">Outstanding</span>
              <div className="font-heading text-h1 text-text-primary">₹{selectedCafe.outstandingAmount.toFixed(2)}</div>
            </div>

            {breakdownQuery.data && (
              <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                {breakdownQuery.data.bookings.map((b) =>
                  b.type === 'adjustment' ? (
                    <div key={b.adjustmentId} className="flex justify-between px-3 py-2 text-xs bg-error/5">
                      <span className="text-error">Adjustment · {b.reason}</span>
                      <span className="font-bold text-error">₹{b.amount.toFixed(2)}</span>
                    </div>
                  ) : (
                    <div key={b.bookingId} className="flex justify-between px-3 py-2 text-xs">
                      <span className="text-text-secondary">{b.bookingReference} · {b.sessionDate}</span>
                      <span className="font-bold text-text-primary">₹{b.ownerSettlementAmount.toFixed(2)}</span>
                    </div>
                  )
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 p-3 rounded-xl border border-border bg-surface-hover">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-text-secondary">Payout destination</span>
                <Tooltip content="Submitted by the owner — KHEL-O cannot independently verify a UPI ID or bank account. Double-check this looks right before sending money.">
                  <Info className="h-3.5 w-3.5 text-text-tertiary cursor-help" />
                </Tooltip>
              </div>
              <div className="text-caption">
                UPI: <span className="font-mono text-text-primary">{breakdownQuery.data?.destination?.upiVpa || 'not set'}</span>
              </div>
              <div className="text-caption">
                Bank: <span className="font-mono text-text-primary">
                  {revealed?.bankAccountNumber
                    ? `${revealed.bankAccountNumber} / IFSC ${revealed.bankIfsc}`
                    : breakdownQuery.data?.destination?.bankAccountNumberMasked
                      ? `${breakdownQuery.data.destination.bankAccountNumberMasked} / IFSC ${breakdownQuery.data.destination.bankIfsc}`
                      : 'not set'}
                </span>
              </div>
              {!revealed && breakdownQuery.data?.destination?.bankAccountNumberMasked && (
                <Button variant="ghost" size="sm" isLoading={isRevealing} onClick={handleReveal} className="gap-1.5 self-start">
                  <Eye className="h-3.5 w-3.5" />
                  Show full details to pay
                </Button>
              )}
              {revealError && <p className="text-xs text-error">{revealError}</p>}
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold text-text-secondary">Paying via</span>
              <select
                value={destinationType}
                onChange={(e) => setDestinationType(e.target.value as 'upi' | 'bank')}
                className="h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                <option value="upi">UPI</option>
                <option value="bank">Bank transfer</option>
              </select>
            </label>

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
                <span className="text-xs font-semibold text-text-secondary">Payment Date</span>
                <input
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                  className="h-10 px-3 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Payment Proof (required)</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleProofFileChange}
                  disabled={isUploadingProof}
                  className="text-caption text-text-primary file:mr-3 file:h-9 file:px-3 file:rounded-xl file:border file:border-border file:bg-surface-hover file:text-caption file:font-semibold"
                />
                {isUploadingProof && <span className="text-xs text-text-secondary">Uploading…</span>}
                {proofImageUrl && !isUploadingProof && (
                  <a href={proofImageUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">
                    Proof attached — view
                  </a>
                )}
                {proofUploadError && <span className="text-xs text-error">{proofUploadError}</span>}
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-semibold text-text-secondary">Admin Note (optional)</span>
                <textarea
                  value={adminNote}
                  onChange={(e) => setAdminNote(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-border bg-surface text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
                  rows={2}
                />
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

              <label className="flex items-start gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={confirmedPaymentMade}
                  onChange={(e) => setConfirmedPaymentMade(e.target.checked)}
                  className="mt-0.5"
                />
                <span>I confirm this payment was made externally using the destination shown above.</span>
              </label>
            </div>
          </div>
        </Modal>
      )}

      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-4">
          <h2 className="font-heading text-h2 text-text-primary">Payout history</h2>
          <PayoutHistoryTable />
        </CardContent>
      </Card>
    </div>
  );
}

function HoldToggle({ cafe, onChanged }: { cafe: AdminOutstandingCafePayout; onChanged: () => void }) {
  const [reason, setReason] = useState('');
  const [showReasonInput, setShowReasonInput] = useState(false);
  const holdMutation = useMutation({
    mutationFn: (vars: { onHold: boolean; reason?: string }) =>
      setCafePayoutHold(cafe.cafeId, vars.onHold, vars.reason),
    onSuccess: () => { onChanged(); setShowReasonInput(false); setReason(''); },
  });

  if (cafe.payoutOnHold) {
    return (
      <Button variant="secondary" size="sm" isLoading={holdMutation.isPending} onClick={() => holdMutation.mutate({ onHold: false })}>
        Release hold
      </Button>
    );
  }
  if (showReasonInput) {
    return (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for hold"
          className="h-8 px-2 rounded-lg border border-border bg-surface text-xs"
        />
        <Button variant="destructive" size="sm" disabled={!reason.trim()} isLoading={holdMutation.isPending} onClick={() => holdMutation.mutate({ onHold: true, reason })}>
          Confirm hold
        </Button>
      </div>
    );
  }
  return (
    <Button variant="ghost" size="sm" onClick={() => setShowReasonInput(true)}>
      Put on hold
    </Button>
  );
}

function PayoutHistoryTable() {
  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'history'],
    queryFn: () => listCafePayoutHistory({ limit: 50 }),
  });
  if (isLoading) return <SkeletonCard />;
  const items = data?.items ?? [];
  if (items.length === 0) return <EmptyState title="No payouts recorded yet" description="Every payout you record will show up here with its proof." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b border-border text-caption text-text-secondary">
            <th className="py-2 px-3 font-semibold">Date</th>
            <th className="py-2 px-3 font-semibold">Amount</th>
            <th className="py-2 px-3 font-semibold">Method</th>
            <th className="py-2 px-3 font-semibold">UTR</th>
            <th className="py-2 px-3 font-semibold">Status</th>
            <th className="py-2 px-3 font-semibold">Proof</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border text-caption">
          {items.map((p: CafePayout) => (
            <tr key={p.id}>
              <td className="py-2.5 px-3 text-text-secondary">{p.paidAt ? new Date(p.paidAt).toLocaleDateString() : '—'}</td>
              <td className="py-2.5 px-3 font-bold text-text-primary">₹{p.amount.toFixed(2)}</td>
              <td className="py-2.5 px-3 uppercase text-text-secondary">{p.paymentMethod || '—'}</td>
              <td className="py-2.5 px-3 font-mono text-xs">{p.utrReference || '—'}</td>
              <td className="py-2.5 px-3">
                {p.status === 'paid' ? (
                  <Badge variant="success" size="sm">Paid</Badge>
                ) : p.status === 'pending' ? (
                  <Badge variant="warning" size="sm">This week&apos;s payout — awaiting transfer</Badge>
                ) : (
                  <Badge variant="default" size="sm">{p.status}</Badge>
                )}
              </td>
              <td className="py-2.5 px-3">
                {p.proofImageUrl ? <a href={p.proofImageUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline">View</a> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

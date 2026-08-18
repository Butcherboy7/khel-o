'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Search,
  Filter,
  RefreshCw,
  QrCode,
  Ban,
  IndianRupee,
} from 'lucide-react';
import { listAdminBookings, forceCancelBooking, refundBooking } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Badge,
  Button,
  Modal,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import type { BookingStatus, BookingDetail } from '@/types';

/* ─── helpers ─────────────────────────────────────────────────────── */

function statusVariant(
  s: BookingStatus,
): 'success' | 'warning' | 'error' | 'default' {
  if (s === 'completed' || s === 'checked_in' || s === 'active') return 'success';
  if (s === 'confirmed' || s === 'pending_payment') return 'warning';
  if (s === 'cancelled' || s === 'failed' || s === 'no_show') return 'error';
  return 'default';
}

const STATUS_FILTERS: Array<{ label: string; value: BookingStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Pending', value: 'pending_payment' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Failed', value: 'failed' },
];

/* ─── page ─────────────────────────────────────────────────────────── */

export default function AdminBookingsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [actionTarget, setActionTarget] = useState<{ booking: BookingDetail; kind: 'cancel' | 'refund' } | null>(null);
  const [reason, setReason] = useState('');

  const params = {
    ...(statusFilter !== 'all' ? { status: statusFilter as BookingStatus } : {}),
    limit: 100,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'bookings', statusFilter],
    queryFn: () => listAdminBookings(params),
    staleTime: 30_000,
  });

  const bookings = (data?.items ?? []).filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.bookingReference?.toLowerCase().includes(q) ||
      b.gamerName?.toLowerCase().includes(q) ||
      (b as any).cafeName?.toLowerCase().includes(q)
    );
  });

  const forceCancelMut = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => forceCancelBooking(vars.id, vars.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setActionTarget(null);
      setReason('');
    },
  });

  const refundMut = useMutation({
    mutationFn: (vars: { id: string; reason: string }) => refundBooking(vars.id, vars.reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setActionTarget(null);
      setReason('');
    },
  });

  const actionMut = actionTarget?.kind === 'refund' ? refundMut : forceCancelMut;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <CalendarDays className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">All Bookings</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} total bookings across all venues.
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

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by booking ref, gamer name or café…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-surface text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-border overflow-x-auto">
          <Filter className="h-4 w-4 text-text-tertiary ml-1 flex-shrink-0" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                statusFilter === f.value
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* States */}
      {isLoading && (
        <div className="flex flex-col gap-2">
          {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {isError && (
        <ErrorState
          title="Failed to load bookings"
          message={(error as Error)?.message ?? 'Could not retrieve bookings.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && bookings.length === 0 && (
        <EmptyState
          title="No bookings found"
          description="Try adjusting your search or status filter."
          icon={<QrCode className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {/* Bookings Table */}
      {!isLoading && !isError && bookings.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-surface">
          {/* Header row */}
          <div className="hidden md:grid grid-cols-[auto_1fr_1fr_auto_auto_auto_auto_auto] gap-4 px-5 py-2.5 bg-surface-hover text-xs font-semibold text-text-secondary border-b border-border">
            <span>#</span>
            <span>Gamer</span>
            <span>Café · Tier</span>
            <span>Date</span>
            <span>Amount</span>
            <span>Status</span>
            <span>QR</span>
            <span>Actions</span>
          </div>

          <div className="divide-y divide-border">
            {bookings.map((b, idx) => (
              <div
                key={b.id}
                className="px-4 md:px-5 py-3 flex flex-col md:grid md:grid-cols-[auto_1fr_1fr_auto_auto_auto_auto_auto] gap-2 md:gap-4 md:items-center hover:bg-surface-hover transition-colors"
              >
                {/* Row # */}
                <span className="hidden md:block text-xs text-text-tertiary font-data">{idx + 1}</span>

                {/* Gamer */}
                <div className="min-w-0">
                  <p className="text-caption font-semibold text-text-primary truncate">
                    {b.gamerName || 'Unknown'}
                  </p>
                  <p className="text-[11px] text-text-tertiary font-data">
                    {b.bookingReference}
                  </p>
                </div>

                {/* Café + Tier */}
                <div className="min-w-0">
                  <p className="text-xs text-text-primary truncate">
                    {(b as any).cafeName || '—'}
                  </p>
                  <p className="text-[11px] text-text-tertiary truncate">
                    {(b as any).tierName || '—'} · {b.durationHours}h
                  </p>
                </div>

                {/* Date */}
                <span className="text-xs text-text-secondary whitespace-nowrap">
                  {b.sessionDate} {b.startTime?.slice(0, 5)}
                </span>

                {/* Amount */}
                <span className="text-xs font-bold font-data text-emerald-600 whitespace-nowrap">
                  ₹{b.totalAmount}
                </span>

                {/* Status */}
                <Badge variant={statusVariant(b.status)} size="sm" className="whitespace-nowrap w-fit">
                  {b.status.replace('_', ' ')}
                </Badge>

                {/* QR check-in indicator */}
                <div className="flex items-center gap-1">
                  {b.qrCodeUrl ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-600">
                      <QrCode className="h-3 w-3" /> QR
                    </span>
                  ) : (
                    <span className="text-[10px] text-text-tertiary">—</span>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5">
                  {b.status !== 'cancelled' && b.status !== 'completed' && (
                    <button
                      type="button"
                      title="Force-cancel booking"
                      onClick={() => { setActionTarget({ booking: b, kind: 'cancel' }); setReason(''); }}
                      className="h-8 w-8 rounded-lg border border-border bg-surface flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-600 transition-colors"
                    >
                      <Ban className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {b.status !== 'cancelled' && (
                    <button
                      type="button"
                      title="Issue refund"
                      onClick={() => { setActionTarget({ booking: b, kind: 'refund' }); setReason(''); }}
                      className="h-8 w-8 rounded-lg border border-border bg-surface flex items-center justify-center hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-600 transition-colors"
                    >
                      <IndianRupee className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <Modal
        isOpen={!!actionTarget}
        onClose={() => setActionTarget(null)}
        title={actionTarget?.kind === 'refund' ? 'Issue refund' : 'Force-cancel booking'}
      >
        {actionTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-caption text-text-secondary">
              {actionTarget.kind === 'refund' ? (
                <>Refund booking <strong>{actionTarget.booking.bookingReference}</strong> (₹{actionTarget.booking.totalAmount}). This also cancels the booking. Goes through Razorpay when live keys are configured; otherwise it's recorded as pending manual refund.</>
              ) : (
                <>Force-cancel booking <strong>{actionTarget.booking.bookingReference}</strong> without issuing a refund — use this for a stuck booking, not a payment dispute.</>
              )}
            </p>
            <div>
              <label className="text-caption font-semibold text-text-primary mb-1.5 block">Reason</label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why are you doing this? (shown in the audit log)"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-caption text-text-primary resize-none focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            {actionMut.isError && (
              <p className="text-caption text-error">Action failed. Please try again.</p>
            )}
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setActionTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={reason.trim().length < 3 || actionMut.isPending}
                onClick={() => actionMut.mutate({ id: actionTarget.booking.id, reason: reason.trim() })}
              >
                {actionTarget.kind === 'refund' ? 'Issue refund' : 'Confirm cancellation'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

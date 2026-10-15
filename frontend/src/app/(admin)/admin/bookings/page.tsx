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

// Mirrors BOOKING_STATUS_CONFIG in components/ui/Badge.tsx so the wording a
// gamer sees on their booking (e.g. "Payment Pending") matches what admins
// see in this table — only the color grouping differs (ops-focused here),
// never the label text for the same status.
const STATUS_LABELS: Record<BookingStatus, string> = {
  pending_payment: 'Payment Pending',
  confirmed: 'Confirmed',
  checked_in: 'Checked In',
  active: 'In Session',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No Show',
  failed: 'Payment Failed',
  released_by_owner: 'Slot Released',
};

const STATUS_FILTERS: Array<{ label: string; value: BookingStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Confirmed', value: 'confirmed' },
  { label: 'Active', value: 'active' },
  { label: 'Completed', value: 'completed' },
  { label: 'Pending', value: 'pending_payment' },
  { label: 'Cancelled', value: 'cancelled' },
  { label: 'Failed', value: 'failed' },
];

/** ₹249.6 → "₹249.60", ₹520 → "₹520": paise only when there are any. */
function money(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `₹${v.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** "Sat, 4 Oct" (year added only when it isn't this year). */
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** "21:00" → "9:00 PM". */
function timeLabel(hhmm?: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

const hoursLabel = (h: number) => `${Number(h)} ${Number(h) === 1 ? 'hr' : 'hrs'}`;

/** Cancel + refund, always in the same two slots so the column lines up
 *  even when an action doesn't apply to a booking. */
function RowActions({
  b,
  onAction,
}: {
  b: BookingDetail;
  onAction: (kind: 'cancel' | 'refund') => void;
}) {
  const canCancel = b.status !== 'cancelled' && b.status !== 'completed';
  const canRefund = b.status !== 'cancelled';
  const btn =
    'h-8 w-8 rounded-lg border border-border bg-card flex items-center justify-center text-text-secondary transition-colors';
  return (
    <div className="flex items-center justify-end gap-1.5">
      {canCancel ? (
        <button
          type="button"
          title="Force-cancel booking"
          aria-label={`Force-cancel ${b.bookingReference}`}
          onClick={() => onAction('cancel')}
          className={`${btn} hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-600`}
        >
          <Ban className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="h-8 w-8" aria-hidden />
      )}
      {canRefund ? (
        <button
          type="button"
          title="Issue refund"
          aria-label={`Refund ${b.bookingReference}`}
          onClick={() => onAction('refund')}
          className={`${btn} hover:bg-amber-500/10 hover:border-amber-500/30 hover:text-amber-600`}
        >
          <IndianRupee className="h-3.5 w-3.5" />
        </button>
      ) : (
        <span className="h-8 w-8" aria-hidden />
      )}
    </div>
  );
}

/** What was paid, then who gets what, then the offer if one applied. */
function AmountCell({ b, align = 'right' }: { b: BookingDetail; align?: 'left' | 'right' }) {
  return (
    <div className={align === 'right' ? 'text-right' : 'text-left'}>
      <div className="font-data text-body font-bold tabular-nums text-text-primary">{money(b.totalAmount)}</div>
      {b.ownerSettlementAmount != null && (
        <div className="font-data text-[11px] tabular-nums text-text-tertiary">
          Café {money(b.ownerSettlementAmount)} · KHELO {money(b.platformFeeAmount)}
        </div>
      )}
      {b.discountAmount > 0 && (
        <div className="text-[11px] font-semibold text-primary-dark">
          {money(b.discountAmount)} off {money(b.baseAmount)}
        </div>
      )}
    </div>
  );
}

/* ─── page ─────────────────────────────────────────────────────────── */

export default function AdminBookingsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [campaignOnly, setCampaignOnly] = useState(false);
  const [actionTarget, setActionTarget] = useState<{ booking: BookingDetail; kind: 'cancel' | 'refund' } | null>(null);
  const [reason, setReason] = useState('');

  const params = {
    ...(statusFilter !== 'all' ? { status: statusFilter as BookingStatus } : {}),
    ...(campaignOnly ? { campaignOnly: true } : {}),
    limit: 50,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'bookings', statusFilter, campaignOnly],
    queryFn: () => listAdminBookings(params),
    staleTime: 30_000,
  });

  const bookings = (data?.items ?? []).filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.bookingReference?.toLowerCase().includes(q) ||
      b.gamerName?.toLowerCase().includes(q) ||
      b.cafeName?.toLowerCase().includes(q)
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
        <button
          type="button"
          aria-pressed={campaignOnly}
          onClick={() => setCampaignOnly((v) => !v)}
          className={`h-10 px-4 rounded-xl border text-xs font-semibold whitespace-nowrap transition-colors ${
            campaignOnly ? 'bg-primary text-white border-primary' : 'border-border bg-surface text-text-secondary hover:bg-surface-hover'
          }`}
        >
          Campaign bookings only
        </button>
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

      {/* Bookings: one shared set of columns on desktop, compact cards on phones */}
      {!isLoading && !isError && bookings.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[920px] text-left">
              <thead className="bg-surface text-[12px] font-semibold text-text-secondary">
                <tr>
                  <th scope="col" className="w-10 py-2.5 pl-5 pr-2 text-right font-semibold">#</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Gamer</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Café · Setup</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">When</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-2.5 text-center font-semibold">Check-in QR</th>
                  <th scope="col" className="py-2.5 pl-3 pr-5 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bookings.map((b, idx) => (
                  <tr key={b.id} className="align-middle transition-colors hover:bg-surface-hover">
                    <td className="py-3 pl-5 pr-2 text-right font-data text-[12px] tabular-nums text-text-tertiary">{idx + 1}</td>
                    <td className="max-w-[12rem] px-3 py-3">
                      <div className="truncate text-caption font-semibold text-text-primary">{b.gamerName || 'Unknown'}</div>
                      <div className="font-data text-[11px] text-text-tertiary">{b.bookingReference}</div>
                    </td>
                    <td className="max-w-[16rem] px-3 py-3">
                      <div className="truncate text-caption text-text-primary">{b.cafeName || '—'}</div>
                      <div className="truncate text-[11px] text-text-tertiary">
                        {b.tierName || '—'} · {hoursLabel(b.durationHours)}
                      </div>
                      {b.campaignName && (
                        <div
                          className="truncate text-[11px] font-semibold text-primary-dark"
                          title={`${b.campaignName}${b.offerTitle ? ` · ${b.offerTitle}` : ''}`}
                        >
                          {b.campaignName}
                          {b.offerTitle ? ` · ${b.offerTitle}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="text-caption text-text-primary">{dayLabel(b.sessionDate)}</div>
                      <div className="text-[11px] tabular-nums text-text-tertiary">{timeLabel(b.startTime)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <AmountCell b={b} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <Badge variant={statusVariant(b.status)} size="sm" className="whitespace-nowrap">
                        {STATUS_LABELS[b.status] ?? b.status.replace('_', ' ')}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {b.qrCodeUrl ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                          <QrCode className="h-3.5 w-3.5" /> Issued
                        </span>
                      ) : (
                        <span className="text-[11px] text-text-tertiary">—</span>
                      )}
                    </td>
                    <td className="py-3 pl-3 pr-5">
                      <RowActions
                        b={b}
                        onAction={(kind) => {
                          setActionTarget({ booking: b, kind });
                          setReason('');
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card md:hidden">
            {bookings.map((b) => (
              <li key={b.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-caption font-semibold text-text-primary">{b.gamerName || 'Unknown'}</div>
                    <div className="font-data text-[11px] text-text-tertiary">{b.bookingReference}</div>
                  </div>
                  <Badge variant={statusVariant(b.status)} size="sm" className="shrink-0 whitespace-nowrap">
                    {STATUS_LABELS[b.status] ?? b.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="text-[12px] text-text-secondary">
                  {b.cafeName || '—'} · {b.tierName || '—'} · {hoursLabel(b.durationHours)}
                  <br />
                  {dayLabel(b.sessionDate)}, {timeLabel(b.startTime)}
                </div>
                {b.campaignName && (
                  <div className="truncate text-[11px] font-semibold text-primary-dark">
                    {b.campaignName}
                    {b.offerTitle ? ` · ${b.offerTitle}` : ''}
                  </div>
                )}
                <div className="flex items-end justify-between gap-3">
                  <AmountCell b={b} align="left" />
                  <RowActions
                    b={b}
                    onAction={(kind) => {
                      setActionTarget({ booking: b, kind });
                      setReason('');
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
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
                <>Refund booking <strong>{actionTarget.booking.bookingReference}</strong> (₹{actionTarget.booking.totalAmount}). This also cancels the booking. Goes through Razorpay when live keys are configured; otherwise it&apos;s recorded as pending manual refund.</>
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

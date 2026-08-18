'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CreditCard,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  RotateCcw,
} from 'lucide-react';
import { listAdminPayments } from '@/lib/api/admin';
import type { AdminPayment } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import { Badge, SkeletonCard, ErrorState, EmptyState } from '@/components/ui';

/* ─── helpers ─────────────────────────────────────────────────────── */

type PayStatus = AdminPayment['status'];

function payStatusVariant(s: PayStatus): 'success' | 'warning' | 'error' | 'default' {
  if (s === 'captured') return 'success';
  if (s === 'created') return 'warning';
  if (s === 'failed') return 'error';
  if (s === 'refunded') return 'default';
  return 'default';
}

function PayStatusIcon({ s }: { s: PayStatus }) {
  if (s === 'captured') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (s === 'failed') return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  if (s === 'refunded') return <RotateCcw className="h-3.5 w-3.5 text-text-secondary" />;
  return <Clock className="h-3.5 w-3.5 text-amber-500" />;
}

const STATUS_FILTERS: Array<{ label: string; value: PayStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Captured', value: 'captured' },
  { label: 'Pending', value: 'created' },
  { label: 'Failed', value: 'failed' },
  { label: 'Refunded', value: 'refunded' },
];

/* ─── page ─────────────────────────────────────────────────────────── */

export default function AdminPaymentsPage() {
  const [statusFilter, setStatusFilter] = useState<PayStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const params = {
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    limit: 50,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'payments', statusFilter],
    queryFn: () => listAdminPayments(params),
    staleTime: 30_000,
  });

  const payments = (data?.items ?? []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.bookingReference?.toLowerCase().includes(q) ||
      p.razorpayPaymentId?.toLowerCase().includes(q) ||
      p.razorpayOrderId?.toLowerCase().includes(q) ||
      p.gamerEmail?.toLowerCase().includes(q) ||
      p.cafeName?.toLowerCase().includes(q)
    );
  });

  // Totals for summary strip
  const totalCaptured = (data?.items ?? [])
    .filter((p) => p.status === 'captured')
    .reduce((s, p) => s + p.amount, 0);
  const totalFailed = (data?.items ?? []).filter((p) => p.status === 'failed').length;
  const totalRefunded = (data?.items ?? []).filter((p) => p.status === 'refunded').length;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <CreditCard className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Payment Oversight</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} total transactions across all venues.
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

      {/* Summary strip */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">Captured GMV</span>
            <span className="font-heading text-h2 font-bold text-emerald-600">
              ₹{totalCaptured.toLocaleString('en-IN')}
            </span>
          </div>
          <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-red-700 uppercase tracking-wide">Failed</span>
            <span className="font-heading text-h2 font-bold text-red-600">{totalFailed}</span>
          </div>
          <div className="p-4 rounded-2xl bg-surface border border-border flex flex-col gap-1">
            <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wide">Refunded</span>
            <span className="font-heading text-h2 font-bold text-text-secondary">{totalRefunded}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by booking ref, Razorpay ID, gamer email or café…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-surface text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-border">
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
          {[1, 2, 3, 4].map((i) => <SkeletonCard key={i} />)}
        </div>
      )}
      {isError && (
        <ErrorState
          title="Failed to load payments"
          message={(error as Error)?.message ?? 'Could not retrieve payment records.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && payments.length === 0 && (
        <EmptyState
          title="No payments found"
          description="Try adjusting your search or status filter."
          icon={<CreditCard className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {/* Payments table */}
      {!isLoading && !isError && payments.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-surface">
          {/* Header row */}
          <div className="hidden lg:grid grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-4 px-5 py-2.5 bg-surface-hover text-xs font-semibold text-text-secondary border-b border-border">
            <span>Status</span>
            <span>Gamer · Ref</span>
            <span>Café · Razorpay ID</span>
            <span>Amount</span>
            <span>Date</span>
            <span>Refund</span>
          </div>

          <div className="divide-y divide-border">
            {payments.map((p) => (
              <div
                key={p.id}
                className="px-4 lg:px-5 py-3.5 flex flex-col lg:grid lg:grid-cols-[auto_1fr_1fr_auto_auto_auto] gap-2 lg:gap-4 lg:items-center hover:bg-surface-hover transition-colors"
              >
                {/* Status icon + badge */}
                <div className="flex items-center gap-1.5">
                  <PayStatusIcon s={p.status} />
                  <Badge variant={payStatusVariant(p.status)} size="sm" className="capitalize whitespace-nowrap">
                    {p.status}
                  </Badge>
                </div>

                {/* Gamer + booking ref */}
                <div className="min-w-0">
                  <p className="text-caption font-semibold text-text-primary truncate">{p.gamerEmail}</p>
                  <p className="text-[11px] text-text-tertiary font-data truncate">
                    Ref: {p.bookingReference}
                  </p>
                </div>

                {/* Café + Razorpay IDs */}
                <div className="min-w-0">
                  <p className="text-xs text-text-primary font-semibold truncate">{p.cafeName}</p>
                  <p className="text-[11px] text-text-tertiary font-data truncate">
                    {p.razorpayPaymentId ?? p.razorpayOrderId}
                  </p>
                </div>

                {/* Amount */}
                <span className="text-sm font-bold font-data text-emerald-600 whitespace-nowrap">
                  ₹{Number(p.amount).toLocaleString('en-IN')}
                </span>

                {/* Date */}
                <span className="text-xs text-text-tertiary whitespace-nowrap">
                  {new Date(p.createdAt).toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: '2-digit',
                  })}
                </span>

                {/* Refund status */}
                <span className="text-xs">
                  {p.refundId ? (
                    <span className="text-text-secondary font-data">
                      {p.refundId.slice(0, 12)}…
                    </span>
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

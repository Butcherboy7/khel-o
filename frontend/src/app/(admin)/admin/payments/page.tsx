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
import { SkeletonCard, ErrorState, EmptyState } from '@/components/ui';

/* ─── helpers ─────────────────────────────────────────────────────── */

type PayStatus = AdminPayment['status'];

const PAY_LABELS: Record<PayStatus, string> = {
  created: 'Pending',
  captured: 'Captured',
  failed: 'Failed',
  refunded: 'Refunded',
};

function PayStatus({ s, reason }: { s: PayStatus; reason?: string | null }) {
  const tone =
    s === 'captured'
      ? 'bg-emerald-500/10 text-emerald-700'
      : s === 'failed'
      ? 'bg-red-500/10 text-red-700'
      : s === 'refunded'
      ? 'bg-surface text-text-secondary'
      : 'bg-amber-500/10 text-amber-700';
  const Icon = s === 'captured' ? CheckCircle2 : s === 'failed' ? XCircle : s === 'refunded' ? RotateCcw : Clock;
  return (
    <span
      title={s === 'failed' && reason ? reason : undefined}
      className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}
    >
      <Icon className="h-3 w-3" />
      {PAY_LABELS[s] ?? s}
    </span>
  );
}

/** ₹249.6 → "₹249.60", ₹520 → "₹520": paise only when there are any. */
function money(n: number): string {
  const v = Number(n ?? 0);
  return `₹${v.toLocaleString('en-IN', {
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

const dateLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
const clockLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

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
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[
            { label: 'Money captured', value: money(totalCaptured), tone: 'text-emerald-600' },
            { label: 'Failed payments', value: String(totalFailed), tone: totalFailed ? 'text-red-600' : 'text-text-primary' },
            { label: 'Refunded', value: String(totalRefunded), tone: 'text-text-primary' },
          ].map((k) => (
            <div key={k.label} className="flex flex-col gap-0.5 rounded-xl border border-border bg-card p-4">
              <span className="text-caption text-text-secondary">{k.label}</span>
              <span className={`font-data text-h2 font-bold tabular-nums ${k.tone}`}>{k.value}</span>
            </div>
          ))}
          {data && data.total > data.items.length && (
            <p className="text-[12px] text-text-tertiary sm:col-span-3">
              These add up the latest {data.items.length} of {data.total} payments shown below.
            </p>
          )}
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

      {/* Payments: one shared set of columns on desktop, compact cards on phones */}
      {!isLoading && !isError && payments.length > 0 && (
        <>
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-border bg-card">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-surface text-[12px] font-semibold text-text-secondary">
                <tr>
                  <th scope="col" className="py-2.5 pl-5 pr-3 font-semibold">Status</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Gamer</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Café</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Razorpay ID</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  <th scope="col" className="px-3 py-2.5 font-semibold">Date</th>
                  <th scope="col" className="py-2.5 pl-3 pr-5 font-semibold">Refund</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => (
                  <tr key={p.id} className="align-middle transition-colors hover:bg-surface-hover">
                    <td className="whitespace-nowrap py-3 pl-5 pr-3">
                      <PayStatus s={p.status} reason={p.failureReason} />
                    </td>
                    <td className="max-w-[15rem] px-3 py-3">
                      <div className="truncate text-caption font-semibold text-text-primary" title={p.gamerEmail}>
                        {p.gamerEmail}
                      </div>
                      <div className="font-data text-[11px] text-text-tertiary">{p.bookingReference}</div>
                    </td>
                    <td className="max-w-[12rem] px-3 py-3">
                      <div className="truncate text-caption text-text-primary">{p.cafeName}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-data text-[11px] text-text-secondary">{p.razorpayPaymentId ?? p.razorpayOrderId}</div>
                      <div className="text-[11px] text-text-tertiary">{p.razorpayPaymentId ? 'Payment' : 'Order only, not paid'}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-right font-data text-body font-bold tabular-nums text-text-primary">
                      {money(p.amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3">
                      <div className="text-caption text-text-primary">{dateLabel(p.createdAt)}</div>
                      <div className="text-[11px] tabular-nums text-text-tertiary">{clockLabel(p.createdAt)}</div>
                    </td>
                    <td className="whitespace-nowrap py-3 pl-3 pr-5 text-[11px]">
                      {p.refundId ? (
                        <span className="font-data text-text-secondary" title={p.refundId}>
                          {p.refundId.slice(0, 14)}…
                        </span>
                      ) : (
                        <span className="text-text-tertiary">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card md:hidden">
            {payments.map((p) => (
              <li key={p.id} className="flex flex-col gap-1.5 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-caption font-semibold text-text-primary">{p.gamerEmail}</div>
                    <div className="font-data text-[11px] text-text-tertiary">{p.bookingReference}</div>
                  </div>
                  <span className="shrink-0 font-data text-body font-bold tabular-nums text-text-primary">{money(p.amount)}</span>
                </div>
                <div className="text-[12px] text-text-secondary">
                  {p.cafeName} · {dateLabel(p.createdAt)}, {clockLabel(p.createdAt)}
                </div>
                <PayStatus s={p.status} reason={p.failureReason} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

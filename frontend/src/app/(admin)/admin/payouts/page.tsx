'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Landmark,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  AlertTriangle,
} from 'lucide-react';
import { listOwnerPayouts } from '@/lib/api/admin';
import type { AdminOwnerPayout } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import { Badge, SkeletonCard, ErrorState, EmptyState } from '@/components/ui';

/* ─── helpers ─────────────────────────────────────────────────────── */

type KycStatus = AdminOwnerPayout['kycStatus'];

function kycVariant(s: KycStatus): 'success' | 'warning' | 'error' | 'default' {
  if (s === 'activated') return 'success';
  if (s === 'pending' || s === 'submitted') return 'warning';
  if (s === 'suspended' || s === 'rejected') return 'error';
  return 'default';
}

function KycIcon({ s }: { s: KycStatus }) {
  if (s === 'activated') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (s === 'suspended' || s === 'rejected') return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <Clock className="h-3.5 w-3.5 text-amber-500" />;
}

const STATUS_FILTERS: Array<{ label: string; value: KycStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Activated', value: 'activated' },
  { label: 'Pending', value: 'pending' },
  { label: 'Submitted', value: 'submitted' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Rejected', value: 'rejected' },
];

/* ─── page ─────────────────────────────────────────────────────────── */

export default function AdminPayoutsPage() {
  const [statusFilter, setStatusFilter] = useState<KycStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  const params = {
    ...(statusFilter !== 'all' ? { kycStatus: statusFilter } : {}),
    limit: 50,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'payouts', statusFilter],
    queryFn: () => listOwnerPayouts(params),
    staleTime: 30_000,
  });

  const payouts = (data?.items ?? []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.ownerEmail?.toLowerCase().includes(q) ||
      p.ownerFullName?.toLowerCase().includes(q) ||
      p.cafeName?.toLowerCase().includes(q)
    );
  });

  const failingCount = (data?.items ?? []).filter((p) => p.failedTransferCount > 0).length;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Landmark className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Owner Payouts</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} café owners with a Razorpay Route account on file. Owners submit
            their own bank details from Owner Portal → Payouts — this is where you see who&apos;s stuck.
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

      {failingCount > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-caption text-red-600">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>
            <strong>{failingCount}</strong> owner{failingCount !== 1 ? 's have' : ' has'} at least one
            failed Route transfer — their settlement money did not reach their bank. Check the
            failed-transfer column below.
          </span>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by owner name, email or café…"
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
          title="Failed to load payouts"
          message={(error as Error)?.message ?? 'Could not retrieve owner payout accounts.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && payouts.length === 0 && (
        <EmptyState
          title="No payout accounts yet"
          description="Owners haven't submitted bank details, or none match your search/filter. This list only shows owners who've started payout setup — it does not list owners who haven't touched Payouts & Razorpay at all."
          icon={<Landmark className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {/* Table */}
      {!isLoading && !isError && payouts.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-surface">
          <div className="hidden md:grid grid-cols-[1.4fr_1fr_1fr_auto_auto_auto] gap-4 px-5 py-2.5 bg-surface-hover text-xs font-semibold text-text-secondary border-b border-border">
            <span>Owner</span>
            <span>Café</span>
            <span>Bank Account</span>
            <span>KYC</span>
            <span>Pending Settlement</span>
            <span>Failed Transfers</span>
          </div>

          <div className="divide-y divide-border">
            {payouts.map((p) => (
              <div
                key={p.id}
                className="px-4 md:px-5 py-3 flex flex-col md:grid md:grid-cols-[1.4fr_1fr_1fr_auto_auto_auto] gap-2 md:gap-4 md:items-center hover:bg-surface-hover transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-caption font-semibold text-text-primary truncate">
                    {p.ownerFullName || 'Unknown'}
                  </p>
                  <p className="text-[11px] text-text-tertiary truncate">{p.ownerEmail}</p>
                </div>

                <span className="text-xs text-text-secondary truncate">{p.cafeName || '—'}</span>

                <div className="min-w-0">
                  <p className="text-xs text-text-primary truncate">
                    {p.accountHolderName || '—'}
                  </p>
                  <p className="text-[11px] text-text-tertiary font-data truncate">
                    {p.bankAccountNumberMasked || '—'} {p.bankIfsc ? `· ${p.bankIfsc}` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <KycIcon s={p.kycStatus} />
                  <Badge variant={kycVariant(p.kycStatus)} size="sm" className="whitespace-nowrap w-fit">
                    {p.kycStatus}
                  </Badge>
                </div>

                <span className="text-xs font-bold font-data text-text-primary whitespace-nowrap">
                  ₹{p.pendingSettlementAmount.toFixed(2)}
                </span>

                <span className={`text-xs font-bold font-data whitespace-nowrap flex items-center gap-1 ${p.failedTransferCount > 0 ? 'text-red-600' : 'text-text-tertiary'}`}>
                  {p.failedTransferCount > 0 && <Ban className="h-3 w-3" />}
                  {p.failedTransferCount}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

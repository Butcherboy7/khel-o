'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Tag,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Ban,
} from 'lucide-react';
import { listAdminPromotions, deactivatePromotion, listAdminCafes } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Badge,
  Button,
  Modal,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import type { Promotion } from '@/types';

/* ─── helpers ─────────────────────────────────────────────────────── */

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function formatDateRange(validFrom: string, validUntil: string): string {
  const from = new Date(validFrom);
  const until = new Date(validUntil);
  const fmt = (d: Date) => d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  return `${fmt(from)} – ${fmt(until)}`;
}

function isExpired(validUntil: string): boolean {
  return new Date(validUntil).getTime() < Date.now();
}

const STATUS_FILTERS: Array<{ label: string; value: 'all' | 'active' | 'inactive' }> = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

/* ─── page ─────────────────────────────────────────────────────────── */

export default function AdminPromotionsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [deactivateTarget, setDeactivateTarget] = useState<Promotion | null>(null);

  const params = {
    ...(statusFilter !== 'all' ? { isActive: statusFilter === 'active' } : {}),
    limit: 50,
  };

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'promotions', statusFilter],
    queryFn: () => listAdminPromotions(params),
    staleTime: 30_000,
  });

  // The promotion record only carries cafeId, not a café name — resolve it
  // client-side against the café list rather than adding a backend join for
  // what's a small, already-cached-elsewhere dataset.
  const { data: cafesData } = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafes-for-promo-lookup'],
    queryFn: () => listAdminCafes({ limit: 50 }),
    staleTime: 5 * 60_000,
  });
  const cafeNameById = new Map((cafesData?.items ?? []).map((c) => [c.id, c.name]));

  const promotions = (data?.items ?? []).filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const cafeName = cafeNameById.get(p.cafeId) ?? '';
    return (
      p.title?.toLowerCase().includes(q) ||
      cafeName.toLowerCase().includes(q)
    );
  });

  const deactivateMut = useMutation({
    mutationFn: (promotionId: string) => deactivatePromotion(promotionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.all });
      setDeactivateTarget(null);
    },
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <Tag className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Promotions</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} promo codes across all cafés. Café owners create their own — this
            is oversight, so a runaway or abused promo can be shut off platform-side.
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
            placeholder="Search by promo title or café…"
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
          title="Failed to load promotions"
          message={(error as Error)?.message ?? 'Could not retrieve promotions.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && promotions.length === 0 && (
        <EmptyState
          title="No promotions found"
          description="Try adjusting your search or status filter."
          icon={<Tag className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {/* Table */}
      {!isLoading && !isError && promotions.length > 0 && (
        <div className="rounded-2xl border border-border overflow-hidden bg-surface">
          <div className="hidden md:grid grid-cols-[1.2fr_1fr_auto_auto_1.1fr_auto_auto] gap-4 px-5 py-2.5 bg-surface-hover text-xs font-semibold text-text-secondary border-b border-border">
            <span>Promo</span>
            <span>Café</span>
            <span>Discount</span>
            <span>Uses</span>
            <span>Valid Window</span>
            <span>Status</span>
            <span>Actions</span>
          </div>

          <div className="divide-y divide-border">
            {promotions.map((p) => {
              const expired = isExpired(p.validUntil);
              const exhausted = p.maxUses != null && p.currentUses >= p.maxUses;
              return (
                <div
                  key={p.id}
                  className="px-4 md:px-5 py-3 flex flex-col md:grid md:grid-cols-[1.2fr_1fr_auto_auto_1.1fr_auto_auto] gap-2 md:gap-4 md:items-center hover:bg-surface-hover transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-caption font-semibold text-text-primary truncate">
                      {p.title}
                    </p>
                    <p className="text-[11px] text-text-tertiary truncate">
                      {p.daysOfWeek.length > 0
                        ? p.daysOfWeek.map((d) => DAY_LABELS[d] ?? d).join(', ')
                        : 'Every day'}
                      {' · '}
                      {String(p.startHour).padStart(2, '0')}:00–{String(p.endHour).padStart(2, '0')}:00
                    </p>
                  </div>

                  <span className="text-xs text-text-secondary truncate">
                    {cafeNameById.get(p.cafeId) ?? p.cafeId.slice(0, 8)}
                  </span>

                  <span className="text-xs font-bold font-data text-text-primary whitespace-nowrap">
                    {p.discountPercentage}%
                  </span>

                  <span className={`text-xs font-data whitespace-nowrap ${exhausted ? 'text-red-600 font-bold' : 'text-text-secondary'}`}>
                    {p.currentUses}{p.maxUses != null ? ` / ${p.maxUses}` : ''}
                  </span>

                  <span className={`text-xs whitespace-nowrap ${expired ? 'text-red-600' : 'text-text-secondary'}`}>
                    {formatDateRange(p.validFrom, p.validUntil)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {p.isActive ? (
                      <Badge variant={expired || exhausted ? 'warning' : 'success'} size="sm" className="whitespace-nowrap w-fit">
                        <CheckCircle2 className="h-3 w-3" />
                        {expired ? 'Expired' : exhausted ? 'Exhausted' : 'Active'}
                      </Badge>
                    ) : (
                      <Badge variant="default" size="sm" className="whitespace-nowrap w-fit">
                        <XCircle className="h-3 w-3" />
                        Inactive
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    {p.isActive && (
                      <button
                        type="button"
                        title="Deactivate promotion"
                        onClick={() => setDeactivateTarget(p)}
                        className="h-8 w-8 rounded-lg border border-border bg-surface flex items-center justify-center hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-600 transition-colors"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Modal
        isOpen={!!deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        title="Deactivate promotion"
      >
        {deactivateTarget && (
          <div className="flex flex-col gap-4">
            <p className="text-caption text-text-secondary">
              Deactivate <strong>{deactivateTarget.title}</strong>
              {cafeNameById.get(deactivateTarget.cafeId) ? ` at ${cafeNameById.get(deactivateTarget.cafeId)}` : ''}?
              It has been used {deactivateTarget.currentUses}{deactivateTarget.maxUses != null ? ` of ${deactivateTarget.maxUses}` : ''} times.
              This stops it from applying to any new booking — it cannot be reactivated from here.
            </p>
            {deactivateMut.isError && (
              <p className="text-caption text-error">Action failed. Please try again.</p>
            )}
            <div className="flex items-center gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setDeactivateTarget(null)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                isLoading={deactivateMut.isPending}
                loadingText="Deactivating..."
                onClick={() => deactivateMut.mutate(deactivateTarget.id)}
              >
                Deactivate
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

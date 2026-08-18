'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Star,
  Search,
  Eye,
  EyeOff,
  RefreshCw,
  MessageSquare,
} from 'lucide-react';
import { listAdminReviews, setReviewVisibility } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Badge,
  Button,
  SkeletonCard,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import type { Review } from '@/types';

/* ─── helpers ─────────────────────────────────────────────────────── */

function StarRow({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3 w-3 ${i <= rating ? 'fill-amber-400 text-amber-400' : 'text-border'}`}
        />
      ))}
    </span>
  );
}

/* ─── page ─────────────────────────────────────────────────────────── */

export default function AdminReviewsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'visible' | 'hidden'>('all');

  const { data, isLoading, isError, error, refetch } = useQuery<{ items: Review[]; total: number }>({
    queryKey: [...queryKeys.admin.all, 'reviews'],
    queryFn: () => listAdminReviews({}),
    staleTime: 30_000,
  });

  const reviews = (data?.items ?? []).filter((r) => {
    const matchSearch = !search.trim()
      || r.gamerName?.toLowerCase().includes(search.toLowerCase())
      || r.comment?.toLowerCase().includes(search.toLowerCase());

    const matchVis =
      visibilityFilter === 'all'
        ? true
        : visibilityFilter === 'visible'
        ? r.isVisible
        : !r.isVisible;

    return matchSearch && matchVis;
  });

  const toggleMut = useMutation({
    mutationFn: ({ reviewId, isVisible }: { reviewId: string; isVisible: boolean }) =>
      setReviewVisibility(reviewId, isVisible),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.all }),
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h1 className="font-heading text-h1 text-text-primary">Review Moderation</h1>
          </div>
          <p className="text-caption text-text-secondary">
            {data?.total ?? '—'} reviews total · hide inappropriate content.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search by gamer name or review text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-border bg-surface text-caption text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface border border-border">
          {(['all', 'visible', 'hidden'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibilityFilter(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize whitespace-nowrap ${
                visibilityFilter === v
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover'
              }`}
            >
              {v === 'all' ? 'All' : v === 'visible' ? 'Visible' : 'Hidden'}
            </button>
          ))}
        </div>
      </div>

      {/* States */}
      {isLoading && <div className="flex flex-col gap-3">{[1, 2, 3].map((i) => <SkeletonCard key={i} />)}</div>}
      {isError && (
        <ErrorState
          title="Failed to load reviews"
          message={(error as Error)?.message ?? 'Could not load reviews.'}
          onRetry={() => refetch()}
        />
      )}
      {!isLoading && !isError && reviews.length === 0 && (
        <EmptyState
          title="No reviews found"
          description="Try adjusting your search or visibility filter."
          icon={<Star className="h-8 w-8 text-text-tertiary" />}
        />
      )}

      {/* Review list */}
      {!isLoading && !isError && reviews.length > 0 && (
        <div className="flex flex-col gap-3">
          {reviews.map((r) => (
            <div
              key={r.id}
              className={`p-4 rounded-2xl border flex flex-col sm:flex-row gap-3 sm:items-start transition-colors ${
                r.isVisible ? 'bg-surface border-border' : 'bg-red-500/5 border-red-500/20'
              }`}
            >
              {/* Left — info */}
              <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-caption text-text-primary">{r.gamerName}</span>
                  <StarRow rating={r.rating} />
                  <span className="text-[11px] text-text-tertiary">
                    {new Date(r.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' })}
                  </span>
                  {!r.isVisible && (
                    <Badge variant="error" size="sm">Hidden</Badge>
                  )}
                </div>

                {r.comment ? (
                  <p className="text-xs text-text-secondary leading-relaxed">&ldquo;{r.comment}&rdquo;</p>
                ) : (
                  <p className="text-xs text-text-tertiary italic">No comment left.</p>
                )}

                <p className="text-[11px] text-text-tertiary">Booking ID: {r.bookingId?.slice(0, 8)}…</p>
              </div>

              {/* Right — toggle */}
              <button
                type="button"
                onClick={() => toggleMut.mutate({ reviewId: r.id, isVisible: !r.isVisible })}
                disabled={toggleMut.isPending}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-xl border text-xs font-semibold transition-colors flex-shrink-0 disabled:opacity-50 ${
                  r.isVisible
                    ? 'border-red-500/30 text-red-600 hover:bg-red-500/10'
                    : 'border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10'
                }`}
              >
                {r.isVisible
                  ? <><EyeOff className="h-3.5 w-3.5" /> Hide</>
                  : <><Eye className="h-3.5 w-3.5" /> Restore</>
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

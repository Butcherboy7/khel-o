'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3 } from 'lucide-react';
import { getOwnerAnalytics, type OwnerInsights } from '@/lib/api/owner';
import { SkeletonCard, ErrorState, EmptyState } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import {
  CustomersPanel,
  EarningsStory,
  FunnelPanel,
  GamesAndReviews,
  NextSteps,
  StationsPanel,
  WeekGrid,
} from '@/components/owner/InsightsPanels';
import { cn } from '@/lib/cn';

interface AnalyticsResponse {
  topGames: { name: string; percentage: number }[];
  insights: OwnerInsights | null;
}

const PERIODS = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '3 months' },
];

/**
 * Insights, written for an owner who doesn't read dashboards: each section
 * opens with a plain sentence, says why it matters, and the "What to do next"
 * panel turns the numbers into a move with a button that goes and does it.
 */
export default function OwnerAnalyticsPage() {
  const [days, setDays] = useState(30);
  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['owner-insights', days],
    queryFn: () => getOwnerAnalytics(days) as Promise<AnalyticsResponse>,
    placeholderData: (prev) => prev,
  });
  const insights = data?.insights;

  return (
    <div className="flex flex-col gap-5">
      <OwnerPageHeader
        guide="analytics"
        title="Insights"
        description="How your café is doing, when it fills up, and what to do about it."
      />

      <div
        role="radiogroup"
        aria-label="Time period"
        className="flex w-full gap-1 rounded-2xl border border-border bg-card p-1 sm:w-fit"
      >
        {PERIODS.map((p) => {
          const on = p.days === days;
          return (
            <button
              key={p.days}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setDays(p.days)}
              className={cn(
                'min-h-[40px] flex-1 rounded-xl px-4 text-caption font-semibold transition-colors sm:flex-none',
                on ? 'bg-secondary text-white' : 'text-text-secondary hover:bg-surface hover:text-text-primary',
              )}
            >
              Last {p.label}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {isError && !data && (
        <ErrorState
          title="Couldn’t load your insights"
          message="Check your connection and try again."
          onRetry={() => refetch()}
        />
      )}

      {data && !insights && (
        <EmptyState
          title="Nothing to show yet"
          description="Once your café is set up and taking bookings, this page shows what you earn and when you’re busy."
          icon={<BarChart3 className="h-7 w-7" aria-hidden="true" />}
        />
      )}

      {insights && (
        <div
          className={cn('flex flex-col gap-4 transition-opacity duration-200', isFetching && 'opacity-60')}
          aria-busy={isFetching}
        >
          <EarningsStory key={`earn-${days}`} data={insights} />
          <NextSteps data={insights} />
          <WeekGrid key={`week-${days}`} data={insights} />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CustomersPanel data={insights} />
            <FunnelPanel data={insights} />
          </div>
          <StationsPanel data={insights} />
          <GamesAndReviews data={insights} topGames={data?.topGames ?? []} />
        </div>
      )}
    </div>
  );
}

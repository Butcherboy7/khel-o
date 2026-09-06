'use client';

import { useQuery } from '@tanstack/react-query';
import { Filter } from 'lucide-react';
import { getFunnel } from '@/lib/api/adminAnalytics';
import { SkeletonCard } from '@/components/ui';

export default function FunnelsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'funnels'],
    queryFn: getFunnel,
    staleTime: 60_000,
  });

  const stages = data
    ? [
        { label: 'Searches', value: data.searches },
        { label: 'Venue Views', value: data.venueViews },
        { label: 'Bookings Started', value: data.bookingsStarted },
        { label: 'Confirmed/Completed', value: data.bookingsConfirmedOrCompleted },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <Filter className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Funnels</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <div className="flex flex-col gap-3 max-w-xl">
          {stages.map((stage, idx) => {
            const prevValue = idx > 0 ? stages[idx - 1].value : stage.value;
            const dropoffPct = prevValue > 0 ? (100 - (stage.value / prevValue) * 100).toFixed(1) : '0.0';
            return (
              <div key={stage.label} className="rounded-xl border border-border p-4 bg-surface">
                <div className="flex justify-between items-baseline">
                  <span className="text-body-emphasis text-text-primary">{stage.label}</span>
                  <span className="font-data text-h3 text-text-primary">{stage.value}</span>
                </div>
                {idx > 0 && (
                  <span className="text-caption text-text-secondary">{dropoffPct}% drop from previous stage</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

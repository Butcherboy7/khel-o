'use client';

import { useQuery } from '@tanstack/react-query';
import { Activity } from 'lucide-react';
import { getMarketplaceHealth } from '@/lib/api/adminAnalytics';
import { StatCard, SkeletonCard } from '@/components/ui';

export default function MarketplaceHealthPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'marketplaceHealth'],
    queryFn: getMarketplaceHealth,
    staleTime: 60_000,
  });

  const successRate = data && data.totalBookings > 0
    ? ((data.completedCount / data.totalBookings) * 100).toFixed(1)
    : '0.0';
  const noResultRate = data && data.totalSearches > 0
    ? ((data.searchesWithNoResults / data.totalSearches) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <Activity className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Marketplace Health</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Completed" value={data.completedCount} subtext={`${successRate}% of ${data.totalBookings}`} />
          <StatCard label="Cancelled" value={data.cancelledCount} />
          <StatCard label="No-Shows" value={data.noShowCount} />
          <StatCard label="Failed" value={data.failedCount} />
          <StatCard label="Total Searches" value={data.totalSearches} />
          <StatCard label="Searches, No Results" value={data.searchesWithNoResults} subtext={`${noResultRate}%`} />
        </div>
      )}
    </div>
  );
}

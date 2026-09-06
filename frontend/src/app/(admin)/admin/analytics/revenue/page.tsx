'use client';

import { useQuery } from '@tanstack/react-query';
import { IndianRupee } from 'lucide-react';
import { getRevenueBreakdown } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { StatCard, SkeletonCard } from '@/components/ui';

export default function RevenuePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'revenue'],
    queryFn: getRevenueBreakdown,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <IndianRupee className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Revenue</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <StatCard label="GMV" value={formatCurrencyCompact(data.gmv)} subtext="all-time, confirmed+completed" />
            <StatCard label="KHELO Revenue" value={formatCurrencyCompact(data.khelRevenue)} subtext="convenience + gateway fee" />
            <StatCard label="Owner Settlements" value={formatCurrencyCompact(data.ownerSettlements)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h2 className="font-heading text-h3 text-text-primary mb-2">By City</h2>
              <ul className="flex flex-col gap-1">
                {Object.entries(data.revenueByCity).sort((a, b) => b[1] - a[1]).map(([city, amt]) => (
                  <li key={city} className="flex justify-between text-body border-b border-border py-1">
                    <span>{city}</span>
                    <span className="font-semibold">{formatCurrencyCompact(amt)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-heading text-h3 text-text-primary mb-2">By Platform</h2>
              <ul className="flex flex-col gap-1">
                {Object.entries(data.revenueByPlatform).sort((a, b) => b[1] - a[1]).map(([platform, amt]) => (
                  <li key={platform} className="flex justify-between text-body border-b border-border py-1">
                    <span>{platform}</span>
                    <span className="font-semibold">{formatCurrencyCompact(amt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

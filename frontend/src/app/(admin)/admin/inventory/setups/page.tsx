'use client';

import { useQuery } from '@tanstack/react-query';
import { Monitor } from 'lucide-react';
import { getSetupPerformance } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard } from '@/components/ui';
import { PlatformIcon } from '@/components/icons/PlatformIcons';

const PLATFORM_LABELS: Record<string, string> = {
  pc: 'PC',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  nintendo: 'Nintendo',
  other: 'Other',
  unspecified: 'Unspecified',
};

export default function SetupPerformancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'setups'],
    queryFn: getSetupPerformance,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <Monitor className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Setup / Platform Performance</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {data.map((row) => (
            <div key={row.platform} className="rounded-2xl border border-border p-5 bg-surface">
              <h3 className="flex items-center gap-2 font-heading text-h3 text-text-primary">
                <PlatformIcon platform={row.platform} className="h-4 w-4 text-primary flex-shrink-0" />
                {PLATFORM_LABELS[row.platform] ?? row.platform}
              </h3>
              <div className="mt-3 flex flex-col gap-1 text-body text-text-secondary">
                <span>Bookings: <strong className="text-text-primary">{row.bookings}</strong></span>
                <span>GMV: <strong className="text-text-primary">{formatCurrencyCompact(row.gmv)}</strong></span>
                <span>Seats: <strong className="text-text-primary">{row.totalSeats}</strong></span>
                <span>Utilization: <strong className="text-text-primary">{row.utilizationHours.toFixed(1)}h</strong></span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

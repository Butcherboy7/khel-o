'use client';

import { useQuery } from '@tanstack/react-query';
import { Megaphone } from 'lucide-react';
import { getMarketingAttribution } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard, EmptyState } from '@/components/ui';

export default function AttributionPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'attribution'],
    queryFn: getMarketingAttribution,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <Megaphone className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Marketing Attribution</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && data.length === 0 && (
        <EmptyState
          title="No attributed signups yet"
          description="This fills in as users register through campaign links or the signup dropdown — it only covers signups from today onward."
        />
      )}

      {data && data.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-body">
            <thead className="bg-surface text-caption text-text-secondary">
              <tr>
                <th className="text-left p-3">Source</th>
                <th className="text-right p-3">Users</th>
                <th className="text-right p-3">Bookings</th>
                <th className="text-right p-3">GMV</th>
              </tr>
            </thead>
            <tbody>
              {data.sort((a, b) => b.gmv - a.gmv).map((row) => (
                <tr key={row.source} className="border-t border-border">
                  <td className="p-3 font-semibold capitalize">{row.source}</td>
                  <td className="p-3 text-right">{row.users}</td>
                  <td className="p-3 text-right">{row.bookings}</td>
                  <td className="p-3 text-right">{formatCurrencyCompact(row.gmv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

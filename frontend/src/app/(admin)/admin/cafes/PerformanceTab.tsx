'use client';

import { useQuery } from '@tanstack/react-query';
import { getCafePerformance } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard } from '@/components/ui';

export function PerformanceTab() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'cafePerformance'],
    queryFn: getCafePerformance,
    staleTime: 60_000,
  });

  if (isLoading) return <SkeletonCard />;

  return (
    <div className="overflow-x-auto rounded-2xl border border-border">
      <table className="w-full text-body">
        <thead className="bg-surface text-caption text-text-secondary">
          <tr>
            <th className="text-left p-3">Café</th>
            <th className="text-left p-3">City</th>
            <th className="text-right p-3">Bookings</th>
            <th className="text-right p-3">GMV</th>
            <th className="text-right p-3">Avg Value</th>
            <th className="text-right p-3">Cancellations</th>
            <th className="text-right p-3">Repeat Customers</th>
            <th className="text-left p-3">Top Game</th>
          </tr>
        </thead>
        <tbody>
          {(data ?? []).map((row) => (
            <tr key={row.cafeId} className="border-t border-border">
              <td className="p-3 font-semibold">{row.cafeName}</td>
              <td className="p-3">{row.city}</td>
              <td className="p-3 text-right">{row.bookings}</td>
              <td className="p-3 text-right">{formatCurrencyCompact(row.gmv)}</td>
              <td className="p-3 text-right">{formatCurrencyCompact(row.avgBookingValue)}</td>
              <td className="p-3 text-right">{row.cancellations}</td>
              <td className="p-3 text-right">{row.repeatCustomers}</td>
              <td className="p-3">{row.topGame ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

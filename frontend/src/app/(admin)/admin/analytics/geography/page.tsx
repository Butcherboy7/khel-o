'use client';

import { useQuery } from '@tanstack/react-query';
import { MapPin } from 'lucide-react';
import { getGeography } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard } from '@/components/ui';

export default function GeographyPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'geography'],
    queryFn: getGeography,
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <MapPin className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">Geography</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <div className="overflow-x-auto rounded-2xl border border-border">
          <table className="w-full text-body">
            <thead className="bg-surface text-caption text-text-secondary">
              <tr>
                <th className="text-left p-3">City</th>
                <th className="text-right p-3">Cafés</th>
                <th className="text-right p-3">Bookings</th>
                <th className="text-right p-3">GMV</th>
              </tr>
            </thead>
            <tbody>
              {data.sort((a, b) => b.gmv - a.gmv).map((row) => (
                <tr key={row.city} className="border-t border-border">
                  <td className="p-3 font-semibold">{row.city}</td>
                  <td className="p-3 text-right">{row.cafeCount}</td>
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

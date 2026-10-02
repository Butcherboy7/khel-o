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

          {data.campaigns && data.campaigns.length > 0 && (
            <div>
              <h2 className="font-heading text-h3 text-text-primary mb-1">Campaign bookings</h2>
              <p className="text-caption text-text-secondary mb-2">
                The café is paid the list price minus the offer. KHELO&apos;s fee is a % of that offer price, added on top
                for the customer, so KHELO earns the fee and owes the café its share.
              </p>
              <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-caption">
                  <thead className="bg-surface-hover text-text-secondary">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Campaign</th>
                      <th className="px-3 py-2 text-right font-semibold">Bookings</th>
                      <th className="px-3 py-2 text-right font-semibold">List price</th>
                      <th className="px-3 py-2 text-right font-semibold">Offers given</th>
                      <th className="px-3 py-2 text-right font-semibold">Customers paid</th>
                      <th className="px-3 py-2 text-right font-semibold">Café share</th>
                      <th className="px-3 py-2 text-right font-semibold">KHELO fee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.campaigns.map((c) => (
                      <tr key={c.campaign}>
                        <td className="px-3 py-2 font-semibold text-text-primary">{c.campaign}</td>
                        <td className="px-3 py-2 text-right font-data">{c.bookings}</td>
                        <td className="px-3 py-2 text-right font-data">₹{c.listPrice.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-data">₹{c.discount.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-data">₹{c.customerPaid.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-data">₹{c.cafeShare.toFixed(2)}</td>
                        <td className="px-3 py-2 text-right font-data font-bold text-text-primary">₹{c.kheloFee.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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

'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import { getCampaignStats } from '@/lib/api/adminAnalytics';
import { formatCurrencyCompact } from '@/lib/format';
import { SkeletonCard } from '@/components/ui';

function pct(numerator: number, denominator: number): string {
  if (denominator <= 0) return '—';
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-1">
      <span className="text-caption text-text-secondary">{label}</span>
      <span className="font-heading text-h2 text-text-primary">{value}</span>
      {sub && <span className="text-caption text-text-secondary">{sub}</span>}
    </div>
  );
}

export default function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'campaigns', campaignId],
    queryFn: () => getCampaignStats(campaignId),
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex items-center gap-2">
        <QrCode className="h-6 w-6 text-primary" />
        <h1 className="font-heading text-h1 text-text-primary">{campaignId}</h1>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard label="Visits" value={data.visits} />
            <StatCard label="Unique Visitors" value={data.uniqueVisitors} />
            <StatCard label="Returning Visitors" value={data.returningVisitors} />
            <StatCard label="KHELO CTA Clicks" value={data.ctaClicks} sub={pct(data.ctaClicks, data.visits)} />
            <StatCard label="Instagram Clicks" value={data.instagramClicks} sub={pct(data.instagramClicks, data.visits)} />
            <StatCard label="Signups" value={data.signups} sub={pct(data.signups, data.ctaClicks)} />
            <StatCard label="Bookings" value={data.bookings} sub={pct(data.bookings, data.signups)} />
            <StatCard label="Booking Revenue" value={formatCurrencyCompact(data.revenue)} />
          </div>

          <div className="rounded-2xl border border-border bg-surface p-4 flex flex-col gap-2">
            <span className="text-caption font-semibold text-text-secondary">Funnels</span>
            <p className="text-body text-text-primary">
              Visits → KHELO CTA → Signups → Bookings: {data.visits} → {data.ctaClicks} → {data.signups} → {data.bookings}
            </p>
            <p className="text-body text-text-primary">
              Visits → Instagram Clicks: {data.visits} → {data.instagramClicks}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

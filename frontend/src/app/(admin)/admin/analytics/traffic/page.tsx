'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import { getTraffic, type TrafficGranularity, type TrafficTotals } from '@/lib/api/adminAnalytics';
import { StatCard, SkeletonCard } from '@/components/ui';
import { cn } from '@/lib/cn';

// Buckets shown per granularity: ~a month of days, a quarter of weeks, a year of months.
const RANGES: Record<TrafficGranularity, { periods: number; label: string; unit: string }> = {
  day: { periods: 30, label: 'Daily', unit: 'last 30 days' },
  week: { periods: 12, label: 'Weekly', unit: 'last 12 weeks' },
  month: { periods: 12, label: 'Monthly', unit: 'last 12 months' },
};

const METRICS: { key: keyof TrafficTotals; label: string }[] = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'activeUsers', label: 'Active Users' },
  { key: 'pageViews', label: 'Page Views' },
  { key: 'signups', label: 'Signups' },
  { key: 'bookings', label: 'Bookings' },
];

function trend(current: number, previous: number) {
  if (previous === 0) return undefined;
  const pct = ((current - previous) / previous) * 100;
  return { value: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%`, isPositive: pct >= 0 };
}

function bucketLabel(bucket: string, granularity: TrafficGranularity) {
  const d = new Date(`${bucket}T00:00:00`);
  if (granularity === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function TrafficPage() {
  const [granularity, setGranularity] = useState<TrafficGranularity>('day');
  const [metric, setMetric] = useState<keyof TrafficTotals>('visitors');
  const { periods, unit } = RANGES[granularity];

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'traffic', granularity, periods],
    queryFn: () => getTraffic(granularity, periods),
    staleTime: 60_000,
  });

  const max = data ? Math.max(1, ...data.series.map((b) => b[metric])) : 1;
  // Label every bucket for short series, otherwise roughly six evenly spaced ticks.
  const labelEvery = data ? Math.max(1, Math.ceil(data.series.length / 6)) : 1;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h1 className="font-heading text-h1 text-text-primary">Traffic</h1>
        </div>
        <div className="flex rounded-xl border border-border bg-surface p-1" role="tablist" aria-label="Granularity">
          {(Object.keys(RANGES) as TrafficGranularity[]).map((g) => (
            <button
              key={g}
              type="button"
              role="tab"
              aria-selected={granularity === g}
              onClick={() => setGranularity(g)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors',
                granularity === g ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {RANGES[g].label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <SkeletonCard />}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {METRICS.map(({ key, label }) => (
              <StatCard
                key={key}
                label={label}
                value={data.totals[key].toLocaleString('en-IN')}
                subtext={`${unit} · prev ${data.previousTotals[key].toLocaleString('en-IN')}`}
                trend={trend(data.totals[key], data.previousTotals[key])}
                onClick={() => setMetric(key)}
                className={cn('cursor-pointer', metric === key && 'ring-2 ring-primary')}
              />
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-heading text-h3 text-text-primary">
                {METRICS.find((m) => m.key === metric)?.label} per {granularity}
              </h2>
              <span className="text-caption text-text-secondary">Tap a card above to switch</span>
            </div>
            <div className="flex h-48 items-end gap-[2px]">
              {data.series.map((b) => (
                <div key={b.bucket} className="group relative flex h-full flex-1 items-end">
                  <div
                    className="w-full rounded-t bg-primary/80 group-hover:bg-primary transition-colors"
                    style={{ height: `${(b[metric] / max) * 100}%`, minHeight: b[metric] > 0 ? 2 : 0 }}
                  />
                  <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-secondary px-2 py-1 text-caption text-white opacity-0 group-hover:opacity-100 z-10">
                    {bucketLabel(b.bucket, granularity)}: {b[metric].toLocaleString('en-IN')}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-[2px]">
              {data.series.map((b, i) => (
                <span key={b.bucket} className="flex-1 truncate text-center text-caption text-text-secondary">
                  {i % labelEvery === 0 ? bucketLabel(b.bucket, granularity) : ''}
                </span>
              ))}
            </div>
          </div>

          <div className="max-w-xl">
            <h2 className="font-heading text-h3 text-text-primary mb-2">Top Pages · {unit}</h2>
            {data.topPages.length === 0 ? (
              <p className="text-body text-text-secondary">No page views recorded in this range yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {data.topPages.map((p) => (
                  <li key={p.path} className="flex justify-between gap-4 text-body border-b border-border py-1">
                    <span className="truncate font-data">{p.path}</span>
                    <span className="font-semibold">{p.views.toLocaleString('en-IN')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-caption text-text-secondary">
            Visitors are counted per browser (same person on two devices = 2). Page-view tracking started when this
            page shipped; signups and bookings include full history. Buckets use IST.
          </p>
        </>
      )}
    </div>
  );
}

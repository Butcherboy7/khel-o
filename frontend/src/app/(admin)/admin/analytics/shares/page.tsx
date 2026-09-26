'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Share2 } from 'lucide-react';
import { getShareReport, type ShareTotals } from '@/lib/api/adminAnalytics';
import { StatCard, SkeletonCard } from '@/components/ui';
import { cn } from '@/lib/cn';

const RANGES = [
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
];

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  facebook: 'Facebook',
  x: 'X',
  copy: 'Copied link',
  native: 'Phone share sheet',
};

// IST calendar date, matching how the backend buckets.
function istDate(offsetDays = 0): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 - offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

const COLUMNS: { key: keyof ShareTotals; label: string }[] = [
  { key: 'shares', label: 'Shares' },
  { key: 'opens', label: 'Opens' },
  { key: 'signups', label: 'Signups' },
  { key: 'bookings', label: 'Bookings' },
];

function ReportTable({ title, rows }: { title: string; rows: (ShareTotals & { name: string })[] }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-heading text-h3 text-text-primary">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-body text-text-secondary">No shares in this range yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-body">
            <thead className="bg-surface text-caption text-text-secondary">
              <tr>
                <th className="px-3 py-2 text-left font-semibold">Name</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} className="px-3 py-2 text-right font-semibold">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-t border-border">
                  <td className="px-3 py-2 text-text-primary">{r.name}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-3 py-2 text-right font-data tabular-nums">{r[c.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SharesPage() {
  const [days, setDays] = useState(30);
  const start = istDate(days - 1);
  const end = istDate(0);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'analytics', 'shares', start, end],
    queryFn: () => getShareReport(start, end),
    staleTime: 60_000,
  });

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Share2 className="h-6 w-6 text-primary" />
          <h1 className="font-heading text-h1 text-text-primary">Shares</h1>
        </div>
        <div className="flex rounded-xl border border-border bg-surface p-1" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button
              key={r.days}
              type="button"
              aria-pressed={days === r.days}
              onClick={() => setDays(r.days)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-caption font-semibold transition-colors',
                days === r.days ? 'bg-card text-text-primary shadow-sm' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <p className="max-w-prose text-body text-text-secondary">
        Every share button on the site creates its own tracked link. <b>Opens</b> are visits from those links;
        <b> signups</b> and <b>bookings</b> are from people whose first visit came through one.
      </p>

      {isLoading && <SkeletonCard />}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {COLUMNS.map((c) => (
              <StatCard key={c.key} label={c.label} value={data.totals[c.key].toLocaleString('en-IN')} subtext={`last ${days} days`} />
            ))}
          </div>
          <ReportTable
            title="By channel"
            rows={data.byChannel.map((r) => ({ ...r, name: CHANNEL_LABELS[r.channel] ?? r.channel }))}
          />
          <ReportTable title="By café" rows={data.byCafe.map((r) => ({ ...r, name: r.cafeName }))} />
        </>
      )}
    </div>
  );
}

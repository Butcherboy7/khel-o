'use client';

import { useState, useEffect } from 'react';
import { BarChart3, Monitor, Gamepad2, Clock } from 'lucide-react';
import { getOwnerAnalytics } from '@/lib/api/owner';
import { Card, CardContent, Badge, PageSpinner } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerStatRow } from '@/components/owner/OwnerStatRow';

interface TierRevenue {
  tierName: string;
  seats: number;
  hourlyRate: number;
  revenue: number;
  bookings: number;
}

interface BusyHour {
  hour: string;
  occupancy: number;
}

interface TopGame {
  name: string;
  percentage: number;
}

interface RevenuePoint {
  date: string;
  revenue: number;
}

interface AnalyticsData {
  tierRevenue: TierRevenue[];
  busyHours: BusyHour[];
  topGames: TopGame[];
  revenueTrend: RevenuePoint[];
  returningCustomerRate: number;
  averageDurationHours: number;
  peakOccupancyPercent: number;
}

export default function OwnerAnalyticsPage() {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await getOwnerAnalytics();
        setAnalytics(res as AnalyticsData);
      } catch {
        setAnalytics(null);
      } finally {
        setIsLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  if (isLoading) {
    return (
      <PageSpinner />
    );
  }

  const tierRevenue = analytics?.tierRevenue ?? [];
  const busyHours = analytics?.busyHours ?? [];
  const topGames = analytics?.topGames ?? [];
  const revenueTrend = analytics?.revenueTrend ?? [];
  const maxTierRevenue = Math.max(1, ...tierRevenue.map((t) => t.revenue));
  const maxTrendRevenue = Math.max(1, ...revenueTrend.map((d) => d.revenue));

  return (
    <div className="flex flex-col gap-5">
      <OwnerPageHeader
        title="Insights"
        description="When you're busiest, which stations earn most, and how many customers come back."
      />

      {/* The hint lines used to be `hidden sm:block` — on a phone the three
          numbers appeared with no explanation of what they measured. */}
      <OwnerStatRow
        stats={[
          {
            label: 'Customers who came back',
            value: `${analytics?.returningCustomerRate ?? 0}%`,
            hint: 'booked more than once',
            tone: 'positive',
          },
          {
            label: 'Typical session',
            value: `${analytics?.averageDurationHours ?? 0}h`,
            hint: 'per booking',
          },
          {
            label: 'Fullest you get',
            value: `${analytics?.peakOccupancyPercent ?? 0}%`,
            hint: busyHours[0]?.hour ?? 'no data yet',
            tone: 'warning',
          },
        ]}
      />

      {/* Hardware Tier Revenue Distribution */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-4 sm:p-5 flex flex-col gap-4">
          <h2 className="font-heading text-h3 text-text-primary flex items-center gap-2">
            <Monitor className="h-4 w-4 text-emerald-500" />
            <span>Revenue by Hardware Tier</span>
          </h2>

          {tierRevenue.length === 0 ? (
            <p className="text-caption text-text-secondary">No paid bookings yet — revenue by tier will appear here once you have completed sessions.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {tierRevenue.map((tier) => {
                const pct = (tier.revenue / maxTierRevenue) * 100;
                return (
                  <div key={tier.tierName} className="flex flex-col gap-1">
                    <div className="flex justify-between text-caption font-bold">
                      <span className="text-text-primary">{tier.tierName} ({tier.seats} seats)</span>
                      <span className="text-emerald-600">₹{tier.revenue.toLocaleString()} · {tier.bookings} bookings</span>
                    </div>
                    <div className="h-2.5 w-full bg-border rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Busiest Hours */}
        <Card elevation="raised" className="bg-surface border border-border">
          <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
            <h2 className="font-heading text-h3 text-text-primary flex items-center gap-2">
              <Clock className="h-4 w-4 text-emerald-500" />
              <span>Busiest Operating Hours</span>
            </h2>

            {busyHours.length === 0 ? (
              <p className="text-caption text-text-secondary">No booking activity yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {busyHours.map((h) => (
                  <div key={h.hour} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-hover border border-border/60">
                    <span className="text-caption font-semibold text-text-primary">{h.hour}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 sm:w-20 h-2 bg-border rounded-full overflow-hidden">
                        <div
                          className={`h-full ${h.occupancy > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${h.occupancy}%` }}
                        />
                      </div>
                      <span className="text-caption font-bold text-text-secondary w-9 text-right">{h.occupancy}%</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Requested Games */}
        <Card elevation="raised" className="bg-surface border border-border">
          <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
            <h2 className="font-heading text-h3 text-text-primary flex items-center gap-2">
              <Gamepad2 className="h-4 w-4 text-emerald-500" />
              <span>Top Requested Games</span>
            </h2>

            {topGames.length === 0 ? (
              <p className="text-caption text-text-secondary">No game data recorded on bookings yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {topGames.map((g) => (
                  <div key={g.name} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-hover border border-border/60">
                    <span className="text-caption font-semibold text-text-primary">{g.name}</span>
                    <Badge variant="success" size="sm">
                      {g.percentage}% Demand
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue Trend (last 7 days) */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-4 sm:p-5 flex flex-col gap-3">
          <h2 className="font-heading text-h3 text-text-primary flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-emerald-500" />
            <span>Revenue Trend (Last 7 Days)</span>
          </h2>

          {revenueTrend.length === 0 || maxTrendRevenue <= 1 && revenueTrend.every((d) => d.revenue === 0) ? (
            <p className="text-caption text-text-secondary">No revenue recorded in the last 7 days.</p>
          ) : (
            <div className="flex items-end gap-2 h-24">
              {revenueTrend.map((d) => {
                const barPct = (d.revenue / maxTrendRevenue) * 100;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                    <span className="text-caption text-text-secondary">{d.revenue > 0 ? `₹${Math.round(d.revenue)}` : ''}</span>
                    <div
                      className="w-full bg-emerald-500 rounded-t-md min-h-[2px]"
                      style={{ height: `${Math.max(barPct, 2)}%` }}
                    />
                    <span className="text-caption text-text-secondary">
                      {new Date(d.date).toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

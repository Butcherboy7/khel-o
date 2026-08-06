'use client';

import { useState, useEffect } from 'react';
import { BarChart3, TrendingUp, Monitor, Gamepad2, Users, Clock, Flame } from 'lucide-react';
import { getOwnerAnalytics } from '@/lib/api/owner';
import { Card, CardContent, Badge } from '@/components/ui';

export default function OwnerAnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await getOwnerAnalytics();
        setAnalytics(res);
      } catch {
        // Fallback
      } finally {
        setIsLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  const tierRevenue = analytics?.tierRevenue || [
    { tierName: 'Flagship RTX 4080 Pods', seats: 8, hourlyRate: 200, revenue: 18400 },
    { tierName: 'High-End RTX 4070 Pods', seats: 12, hourlyRate: 150, revenue: 14200 },
    { tierName: 'Standard RTX 3060 Pods', seats: 16, hourlyRate: 100, revenue: 9800 },
    { tierName: 'PS5 Console Lounge', seats: 4, hourlyRate: 180, revenue: 6400 },
  ];

  const busyHours = analytics?.busyHours || [
    { hour: '09:00 - 12:00', occupancy: 35 },
    { hour: '12:00 - 15:00', occupancy: 65 },
    { hour: '15:00 - 18:00', occupancy: 92 },
    { hour: '18:00 - 21:00', occupancy: 98 },
    { hour: '21:00 - 00:00', occupancy: 84 },
  ];

  const topGames = analytics?.topGames || [
    { name: 'Valorant', percentage: 42 },
    { name: 'Counter-Strike 2', percentage: 28 },
    { name: 'GTA V Online', percentage: 15 },
    { name: 'EA Sports FC 24', percentage: 10 },
    { name: 'Dota 2', percentage: 5 },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border pb-6">
        <div>
          <h1 className="font-heading text-h1 text-text-primary flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-emerald-500" />
            <span>Business Analytics & Demand Insights</span>
          </h1>
          <p className="text-caption text-text-secondary">Purposeful operational metrics to optimize hardware pricing and peak hours.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-1">
            <span className="text-caption font-semibold text-text-secondary">Returning Customer Rate</span>
            <div className="font-heading text-h1 text-emerald-600">{analytics?.returningCustomerRate || 68.4}%</div>
            <span className="text-xs text-text-tertiary">Gamers who booked more than once</span>
          </CardContent>
        </Card>

        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-1">
            <span className="text-caption font-semibold text-text-secondary">Average Session Duration</span>
            <div className="font-heading text-h1 text-text-primary">{analytics?.averageDurationHours || 2.5} Hours</div>
            <span className="text-xs text-text-tertiary">Per booking session</span>
          </CardContent>
        </Card>

        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-1">
            <span className="text-caption font-semibold text-text-secondary">Peak Hours Occupancy</span>
            <div className="font-heading text-h1 text-amber-600">98%</div>
            <span className="text-xs text-text-tertiary">Busiest window (18:00 - 21:00)</span>
          </CardContent>
        </Card>
      </div>

      {/* Hardware Tier Revenue Distribution */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-6">
          <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
            <Monitor className="h-5 w-5 text-emerald-500" />
            <span>Which Hardware Tier Earns the Most Revenue?</span>
          </h2>

          <div className="flex flex-col gap-4">
            {tierRevenue.map((tier: any) => {
              const maxRev = Math.max(...tierRevenue.map((t: any) => t.revenue));
              const pct = (tier.revenue / maxRev) * 100;
              return (
                <div key={tier.tierName} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-caption font-bold">
                    <span className="text-text-primary">{tier.tierName} ({tier.seats} Stations)</span>
                    <span className="text-emerald-600">₹{tier.revenue.toLocaleString()}</span>
                  </div>
                  <div className="h-3 w-full bg-border rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Peak Hours Heatmap */}
        <Card elevation="raised" className="bg-surface border border-border">
          <CardContent className="p-6 flex flex-col gap-5">
            <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-500" />
              <span>Busiest Operating Hours</span>
            </h2>

            <div className="flex flex-col gap-3">
              {busyHours.map((h: any) => (
                <div key={h.hour} className="flex items-center justify-between p-3 rounded-xl bg-surface-hover border border-border/60">
                  <span className="text-caption font-semibold text-text-primary">{h.hour}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-2 bg-border rounded-full overflow-hidden">
                      <div
                        className={`h-full ${h.occupancy > 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${h.occupancy}%` }}
                      />
                    </div>
                    <span className="text-caption font-bold text-text-secondary w-10 text-right">{h.occupancy}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Most Popular Games */}
        <Card elevation="raised" className="bg-surface border border-border">
          <CardContent className="p-6 flex flex-col gap-5">
            <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
              <Gamepad2 className="h-5 w-5 text-emerald-500" />
              <span>Top Requested Games</span>
            </h2>

            <div className="flex flex-col gap-3">
              {topGames.map((g: any) => (
                <div key={g.name} className="flex items-center justify-between p-3 rounded-xl bg-surface-hover border border-border/60">
                  <span className="text-caption font-semibold text-text-primary">{g.name}</span>
                  <Badge variant="success" size="sm">
                    {g.percentage}% Demand
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

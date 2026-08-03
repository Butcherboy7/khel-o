'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Store,
  DollarSign,
  CalendarCheck,
  Clock,
  TrendingUp,
  Award,
  PlusCircle,
  Tag,
  CheckSquare,
} from 'lucide-react';
import { getOwnerDashboard } from '@/lib/api/owner';
import { queryKeys } from '@/hooks/queries/keys';
import {
  StatCard,
  SkeletonStatCard,
  ErrorState,
  Button,
  Card,
  CardContent,
} from '@/components/ui';
import { formatCurrencyCompact } from '@/lib/format';

export default function OwnerDashboardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.owner.dashboard,
    queryFn: getOwnerDashboard,
    staleTime: 30_000,
    refetchInterval: 60_000, // Refresh dashboard stats every 60s
  });

  return (
    <div className="flex flex-col gap-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-h1 text-text-primary">Café Operations Dashboard</h1>
          <p className="text-body text-text-secondary mt-0.5">
            Real-time occupancy, revenue stats, and station booking management.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href="/owner/tiers">
            <Button variant="outline" size="sm" className="gap-1.5">
              <PlusCircle className="h-4 w-4" />
              <span>Add Hardware Tier</span>
            </Button>
          </Link>
          <Link href="/owner/promotions">
            <Button variant="primary" size="sm" className="gap-1.5">
              <Tag className="h-4 w-4" />
              <span>New Deal</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <section>
        <h2 className="font-heading text-h3 text-text-primary mb-4">Monthly Overview</h2>

        {isLoading && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
            <SkeletonStatCard />
          </div>
        )}

        {isError && (
          <ErrorState
            title="Failed to load dashboard KPIs"
            message={(error as Error)?.message || 'Could not retrieve operational stats.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && data && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              label="Revenue (This Month)"
              value={formatCurrencyCompact(data.revenueThisMonth || 0)}
              icon={<DollarSign className="h-5 w-5" />}
              subtext="Total earnings from station bookings"
            />

            <StatCard
              label="Bookings (This Month)"
              value={data.totalBookingsThisMonth || 0}
              icon={<CalendarCheck className="h-5 w-5" />}
              subtext="Completed & confirmed sessions"
            />

            <StatCard
              label="Bookings Today"
              value={data.upcomingBookingsToday || 0}
              icon={<Clock className="h-5 w-5" />}
              subtext="Upcoming & checked-in today"
            />

            <StatCard
              label="Occupancy Rate"
              value={`${data.occupancyRateThisWeek || 0}%`}
              icon={<TrendingUp className="h-5 w-5" />}
              subtext="Station utilization this week"
            />

            <StatCard
              label="Total Venues"
              value={data.totalCafes || 0}
              icon={<Store className="h-5 w-5" />}
              subtext="Active listed cafés"
            />

            <StatCard
              label="Top Tier"
              value={data.mostPopularTier || 'N/A'}
              icon={<Award className="h-5 w-5" />}
              subtext="Most booked station setup"
            />
          </div>
        )}
      </section>

      {/* Quick Action Navigation Modules */}
      <section className="flex flex-col gap-4">
        <h2 className="font-heading text-h3 text-text-primary">Management Modules</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card interactive elevation="resting">
            <Link href="/owner/bookings" className="block p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CheckSquare className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-h3 text-text-primary">Desk Check-in</h3>
              </div>
              <p className="text-caption text-text-secondary">
                View live bookings, scan gamer QR codes, and confirm station arrivals.
              </p>
            </Link>
          </Card>

          <Card interactive elevation="resting">
            <Link href="/owner/tiers" className="block p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <PlusCircle className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-h3 text-text-primary">Hardware Tiers</h3>
              </div>
              <p className="text-caption text-text-secondary">
                Manage RTX specs, seat allocations, and price per hour per tier.
              </p>
            </Link>
          </Card>

          <Card interactive elevation="resting">
            <Link href="/owner/promotions" className="block p-5">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10 text-success">
                  <Tag className="h-5 w-5" />
                </div>
                <h3 className="font-heading text-h3 text-text-primary">Promotions</h3>
              </div>
              <p className="text-caption text-text-secondary">
                Create discount codes, happy hour specials, and track deal usage.
              </p>
            </Link>
          </Card>
        </div>
      </section>
    </div>
  );
}

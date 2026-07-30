'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp,
  Activity,
  CalendarCheck,
  Store,
  Monitor,
  ReceiptText,
  Zap,
  CalendarX,
  AlertTriangle,
  Star,
  MapPin,
  Users,
} from 'lucide-react';
import { getOwnerCafe, listOwnerBookings } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { formatTime12h, formatDateLong, getTodayString, getCurrentTimeString } from '@/lib/format';

const getStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'confirmed':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200';
    case 'pending_payment':
      return 'bg-amber-50 text-amber-700 border border-amber-200';
    case 'cancelled':
      return 'bg-red-50 text-red-700 border border-red-200';
    case 'completed':
      return 'bg-gray-100 text-gray-700 border border-gray-200';
    case 'no_show':
      return 'bg-red-50 text-red-700 border border-red-200';
    default:
      return 'bg-gray-100 text-gray-700 border border-gray-200';
  }
};

export default function OwnerDashboardPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);

  // Fetch owner's café profile (first café in list)
  const {
    data: cafe,
    isLoading: isCafeLoading,
    isError: isCafeError,
    error: cafeError,
    refetch: refetchCafe,
  } = useQuery({
    queryKey: ['ownerCafe'],
    queryFn: getOwnerCafe,
    staleTime: 120_000,
    retry: 1,
  });

  // Fetch owner's bookings
  const {
    data: bookingsData,
    isLoading: isBookingsLoading,
    isError: isBookingsError,
    error: bookingsError,
    refetch: refetchBookings,
  } = useQuery({
    queryKey: ['ownerBookings'],
    queryFn: () => listOwnerBookings({ page: 1, limit: 100 }),
    staleTime: 60_000,
    retry: 1,
  });

  const handleRetryAll = () => {
    refetchCafe();
    refetchBookings();
  };

  const bookings = bookingsData?.bookings || [];

  // Derive firstName from fullName
  const firstName = useMemo(() => {
    if (!user?.fullName) return 'Partner';
    return user.fullName.split(' ')[0];
  }, [user]);

  // Calculations for KPIs
  const kpis = useMemo(() => {
    const todayStr = getTodayString();
    const currentTimeStr = getCurrentTimeString();

    let todayRevenue = 0;
    let confirmedTodayCount = 0;
    let activeNowCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;

    bookings.forEach((b) => {
      // KPI 1: Today's Revenue & Session count
      if (b.sessionDate === todayStr && ['confirmed', 'completed'].includes(b.status)) {
        todayRevenue += b.totalAmount || 0;
        confirmedTodayCount += 1;
      }

      // KPI 2: Active sessions right now
      if (
        b.sessionDate === todayStr &&
        b.status === 'confirmed' &&
        b.startTime <= currentTimeStr &&
        b.endTime >= currentTimeStr
      ) {
        activeNowCount += 1;
      }

      // KPI 3: completed vs cancelled
      if (b.status === 'completed') {
        completedCount += 1;
      } else if (b.status === 'cancelled') {
        cancelledCount += 1;
      }
    });

    return {
      todayRevenue,
      confirmedTodayCount,
      activeNowCount,
      totalBookingsCount: bookings.length,
      completedCount,
      cancelledCount,
    };
  }, [bookings]);

  // Sort and take last 5 bookings by createdAt
  const recentBookings = useMemo(() => {
    return [...bookings]
      .sort((a, b) => new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime())
      .slice(0, 5);
  }, [bookings]);

  // Verification Status Badge config
  const verificationBadge = useMemo(() => {
    if (!cafe) return null;
    switch (cafe.verificationStatus) {
      case 'verified':
        return {
          label: '✓ Verified Venue',
          className: 'bg-primary/20 text-primary border border-primary/30',
        };
      case 'pending':
        return {
          label: '⏳ Verification Pending',
          className: 'bg-warning/20 text-warning border border-warning/30',
        };
      case 'rejected':
        return {
          label: '✗ Verification Rejected',
          className: 'bg-error/20 text-error border border-error/30',
        };
      case 'suspended':
        return {
          label: '⚠ Suspended',
          className: 'bg-error/20 text-error border border-error/30',
        };
      default:
        return {
          label: cafe.verificationStatus,
          className: 'bg-gray-200 text-gray-700 border border-gray-300',
        };
    }
  }, [cafe]);

  // Loading state skeleton
  if (isCafeLoading || isBookingsLoading) {
    return (
      <div className="space-y-6 pb-24">
        {/* Welcome Header Skeleton */}
        <div className="h-36 bg-secondary/50 animate-pulse -mx-4 p-6 pt-8 flex flex-col justify-end">
          <div className="h-7 bg-white/20 rounded w-1/3 mb-2" />
          <div className="h-4 bg-white/20 rounded w-2/3" />
        </div>

        {/* KPI Cards Skeletons */}
        <div className="space-y-3 mx-4">
          <div className="card-base h-28 animate-pulse" />
          <div className="card-base h-28 animate-pulse" />
          <div className="card-base h-28 animate-pulse" />
        </div>

        {/* Quick Actions Grid Skeletons */}
        <div className="grid grid-cols-2 gap-3 mx-4">
          <div className="card-base h-24 animate-pulse" />
          <div className="card-base h-24 animate-pulse" />
          <div className="card-base h-24 animate-pulse" />
          <div className="card-base h-24 animate-pulse" />
        </div>
      </div>
    );
  }

  // Error state
  if (isCafeError && isBookingsError) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center p-6 space-y-4">
        <AlertTriangle className="w-16 h-16 text-error" />
        <h2 className="font-heading font-bold text-xl text-text-primary">
          Dashboard unavailable
        </h2>
        <p className="text-text-secondary text-sm max-w-sm">
          {cafeError?.message || bookingsError?.message || 'Unable to fetch dashboard metrics at this time.'}
        </p>
        <button
          type="button"
          onClick={handleRetryAll}
          className="btn-outline text-sm py-2 px-6 rounded-2xl"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      {/* SECTION 1: WELCOME HEADER (Full Bleed) */}
      <div className="-mx-4 bg-secondary text-white p-6 pt-8 shadow-sm">
        {cafe ? (
          <div>
            <h1 className="font-heading font-bold text-2xl text-white">
              Good morning, {firstName}
            </h1>
            <p className="font-body text-sm text-white/70 mt-1">
              Here&apos;s how your venue is performing today.
            </p>
            {verificationBadge && (
              <span className={`font-data text-xs px-3 py-1 rounded-full mt-3 inline-flex items-center gap-1 ${verificationBadge.className}`}>
                {verificationBadge.label}
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <h1 className="font-heading font-bold text-2xl text-white">
              Set up your venue
            </h1>
            <p className="font-body text-sm text-white/70">
              You haven&apos;t listed a café yet. Get started to reach gamers.
            </p>
            <button
              type="button"
              onClick={() => router.push('/owner/cafe')}
              className="btn-primary mt-2 text-xs py-2 px-5 min-h-[38px]"
            >
              List My Café
            </button>
          </div>
        )}
      </div>

      {cafe && (
        <>
          {/* SECTION 2: KPI CARDS GRID */}
          <div className="grid grid-cols-1 gap-3 mx-4">
            {/* KPI 1: Today's Revenue */}
            <div className="card-base p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-body text-sm text-text-secondary">Today&apos;s Revenue</span>
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div className="mt-2">
                <p className="font-data font-bold text-3xl text-text-technical">
                  ₹{kpis.todayRevenue.toFixed(2)}
                </p>
                <p className="font-body text-xs text-text-secondary mt-1">
                  {kpis.confirmedTodayCount} confirmed session(s) today
                </p>
              </div>
            </div>

            {/* KPI 2: Active Right Now */}
            <div className="card-base p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-body text-sm text-text-secondary">Active Sessions</span>
                <Activity className="w-5 h-5 text-primary" />
              </div>
              <div className="mt-2">
                <p className="font-data font-bold text-3xl text-text-primary">
                  {kpis.activeNowCount}
                </p>
                <p className="font-body text-xs text-text-secondary mt-1">
                  Currently in session
                </p>
              </div>
            </div>

            {/* KPI 3: Total Bookings */}
            <div className="card-base p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="font-body text-sm text-text-secondary">Total Bookings</span>
                <CalendarCheck className="w-5 h-5 text-primary" />
              </div>
              <div className="mt-2">
                <p className="font-data font-bold text-3xl text-text-primary">
                  {kpis.totalBookingsCount}
                </p>
                <p className="font-body text-xs text-text-secondary mt-1">
                  {kpis.completedCount} completed · {kpis.cancelledCount} cancelled
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 3: QUICK ACTIONS */}
          <div className="space-y-3">
            <h2 className="font-heading font-semibold text-base mx-4 mt-6">
              Quick Actions
            </h2>
            <div className="grid grid-cols-2 gap-3 mx-4">
              <div
                onClick={() => router.push('/owner/cafe')}
                className="card-base p-4 flex flex-col gap-2 active:scale-[0.98] cursor-pointer hover:border-primary/50"
              >
                <Store className="w-6 h-6 text-primary" />
                <div>
                  <h3 className="font-heading font-semibold text-sm text-text-primary">
                    Café Profile
                  </h3>
                  <p className="font-body text-xs text-text-secondary">
                    Edit details & photos
                  </p>
                </div>
              </div>

              <div
                onClick={() => router.push('/owner/tiers')}
                className="card-base p-4 flex flex-col gap-2 active:scale-[0.98] cursor-pointer hover:border-primary/50"
              >
                <Monitor className="w-6 h-6 text-primary" />
                <div>
                  <h3 className="font-heading font-semibold text-sm text-text-primary">
                    Hardware Tiers
                  </h3>
                  <p className="font-body text-xs text-text-secondary">
                    Manage rigs & pricing
                  </p>
                </div>
              </div>

              <div
                onClick={() => router.push('/owner/bookings')}
                className="card-base p-4 flex flex-col gap-2 active:scale-[0.98] cursor-pointer hover:border-primary/50"
              >
                <ReceiptText className="w-6 h-6 text-primary" />
                <div>
                  <h3 className="font-heading font-semibold text-sm text-text-primary">
                    Bookings
                  </h3>
                  <p className="font-body text-xs text-text-secondary">
                    Check-in & sessions
                  </p>
                </div>
              </div>

              <div
                onClick={() => router.push('/owner/promotions')}
                className="card-base p-4 flex flex-col gap-2 active:scale-[0.98] cursor-pointer hover:border-primary/50"
              >
                <Zap className="w-6 h-6 text-primary" />
                <div>
                  <h3 className="font-heading font-semibold text-sm text-text-primary">
                    Promotions
                  </h3>
                  <p className="font-body text-xs text-text-secondary">
                    Create discount deals
                  </p>
                </div>
              </div>

              <div
                onClick={() => router.push('/owner/staff')}
                className="card-base p-4 flex flex-col gap-2 active:scale-[0.98] cursor-pointer hover:border-primary/50"
              >
                <Users className="w-6 h-6 text-primary" />
                <div>
                  <h3 className="font-heading font-semibold text-sm text-text-primary">
                    Staff Accounts
                  </h3>
                  <p className="font-body text-xs text-text-secondary">
                    Manage scanner staff
                  </p>
                </div>
              </div>

              <div
                onClick={() => router.push('/owner/payouts')}
                className="card-base p-4 flex flex-col gap-2 active:scale-[0.98] cursor-pointer hover:border-primary/50 col-span-2 bg-gradient-to-r from-primary/5 to-primary/10 border border-primary/20"
              >
                <ReceiptText className="w-6 h-6 text-primary" />
                <div className="flex justify-between items-center w-full">
                  <div>
                    <h3 className="font-heading font-semibold text-sm text-text-primary">
                      Payout & KYC Setup
                    </h3>
                    <p className="font-body text-xs text-text-secondary">
                      Link bank account for instant Route splits
                    </p>
                  </div>
                  <span className="text-[10px] bg-primary text-white font-bold px-2 py-0.5 rounded-full font-heading">
                    Setup
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 4: RECENT BOOKINGS */}
          <div className="space-y-3">
            <h2 className="font-heading font-semibold text-base mx-4 mt-6">
              Recent Bookings
            </h2>

            {recentBookings.length === 0 ? (
              <div className="mx-4 card-base p-8 flex flex-col items-center gap-3 text-center">
                <CalendarX className="w-10 h-10 text-text-secondary/30" />
                <h3 className="font-heading font-semibold text-base text-text-secondary">
                  No bookings yet
                </h3>
                <p className="font-body text-xs text-text-secondary">
                  When gamers book your café, sessions appear here.
                </p>
              </div>
            ) : (
              <>
                <div className="mx-4 card-base p-0 overflow-hidden divide-y divide-border">
                  {recentBookings.map((b) => {
                    const statusClass = getStatusBadgeClass(b.status);
                    return (
                      <div
                        key={b.id}
                        onClick={() => router.push(`/owner/bookings?id=${b.id}`)}
                        className="flex items-center justify-between gap-3 px-4 py-3 active:bg-surface transition-colors cursor-pointer"
                      >
                        <div className="min-w-0">
                          <span className="font-data text-[10px] text-text-secondary">
                            {b.bookingReference || `GC-${b.id.slice(0, 5).toUpperCase()}`}
                          </span>
                          <h4 className="font-body text-sm font-semibold text-text-primary truncate">
                            {b.tierName || 'Gaming Rig'}
                          </h4>
                          <span className="font-body text-[10px] text-text-secondary block mt-0.5">
                            {formatDateLong(b.sessionDate)} · {formatTime12h(b.startTime)}
                          </span>
                        </div>

                        <div className="flex flex-col items-end flex-shrink-0">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-body font-semibold ${statusClass}`}>
                            {b.status.replace('_', ' ')}
                          </span>
                          <span className="font-data text-xs text-text-technical mt-1">
                            ₹{(b.totalAmount || 0).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mx-4 mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => router.push('/owner/bookings')}
                    className="font-body text-xs text-primary active:opacity-70 font-semibold"
                  >
                    View all bookings →
                  </button>
                </div>
              </>
            )}
          </div>

          {/* SECTION 5: VENUE STATS BANNER */}
          {cafe.verificationStatus === 'verified' && (
            <div className="mx-4 mt-6 card-base p-5 border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-text-secondary text-sm">
                  <Star className="w-4 h-4 text-warning fill-warning" />
                  <span>Average Rating</span>
                </div>
                <span className="font-data font-bold text-2xl text-text-primary">
                  {cafe.averageRating > 0 ? `${cafe.averageRating.toFixed(1)}/5` : 'New'}
                </span>
              </div>
              <p className="font-body text-xs text-text-secondary">
                {cafe.totalReviews || 0} review(s) from KHEL-O gamers
              </p>

              <div className="border-t border-border my-4" />

              <div className="space-y-2">
                <div className="flex items-center space-x-2.5 text-xs text-text-secondary">
                  <MapPin className="w-4 h-4 text-primary" />
                  <span>{cafe.city}, {cafe.state}</span>
                </div>
                <div className="flex items-center space-x-2.5 text-xs text-text-secondary">
                  <Users className="w-4 h-4 text-primary" />
                  <span>{cafe.totalSeats || 0} total seats published</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

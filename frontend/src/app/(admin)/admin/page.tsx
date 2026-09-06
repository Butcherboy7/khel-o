'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  BarChart3,
  TrendingUp,
  IndianRupee,
  Users,
  Store,
  CalendarDays,
  AlertCircle,
  Ban,
  Hourglass,
  LifeBuoy,
  Landmark,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { getAdminActionItems, listPendingCafes } from '@/lib/api/admin';
import { getExecutiveDashboard } from '@/lib/api/adminAnalytics';
import { queryKeys } from '@/hooks/queries/keys';
import { StatCard } from '@/components/ui';
import { formatCurrencyCompact } from '@/lib/format';

export default function AdminOverviewPage() {
  const { data: exec } = useQuery({
    queryKey: ['admin', 'analytics', 'executive'],
    queryFn: () => getExecutiveDashboard(30),
    staleTime: 60_000,
  });

  // "Needs attention" aggregate — failed transfers, failed refunds, stuck
  // payments, open tickets, pending KYC — the things Payments/Payouts/Support
  // would otherwise require separately checking to notice.
  const { data: actionItems } = useQuery({
    queryKey: [...queryKeys.admin.all, 'actionItems'],
    queryFn: getAdminActionItems,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const actionCards = actionItems
    ? [
        { label: 'Failed Route transfers', value: actionItems.failedRouteTransfers, href: '/admin/payouts', icon: Ban, critical: true, tooltip: 'Payout transfers to café owners that failed and need manual retry' },
        { label: 'Failed refunds', value: actionItems.failedRefunds, href: '/admin/payments', icon: IndianRupee, critical: true, tooltip: 'Refund API calls that failed — the customer was not actually refunded' },
        { label: 'Stuck pending payments', value: actionItems.stuckPendingPayments, href: '/admin/bookings', icon: Hourglass, critical: false, tooltip: 'Bookings stuck in PENDING_PAYMENT for over 20 minutes — likely abandoned checkouts' },
        { label: 'Open support tickets', value: actionItems.openSupportTickets, href: '/admin/support', icon: LifeBuoy, critical: false, tooltip: 'Customer support tickets awaiting a response' },
        { label: 'Owner KYC pending', value: actionItems.ownersKycPending, href: '/admin/payouts', icon: Landmark, critical: false, tooltip: "Café owners who haven't completed Razorpay payout KYC yet" },
      ]
    : [];
  const hasUrgentItems = actionCards.some((c) => c.critical && c.value > 0);

  // Pending café verification queue count — for the link card below, now that
  // the full queue UI lives at /admin/verification-queue instead of here.
  const { data: pendingData } = useQuery({
    queryKey: queryKeys.admin.pendingCafes(),
    queryFn: () => listPendingCafes(),
    staleTime: 30_000,
  });
  const pendingCount = pendingData?.items?.length ?? 0;

  return (
    <div className="flex flex-col gap-8 pb-12">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-6 w-6 text-primary" />
          <h1 className="font-heading text-h1 text-text-primary">Overview</h1>
        </div>
        <p className="text-body text-text-secondary">
          KHELO marketplace performance for the last {exec?.periodDays ?? 30} days.
        </p>
      </div>

      {exec && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={exec.totalUsers} subtext={`+${exec.newUsersThisPeriod} this period`} icon={<Users className="h-4 w-4" />} />
          <StatCard label="Active Cafés" value={exec.activeCafes} subtext={`of ${exec.totalCafes} total`} icon={<Store className="h-4 w-4" />} />
          <StatCard label="Bookings" value={exec.bookingsThisPeriod} subtext="this period" icon={<CalendarDays className="h-4 w-4" />} />
          <StatCard label="GMV" value={formatCurrencyCompact(exec.gmv)} subtext="this period" icon={<IndianRupee className="h-4 w-4" />} />
          <StatCard label="KHELO Revenue" value={formatCurrencyCompact(exec.khelRevenue)} subtext="this period" icon={<TrendingUp className="h-4 w-4" />} />
          <StatCard label="Avg Booking Value" value={formatCurrencyCompact(exec.avgBookingValue)} />
          <StatCard label="Cancellation Rate" value={`${exec.cancellationRate}%`} />
          <StatCard label="Repeat Booking Rate" value={`${exec.repeatBookingRate}%`} />
        </div>
      )}

      {/* Link to the relocated verification queue */}
      <Link
        href="/admin/verification-queue"
        className="flex items-center justify-between gap-4 rounded-2xl border border-border bg-surface p-5 transition-colors hover:bg-surface-hover"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-heading text-h3 text-text-primary">Verification Queue</h3>
            <p className="text-caption text-text-secondary">
              {pendingCount} café {pendingCount === 1 ? 'application' : 'applications'} awaiting review
            </p>
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-text-tertiary" />
      </Link>

      {/* Needs Attention — the one place these otherwise-separate signals surface together */}
      {actionItems && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className={`h-4 w-4 ${hasUrgentItems ? 'text-error' : 'text-text-tertiary'}`} />
            <h2 className="font-heading text-h3 text-text-primary">Needs Attention</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {actionCards.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                title={item.tooltip}
                className={`flex flex-col gap-2 rounded-2xl border p-4 transition-colors hover:bg-surface-hover ${
                  item.critical && item.value > 0
                    ? 'border-error/30 bg-error/5'
                    : 'border-border bg-surface'
                }`}
              >
                <div className="flex items-center justify-between">
                  <item.icon className={`h-4 w-4 ${item.critical && item.value > 0 ? 'text-error' : 'text-text-tertiary'}`} />
                  {item.critical && item.value > 0 && (
                    <span className="h-1.5 w-1.5 rounded-full bg-error animate-pulse" />
                  )}
                </div>
                <span className={`text-h2 font-heading font-bold ${item.critical && item.value > 0 ? 'text-error' : 'text-text-primary'}`}>
                  {item.value}
                </span>
                <span className="text-caption text-text-secondary leading-snug">{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import {
  IndianRupee,
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
        { label: 'Failed Route transfers', value: actionItems.failedRouteTransfers, href: '/admin/cafe-payouts', icon: Ban, critical: true, tooltip: 'Payout transfers to café owners that failed and need manual retry' },
        { label: 'Failed refunds', value: actionItems.failedRefunds, href: '/admin/payments', icon: IndianRupee, critical: true, tooltip: 'Refund API calls that failed — the customer was not actually refunded' },
        { label: 'Stuck pending payments', value: actionItems.stuckPendingPayments, href: '/admin/bookings', icon: Hourglass, critical: false, tooltip: 'Bookings stuck in PENDING_PAYMENT for over 20 minutes — likely abandoned checkouts' },
        { label: 'Open support tickets', value: actionItems.openSupportTickets, href: '/admin/support', icon: LifeBuoy, critical: false, tooltip: 'Customer support tickets awaiting a response' },
        { label: 'Owner KYC pending', value: actionItems.ownersKycPending, href: '/admin/cafe-payouts', icon: Landmark, critical: false, tooltip: "Café owners who haven't completed Razorpay payout KYC yet" },
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

  // Everything waiting on an admin, applications first. Zero rows are left out
  // so the list is short and every row is worth tapping.
  const todo = [
    { label: 'Café applications to review', value: pendingCount, href: '/admin/verification-queue', icon: ShieldCheck, critical: false, tooltip: 'New cafés waiting for a yes or no' },
    ...actionCards,
  ].filter((t) => t.value > 0);

  const stats = exec
    ? [
        { label: 'Players', value: String(exec.totalUsers), note: `+${exec.newUsersThisPeriod} new` },
        { label: 'Live cafés', value: String(exec.activeCafes), note: `of ${exec.totalCafes}` },
        { label: 'Bookings', value: String(exec.bookingsThisPeriod) },
        { label: 'Money in', value: formatCurrencyCompact(exec.gmv) },
        { label: 'KHEL-O earned', value: formatCurrencyCompact(exec.khelRevenue) },
        { label: 'Average booking', value: formatCurrencyCompact(exec.avgBookingValue) },
        { label: 'Cancelled', value: `${exec.cancellationRate}%` },
        { label: 'Booked again', value: `${exec.repeatBookingRate}%` },
      ]
    : [];

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div>
        <h1 className="font-heading text-h2 text-text-primary lg:text-h1">Overview</h1>
        <p className="text-body text-text-secondary">What needs you, then the last {exec?.periodDays ?? 30} days.</p>
      </div>

      {/* Needs you: a short list of things to act on. */}
      <section className="flex flex-col gap-2" aria-labelledby="todo-title">
        <h2 id="todo-title" className="flex items-center gap-2 font-heading text-h3 text-text-primary">
          <AlertCircle className={`h-4 w-4 ${hasUrgentItems ? 'text-error' : 'text-text-tertiary'}`} aria-hidden />
          Needs you
        </h2>
        {!actionItems ? (
          <div className="h-16 animate-pulse rounded-2xl bg-card" />
        ) : todo.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-4 py-3.5 text-body text-text-secondary">
            Nothing needs you right now.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {todo.map((item) => {
              const hot = item.critical && item.value > 0;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    title={item.tooltip}
                    className="flex min-h-[56px] items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-xl ${hot ? 'bg-error/10 text-error' : 'bg-surface text-text-secondary'}`}>
                      <item.icon className="h-[18px] w-[18px]" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1 text-body font-semibold text-text-primary">{item.label}</span>
                    <span className={`rounded-full px-2.5 py-0.5 font-data text-caption font-bold tabular-nums ${hot ? 'bg-error text-white' : 'bg-surface text-text-primary'}`}>
                      {item.value}
                    </span>
                    <ArrowRight className="h-4 w-4 flex-none text-text-tertiary" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* The numbers: small, four to a row on a wide screen. */}
      <section className="flex flex-col gap-2" aria-labelledby="numbers-title">
        <h2 id="numbers-title" className="font-heading text-h3 text-text-primary">Last {exec?.periodDays ?? 30} days</h2>
        {!exec ? (
          <div className="h-40 animate-pulse rounded-2xl bg-card" />
        ) : (
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-4">
            {stats.map((st) => (
              <div key={st.label} className="flex flex-col gap-0.5 bg-card px-4 py-3">
                <dt className="text-caption text-text-secondary">{st.label}</dt>
                <dd className="flex items-baseline gap-1.5">
                  <span className="font-data text-h3 font-bold tabular-nums text-text-primary">{st.value}</span>
                  {st.note && <span className="text-caption text-text-tertiary">{st.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}

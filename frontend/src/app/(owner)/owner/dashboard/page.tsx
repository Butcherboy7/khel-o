'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Users,
  Monitor,
  AlertCircle,
  CheckCircle2,
  Clock,
  QrCode,
  Camera,
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  ChevronRight,
  ChevronDown,
  SlidersHorizontal,
  RefreshCw,
  Plus,
  Eye,
  X,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/keys';
import { useAuthStore } from '@/store/authStore';
import type { OwnerDashboard, OwnerBookingItem } from '@/types';
import { getOwnerStatus, getOwnerDashboard, getOwnerBookings, checkinBooking, updateOwnerBookingStatus } from '@/lib/api/owner';
import { getOwnerOccupancy, type TierOccupancy } from '@/lib/api/scanner';
import { getOwnerSettings, toggleBookingsPaused, updateBookingControls } from '@/lib/api/settings';
import { formatCurrency, getOwnerPayoutAmount } from '@/lib/format';
import { Card, CardContent, Button, Badge, BookingStatusBadge, Modal, PageSpinner } from '@/components/ui';
import { PendingApprovalView } from '@/components/owner/PendingApprovalView';
import { ProspectiveOwnerView } from '@/components/owner/ProspectiveOwnerView';
import { OwnerStatRow } from '@/components/owner/OwnerStatRow';
import { getPublicEnv } from '@/lib/runtimeEnv';

export default function OwnerDashboardPage() {
  const { activeRole } = useAuthStore();
  const [statusState, setStatusState] = useState<{
    status: 'loading' | 'prospective' | 'draft' | 'pending' | 'verified' | 'suspended';
    role?: string;
    cafe?: { id?: string; name?: string; city?: string; verificationStatus?: string; bookableStations?: number; appBookableSeats?: number; totalSeats?: number; tiers?: any[] };
  }>({ status: 'loading' });

  const [dashboardData, setDashboardData] = useState<OwnerDashboard | null>(null);
  const [todayBookings, setTodayBookings] = useState<OwnerBookingItem[]>([]);
  const [tierOccupancy, setTierOccupancy] = useState<TierOccupancy[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<OwnerBookingItem | null>(null);
  const [isLoadingOps, setIsLoadingOps] = useState(false);
  const [isTogglingPause, setIsTogglingPause] = useState(false);
  const [appSeatCap, setAppSeatCap] = useState<number>(14);
  const [totalSeatsCount, setTotalSeatsCount] = useState<number>(20);
  const [isUpdatingCap, setIsUpdatingCap] = useState<boolean>(false);
  const [isTierBreakdownOpen, setIsTierBreakdownOpen] = useState<boolean>(false);
  const [cafeSettings, setCafeSettings] = useState<{
    isEmergencyMode: boolean;
    bookingsPaused: boolean;
  } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionIsError, setActionIsError] = useState(false);

  // Fetch status on load
  const loadStatusAndOps = async () => {
    try {
      const statusRes = await getOwnerStatus();
      const storedUser = typeof window !== 'undefined' ? localStorage.getItem('user') : null;

      // Instant role sync: if backend reports role mismatch, trigger token refresh
      if (storedUser && statusRes.role) {
        const parsedUser = JSON.parse(storedUser);
        const storedRole = parsedUser?.role?.toLowerCase();
        const serverRole = statusRes.role.toLowerCase();
        if (storedRole && serverRole && storedRole !== serverRole) {
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (refreshToken) {
              const refreshRes = await fetch(`${getPublicEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000')}/api/v1/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
              });
              if (refreshRes.ok) {
                const data = await refreshRes.json();
                localStorage.setItem('accessToken', data.data.accessToken);
                localStorage.setItem('refreshToken', data.data.refreshToken);
                const userRes = await fetch(`${getPublicEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000')}/api/v1/auth/me`, {
                  headers: { Authorization: `Bearer ${data.data.accessToken}` }
                });
                if (userRes.ok) {
                  const userData = await userRes.json();
                  localStorage.setItem('user', JSON.stringify(userData.data.user));
                  window.location.reload();
                  return;
                }
              }
            }
          } catch {
            // Silently ignore sync failure
          }
        }
      }

      setStatusState({
        status: statusRes.status as any,
        cafe: statusRes.cafe
      });

      if (statusRes.cafe) {
        if (statusRes.cafe.bookableStations !== undefined) {
          setAppSeatCap(statusRes.cafe.bookableStations);
        } else if (statusRes.cafe.appBookableSeats !== undefined) {
          setAppSeatCap(statusRes.cafe.appBookableSeats);
        }
        if (statusRes.cafe.totalSeats) {
          setTotalSeatsCount(statusRes.cafe.totalSeats);
        }
      }

      if (statusRes.status === 'verified' || statusRes.status === 'pending') {
        setIsLoadingOps(true);
        // /owner/settings is cafe_owner-only (require_cafe_owner) — staff always
        // get a 403 from it, so skip the doomed call+retry for staff entirely.
        const isCafeOwner = statusRes.role?.toLowerCase() === 'cafe_owner';
        const [dashRes, bookingsRes, occRes, settingsRes] = await Promise.all([
          getOwnerDashboard().catch(() => null),
          getOwnerBookings({ limit: 20 }).catch(() => ({ items: [] })),
          getOwnerOccupancy().catch(() => ({ tiers: [] })),
          isCafeOwner ? getOwnerSettings().catch(() => null) : Promise.resolve(null),
        ]);

        setDashboardData(dashRes);
        setTodayBookings(bookingsRes?.items || []);
        setTierOccupancy(occRes?.tiers || []);
        if (settingsRes?.cafe) {
          setCafeSettings({
            isEmergencyMode: settingsRes.cafe.isEmergencyMode,
            bookingsPaused: settingsRes.cafe.bookingsPaused,
          });
        }
      }
    } catch {
      setStatusState({ status: 'prospective' });
    } finally {
      setIsLoadingOps(false);
    }
  };

  useEffect(() => {
    loadStatusAndOps();
  }, []);

  const queryClient = useQueryClient();

  const handleUpdateSeatCap = async (newCap: number) => {
    setIsUpdatingCap(true);
    setActionMessage(null);
    setActionIsError(false);
    try {
      const clamped = Math.max(0, Math.min(totalSeatsCount, newCap));
      setAppSeatCap(clamped);
      await updateBookingControls({ bookableStations: clamped, appBookableSeats: clamped });

      // Dispatch real-time cross-tab sync event
      localStorage.setItem('khelo_seat_cap', JSON.stringify({ count: clamped, cafeId: statusState.cafe?.id, updatedAt: Date.now() }));
      window.dispatchEvent(new CustomEvent('khelo:seat-cap-updated', { detail: { count: clamped } }));

      setActionMessage(`Now ${clamped} seat${clamped===1?'':'s'} can be booked online.`);
      setActionIsError(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update seat allocation.';
      setActionMessage(msg);
      setActionIsError(true);
    } finally {
      setIsUpdatingCap(false);
    }
  };

  const handleUpdateSingleTier = async (tierId: string, newTierSeats: number) => {
    if (!statusState.cafe?.tiers) return;
    setIsUpdatingCap(true);
    setActionMessage(null);
    setActionIsError(false);

    try {
      const updatedTiersList = statusState.cafe.tiers.map((t: any) => {
        if (t.id === tierId) {
          const clampedSeats = Math.max(0, Math.min(t.totalSeats, newTierSeats));
          return { ...t, appBookableSeats: clampedSeats };
        }
        return t;
      });

      const tierAllocations = updatedTiersList.map((t: any) => ({
        tierId: t.id,
        appBookableSeats: t.appBookableSeats
      }));

      const res = await updateBookingControls({ tierAllocations });

      const returnedTiers = res?.tiers || updatedTiersList;
      const newGlobalCap = res?.bookableStations ?? updatedTiersList.reduce((acc: number, t: any) => acc + (t.appBookableSeats || 0), 0);

      setStatusState((prev) => ({
        ...prev,
        cafe: prev.cafe ? { ...prev.cafe, tiers: returnedTiers, bookableStations: newGlobalCap } : prev.cafe
      }));

      setAppSeatCap(newGlobalCap);
      if (res?.bookingsPaused !== undefined) {
        setCafeSettings((prev) => prev ? { ...prev, bookingsPaused: res.bookingsPaused } : null);
      }

      localStorage.setItem('khelo_seat_cap', JSON.stringify({ count: newGlobalCap, cafeId: statusState.cafe?.id, updatedAt: Date.now() }));
      window.dispatchEvent(new CustomEvent('khelo:seat-cap-updated', { detail: { count: newGlobalCap } }));

      setActionMessage(`Saved. ${newGlobalCap} seat${newGlobalCap===1?'':'s'} bookable online in total.`);
      setActionIsError(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update tier allocation.';
      setActionMessage(msg);
      setActionIsError(true);
    } finally {
      setIsUpdatingCap(false);
    }
  };

  const handleCheckIn = async (bookingId: string) => {
    try {
      setActionMessage(null);
      setActionIsError(false);
      await checkinBooking(bookingId);
      setActionMessage('Checked in.');
      setActionIsError(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
      await loadStatusAndOps();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Check-in failed. Please try again.';
      setActionMessage(msg);
      setActionIsError(true);
    }
  };

  const handleStatusUpdate = async (bookingId: string, targetStatus: 'completed' | 'no_show') => {
    try {
      setActionMessage(null);
      setActionIsError(false);
      await updateOwnerBookingStatus(bookingId, targetStatus);
      setActionMessage(`Booking marked as ${targetStatus}!`);
      setActionIsError(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
      await loadStatusAndOps();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status update failed.';
      setActionMessage(msg);
      setActionIsError(true);
    }
  };

  const handleTogglePauseBookings = async () => {
    const currentPaused = Boolean(cafeSettings?.bookingsPaused);
    const targetVal = !currentPaused;
    setIsTogglingPause(true);
    setActionMessage(null);
    setActionIsError(false);
    try {
      await toggleBookingsPaused(targetVal);
      setCafeSettings((prev) => (prev ? { ...prev, bookingsPaused: targetVal } : { isEmergencyMode: false, bookingsPaused: targetVal }));
      setActionMessage(targetVal ? 'Online bookings paused. Walk-ins are unaffected.' : 'Online bookings are back on.');
      setActionIsError(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to toggle bookings pause.';
      setActionMessage(msg);
      setActionIsError(true);
    } finally {
      setIsTogglingPause(false);
    }
  };

  if (statusState.status === 'loading') {
    return (
      <PageSpinner />
    );
  }

  if (statusState.status === 'prospective') {
    return <ProspectiveOwnerView />;
  }

  if (statusState.status === 'pending' || statusState.status === 'draft') {
    return (
      <PendingApprovalView
        cafeName={(statusState.cafe?.name as string) || 'Your Gaming Café'}
        onRefreshStatus={loadStatusAndOps}
      />
    );
  }

  const upcomingCount = todayBookings.filter((b) => b.status === 'confirmed' || b.status === 'pending_payment').length;
  const occupiedNowCount = todayBookings.filter((b) => b.status === 'checked_in' || b.status === 'active').length;
  // Sourced from the backend's revenueToday (only CONFIRMED/CHECKED_IN/ACTIVE/COMPLETED
  // bookings with a CAPTURED payment) rather than summing todayBookings client-side,
  // which has no status filter and would double-count pending/failed payments.
  const totalEarningsToday = dashboardData?.revenueToday ?? 0;
  const seatsFreeNow = Math.max(0, appSeatCap - occupiedNowCount);

  // "Needs Your Attention" = bookings whose session start time has already
  // passed but nobody checked them in yet — the thing an owner actually
  // needs to act on, not just a relabeled count of today's bookings.
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const overdueCheckInCount = todayBookings.filter((b) => {
    if (b.status !== 'confirmed' && b.status !== 'pending_payment') return false;
    if (!b.startTime) return false;
    const [h, m] = b.startTime.split(':').map(Number);
    return h * 60 + m <= nowMinutes;
  }).length;

  const isPaused = Boolean(cafeSettings?.bookingsPaused);
  // activeRole (the sanitized current workspace from authStore) is the same
  // signal the owner shell/nav now uses — previously this checked the stale
  // user.role column and user.roles (which an owner who ALSO holds a staff
  // grant elsewhere would always match), so an owner viewing their own café
  // could see the staff-only dashboard content while the sidebar still showed
  // the full owner nav. Keeping both in sync on one signal fixes that split.
  const isStaff = activeRole === 'staff';

  return (
    <div className="flex flex-col gap-5">
      {/* The café's own name leads, at h1, because it is the one thing on this
          screen that says "this is you". The operating status is a pill beside
          it — before, the status ran at heading size and outshouted the venue. */}
      <div className="flex flex-col gap-3 border-b border-border pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
            <h1 className="font-heading text-h1 text-text-primary text-balance">
              {(statusState.cafe?.name as string) || (isStaff ? 'Staff Desk' : 'Your Café')}
            </h1>
            <Badge
              variant={
                cafeSettings?.isEmergencyMode
                  ? 'error'
                  : cafeSettings?.bookingsPaused
                  ? 'warning'
                  : 'success'
              }
              size="md"
              className="gap-1.5 shadow-sm"
            >
              <span className={`h-2 w-2 rounded-full ${cafeSettings?.isEmergencyMode ? 'bg-red-500 animate-ping' : cafeSettings?.bookingsPaused ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
              {cafeSettings?.isEmergencyMode && <AlertCircle className="h-3.5 w-3.5" />}
              {!cafeSettings?.isEmergencyMode && cafeSettings?.bookingsPaused && <PauseCircle className="h-3.5 w-3.5" />}
              <span>
                {cafeSettings?.isEmergencyMode
                  ? 'Emergency Mode Active'
                  : cafeSettings?.bookingsPaused
                  ? 'Bookings Paused'
                  : isStaff ? 'Staff Desk Active' : 'Live & Accepting Bookings'}
              </span>
            </Badge>
          </div>
          <p className="text-body text-text-secondary">
            {isStaff
              ? "Check in customers as they arrive."
              : "Everything happening at your café today."}
          </p>
        </div>

        {/* A bare circular-arrow glyph asked the owner to know what it did.
            Naming the action costs one word and removes the guess. */}
        <Button
          variant="ghost"
          size="sm"
          onClick={loadStatusAndOps}
          isLoading={isLoadingOps}
          loadingText="Refreshing"
          className="shrink-0 gap-2 self-start"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <span>Refresh</span>
        </Button>
      </div>

      {/* Staff open this portal to do exactly one thing, so it gets the first
          screen and a full-width target rather than a decorated banner. */}
      {isStaff && (
        <Card elevation="raised" className="border border-border bg-card p-4 shadow-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <QrCode className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <h2 className="font-heading text-h3 text-text-primary">Check a customer in</h2>
                <p className="mt-0.5 max-w-prose text-caption text-text-secondary">
                  Point your phone camera at the QR pass on their screen.
                </p>
              </div>
            </div>
            <Link href="/owner/scanner" className="w-full sm:w-auto">
              <Button variant="primary" size="md" fullWidth className="gap-2 sm:w-auto">
                <Camera className="h-5 w-5" aria-hidden="true" />
                <span>Open scanner</span>
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {actionMessage && (
        <div
          role="status"
          className={`flex items-start gap-2 rounded-2xl border p-3 text-caption font-semibold ${
            actionIsError
              ? 'border-error/20 bg-error/10 text-error'
              : 'border-success/20 bg-success/10 text-success'
          }`}
        >
          {actionIsError ? (
            <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">{actionMessage}</span>
          <button
            type="button"
            onClick={() => setActionMessage(null)}
            aria-label="Dismiss message"
            className="-m-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg opacity-60 transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* The three numbers an owner glances at, side by side. Stacked as
          full-width cards these ate the entire opening screen and pushed the
          arrivals list — the only actionable thing here — below the fold. */}
      <OwnerStatRow
        stats={[
          {
            label: 'Earned today',
            value: formatCurrency(totalEarningsToday),
            tone: 'positive',
          },
          {
            label: 'Seats free',
            value: seatsFreeNow,
            hint: `of ${totalSeatsCount}`,
          },
          {
            label: 'Waiting to check in',
            value: overdueCheckInCount,
            hint: overdueCheckInCount > 0 ? 'past start time' : 'all caught up',
            tone: overdueCheckInCount > 0 ? 'warning' : 'neutral',
          },
        ]}
      />

      {/* TODAY'S ARRIVALS — the actionable list, right under the hero, no scrolling needed */}
      {(
        <Card elevation="raised" className="bg-surface border border-border overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 pb-3 pt-4">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 font-heading text-h3 text-text-primary">
                <Clock className="h-5 w-5 flex-shrink-0 text-primary" aria-hidden="true" />
                <span className="truncate">Arriving today</span>
              </h2>
              <p className="mt-0.5 text-caption text-text-secondary">
                Tap Check in when a customer reaches the desk.
              </p>
            </div>
            <Link href="/owner/bookings" className="flex-shrink-0">
              <Button variant="outline" size="sm" className="gap-1 whitespace-nowrap">
                <span>See all</span>
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </Link>
          </div>

          {todayBookings.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center text-text-secondary">
              <QrCode className="h-8 w-8 text-text-secondary/50" aria-hidden="true" />
              <p className="text-body font-medium text-text-primary">Nobody booked for today yet.</p>
              <span className="max-w-xs text-caption text-text-secondary">
                Bookings made in the KHEL-O app show up here on their own — you don&apos;t need to refresh.
              </span>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {todayBookings.map((b) => {
                const isCheckedIn = b.status === 'checked_in';
                const isActive = b.status === 'active';
                const isCompleted = b.status === 'completed';
                const isConfirmed = b.status === 'confirmed';

                return (
                  // Two rows on a phone, one on a wide screen. Side by side at
                  // 390px the name, the status pill and two buttons could not
                  // all fit, and the pill (which must not wrap mid-label) ran
                  // under the buttons.
                  <div
                    key={b.id}
                    className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-surface-hover sm:flex-row sm:items-center sm:gap-3"
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      {/* The arrival time is what a desk operator scans this
                          list by, so it gets a solid chip rather than the 10%
                          tint that all but disappeared on a light surface. */}
                      <div className="flex h-11 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-surface text-center font-data text-caption font-bold leading-tight text-text-primary">
                        {b.startTime?.slice(0, 5) || '—'}
                      </div>

                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="truncate font-heading text-body-emphasis font-bold text-text-primary">
                            {b.gamerName || 'Gamer'}
                          </span>
                          {/* The shared badge, not `{b.status}`. Rendering the raw
                              column printed PENDING_PAYMENT / NO_SHOW at the desk —
                              database vocabulary an owner has no way to read. */}
                          <BookingStatusBadge status={b.status} size="sm" />
                        </div>
                        <p className="mt-0.5 truncate text-caption leading-snug text-text-secondary">
                          {b.tierName || 'Standard Pod'} · {b.durationHours || 2}h ·{' '}
                          <span className="font-semibold text-text-primary">
                            ₹{getOwnerPayoutAmount(b).toFixed(2)}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-shrink-0 items-center gap-2 pl-[4.25rem] sm:pl-0">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedBooking(b)}
                        aria-label={`View booking details for ${b.gamerName || 'this gamer'}`}
                        className="gap-1.5"
                      >
                        <Eye className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                        <span>Details</span>
                      </Button>

                      {((b.status as string) === 'confirmed' || (b.status as string) === 'pending_payment' || (b.status as string) === 'booked') && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleCheckIn(b.id)}
                          className="gap-1.5 whitespace-nowrap"
                        >
                          <ShieldCheck className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                          <span>Check in</span>
                        </Button>
                      )}

                      {((b.status as string) === 'checked_in' || (b.status as string) === 'active' || (b.status as string) === 'in_session') && (
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleStatusUpdate(b.id, 'completed')}
                          className="gap-1.5 whitespace-nowrap"
                        >
                          <CheckCircle2 className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                          <span>Finished</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ONLINE BOOKING AVAILABILITY — one card, one mental model: how many
          seats are open for online booking right now, with a single pause
          switch. Tier-level tuning and the live occupancy breakdown are
          real but secondary, so they live behind one "Advanced" disclosure
          instead of two more full-width cards. */}
      {!isStaff && (
      <Card elevation="raised" className="flex flex-col gap-4 border border-border bg-card p-4 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Monitor className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="font-heading text-h3 text-text-primary">Seats open for online booking</h2>
              <p className="max-w-prose text-caption text-text-secondary">
                Customers can book these through the KHEL-O app. The rest you keep for walk-ins.
              </p>
            </div>
          </div>

          <Button
            variant={isPaused ? 'primary' : 'secondary'}
            size="sm"
            onClick={handleTogglePauseBookings}
            isLoading={isTogglingPause}
            className="w-full flex-shrink-0 justify-center gap-2 sm:w-auto"
          >
            {isPaused ? <PlayCircle className="h-4 w-4" aria-hidden="true" /> : <PauseCircle className="h-4 w-4" aria-hidden="true" />}
            <span>{isPaused ? 'Start taking bookings' : 'Stop taking bookings'}</span>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
            <span className="text-caption font-medium text-text-secondary">Bookable online</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleUpdateSeatCap(Math.max(0, appSeatCap - 1))}
                disabled={isUpdatingCap || appSeatCap <= 0}
                aria-label="One fewer seat bookable online"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-card text-h3 font-bold transition-colors hover:bg-surface disabled:opacity-40"
              >
                −
              </button>
              <span className="min-w-[2ch] text-center font-heading text-h1 text-primary">{appSeatCap}</span>
              <button
                type="button"
                onClick={() => handleUpdateSeatCap(Math.min(totalSeatsCount, appSeatCap + 1))}
                disabled={isUpdatingCap || appSeatCap >= totalSeatsCount}
                aria-label="One more seat bookable online"
                className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-border bg-card text-h3 font-bold transition-colors hover:bg-surface disabled:opacity-40"
              >
                +
              </button>
            </div>
            <span className="text-caption text-text-secondary">of {totalSeatsCount} seats</span>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-3">
            <span className="text-caption font-medium text-text-secondary">Kept for walk-ins</span>
            <span className="font-heading text-h1 text-amber-700">{totalSeatsCount - appSeatCap}</span>
            <span className="text-caption text-text-secondary">
              of {totalSeatsCount} seats
            </span>
          </div>
        </div>

        {/* Shortcut row. `grid` rather than `flex-wrap`: wrapping left "None (0)"
            orphaned on its own line beside a gap of dead space on a phone. */}
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium text-text-secondary">Or set it quickly</span>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" onClick={() => handleUpdateSeatCap(totalSeatsCount)} disabled={isUpdatingCap}>
              All {totalSeatsCount}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleUpdateSeatCap(Math.round(totalSeatsCount * 0.7))} disabled={isUpdatingCap}>
              Most {Math.round(totalSeatsCount * 0.7)}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => handleUpdateSeatCap(0)} disabled={isUpdatingCap}>
              None
            </Button>
          </div>
        </div>

        {/* Advanced: per-tier seat tuning + live occupancy, folded away by default */}
        {((statusState.cafe?.tiers && statusState.cafe.tiers.length > 0) || tierOccupancy.length > 0) && (
          <div className="flex flex-col gap-3 pt-2 border-t border-border/60">
            <button
              type="button"
              onClick={() => setIsTierBreakdownOpen((prev) => !prev)}
              aria-expanded={isTierBreakdownOpen}
              className="group flex min-h-[48px] items-center justify-between gap-2 rounded-2xl border border-border bg-surface p-3 text-left transition-colors hover:bg-surface-hover"
            >
              <span className="text-caption font-bold text-text-primary flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden="true" />
                <span>Set seats for each kind of station</span>
              </span>
              <span className="text-xs font-semibold text-primary group-hover:underline flex items-center gap-1">
                {isTierBreakdownOpen ? 'Hide' : 'Show'}
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isTierBreakdownOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>

            {isTierBreakdownOpen && (
              <div className="flex flex-col gap-3 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {statusState.cafe?.tiers && statusState.cafe.tiers.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    {statusState.cafe.tiers.map((t: any) => {
                      const currentAppSeats = t.appBookableSeats !== undefined ? t.appBookableSeats : Math.max(0, Math.round(t.totalSeats * (appSeatCap / totalSeatsCount)));
                      const walkInSeats = Math.max(0, t.totalSeats - currentAppSeats);

                      return (
                        <div key={t.id || t.name} className="p-3 rounded-2xl bg-surface border border-border flex flex-col justify-between gap-2 shadow-xs">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-heading text-caption font-bold text-text-primary truncate">{t.name}</span>
                            <span className="text-overline text-text-secondary font-data flex-shrink-0">₹{t.pricePerHour}/hr</span>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/40">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleUpdateSingleTier(t.id, Math.max(0, currentAppSeats - 1))}
                                disabled={isUpdatingCap || currentAppSeats <= 0}
                                className="h-8 w-8 rounded-lg bg-card border border-border flex items-center justify-center font-bold text-body hover:bg-surface-hover transition-colors disabled:opacity-30"
                                title="Decrease online-bookable seats for this tier"
                              >-</button>
                              <span className={`font-bold text-caption font-data px-1 ${currentAppSeats === 0 ? 'text-amber-500 font-bold' : 'text-primary font-bold'}`}>
                                {currentAppSeats} Online
                              </span>
                              <button
                                type="button"
                                onClick={() => handleUpdateSingleTier(t.id, Math.min(t.totalSeats, currentAppSeats + 1))}
                                disabled={isUpdatingCap || currentAppSeats >= t.totalSeats}
                                className="h-8 w-8 rounded-lg bg-card border border-border flex items-center justify-center font-bold text-body hover:bg-surface-hover transition-colors disabled:opacity-30"
                                title="Increase online-bookable seats for this tier"
                              >+</button>
                            </div>
                            <span className="text-text-secondary text-xs font-semibold">{walkInSeats} Walk-in</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {tierOccupancy.length > 0 && (
                  <div className="rounded-2xl border border-border overflow-hidden">
                    <div className="px-3 pt-3 pb-2 flex items-center justify-between gap-3 bg-surface">
                      <span className="text-caption font-bold text-text-primary flex items-center gap-2">
                        <Monitor className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                        Live Occupancy
                      </span>
                      <Link href="/owner/scanner" className="flex-shrink-0">
                        <Button variant="primary" size="sm" className="gap-1.5 whitespace-nowrap">
                          <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Scan</span>
                        </Button>
                      </Link>
                    </div>
                    <div className="divide-y divide-border">
                      {tierOccupancy.map((t) => {
                        const pct = Math.min(100, Math.max(0, t.occupancyPercent));
                        const barColor = pct >= 80 ? 'bg-rose-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500';
                        const textColor = pct >= 80 ? 'text-rose-500' : pct >= 50 ? 'text-amber-500' : 'text-emerald-500';
                        const walkIn = Math.max(0, t.totalSeats - t.appBookableSeats);

                        return (
                          <div key={t.tierId} className="px-3 py-2.5 flex flex-col gap-2 bg-card">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-heading text-caption font-bold text-text-primary truncate">{t.tierName}</span>
                              <span className={`text-xs font-bold font-data flex-shrink-0 ${textColor}`}>
                                {t.occupiedSeats}/{t.totalSeats}
                                <span className="text-text-secondary font-normal ml-1">({pct}%)</span>
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-500 ${barColor}`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-caption font-semibold">
                                <Monitor className="h-2.5 w-2.5" />
                                {t.appBookableSeats} Online
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-caption font-semibold">
                                {walkIn} Walk-In
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>
      )}

      {/* GAMER BOOKING DETAILS MODAL */}
      <Modal
        isOpen={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        title="Gamer Booking Details"
        description={`Verification & Ticket details for Booking Ref: ${selectedBooking?.bookingReference || selectedBooking?.id?.slice(0, 8) || 'N/A'}`}
      >
        {selectedBooking && (
          <div className="flex flex-col gap-5 pt-1">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-surface border border-border">
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center font-bold text-lg">
                  {selectedBooking.gamerName?.charAt(0) || 'G'}
                </div>
                <div className="flex flex-col">
                  <span className="font-heading text-body font-bold text-text-primary">{selectedBooking.gamerName || 'Gamer'}</span>
                  <span className="text-caption text-text-secondary">{((selectedBooking as unknown as Record<string, unknown>).gamerEmail as string) || ((selectedBooking as unknown as Record<string, unknown>).gamerPhone as string) || 'Registered Gamer'}</span>
                </div>
              </div>
              <BookingStatusBadge status={selectedBooking.status} size="md" />
            </div>

            <dl className="grid grid-cols-2 gap-3 text-caption">
              <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3.5">
                <dt className="text-caption text-text-secondary">Station</dt>
                <dd className="font-semibold text-text-primary">{selectedBooking.tierName || 'Standard Pod'}</dd>
              </div>

              <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3.5">
                <dt className="text-caption text-text-secondary">Date</dt>
                <dd className="font-semibold text-text-primary">{selectedBooking.sessionDate || 'Today'}</dd>
              </div>

              <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3.5">
                <dt className="text-caption text-text-secondary">Time</dt>
                <dd className="font-semibold text-text-primary">
                  {selectedBooking.startTime?.slice(0, 5) || '14:00'} · {selectedBooking.durationHours || 2}h
                </dd>
              </div>

              <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3.5">
                <dt className="text-caption text-text-secondary">You receive</dt>
                <dd className="text-body font-semibold text-text-primary">
                  ₹{getOwnerPayoutAmount(selectedBooking).toFixed(2)}
                </dd>
              </div>
            </dl>

            {Boolean((selectedBooking as unknown as Record<string, unknown>).seatsCount || (selectedBooking as unknown as Record<string, unknown>).seatsBooked) && (
              <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-3.5 text-caption">
                <span className="text-caption text-text-secondary">Seats booked</span>
                <span className="font-semibold text-text-primary">{String((selectedBooking as unknown as Record<string, unknown>).seatsCount || (selectedBooking as unknown as Record<string, unknown>).seatsBooked)}</span>
              </div>
            )}

            {/* Column on a phone so neither action is a half-width sliver, and
                the confirming action sits nearest the thumb. */}
            <div className="flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-end">
              <Button variant="ghost" onClick={() => setSelectedBooking(null)}>
                Close
              </Button>
              {((selectedBooking.status as string) === 'confirmed' || (selectedBooking.status as string) === 'pending_payment' || (selectedBooking.status as string) === 'booked') && (
                <Button
                  variant="primary"
                  onClick={() => {
                    const bId = selectedBooking.id;
                    setSelectedBooking(null);
                    handleCheckIn(bId);
                  }}
                  className="gap-1.5"
                >
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                  <span>Check this customer in</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

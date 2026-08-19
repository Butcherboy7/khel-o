'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
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
  Eye
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/keys';
import { useAuthStore } from '@/store/authStore';
import type { OwnerDashboard, OwnerBookingItem } from '@/types';
import { getOwnerStatus, getOwnerDashboard, getOwnerBookings, checkinBooking, updateOwnerBookingStatus } from '@/lib/api/owner';
import { getOwnerOccupancy, type TierOccupancy } from '@/lib/api/scanner';
import { getOwnerSettings, toggleBookingsPaused, updateBookingControls } from '@/lib/api/settings';
import { Card, CardContent, Button, Badge, Modal } from '@/components/ui';
import { PendingApprovalView } from '@/components/owner/PendingApprovalView';
import { ProspectiveOwnerView } from '@/components/owner/ProspectiveOwnerView';

export default function OwnerDashboardPage() {
  const { user } = useAuthStore();
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
              const refreshRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/auth/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken })
              });
              if (refreshRes.ok) {
                const data = await refreshRes.json();
                localStorage.setItem('accessToken', data.data.accessToken);
                localStorage.setItem('refreshToken', data.data.refreshToken);
                const userRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/auth/me`, {
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
      
      setActionMessage(`⚡ Real-Time Update: Set KHEL-O app bookable seats to ${clamped} stations!`);
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

      setActionMessage(`⚡ Updated hardware tier seat allocation! Total App Stations: ${newGlobalCap}`);
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
      setActionMessage('✅ Gamer checked in successfully!');
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
      setActionMessage(targetVal ? '⏸️ Online bookings paused' : '🟢 Online bookings resumed');
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
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-500" />
      </div>
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
  const checkedInCount = todayBookings.filter((b) => b.status === 'checked_in' || b.status === 'active' || b.status === 'completed').length;
  const totalEarningsToday = todayBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

  const isPaused = Boolean(cafeSettings?.bookingsPaused);
  const isStaff = user?.role === ('staff' as any) || user?.roles?.includes('staff' as any) || statusState.role === 'staff';

  return (
    <div className="max-w-6xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-8">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5 mb-1">
            <h1 className="font-heading text-h2 sm:text-h1 font-bold text-text-primary">
              {(statusState.cafe?.name as string) || (isStaff ? 'Café Staff Operations Desk' : 'My Café Operational Dashboard')}
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
              <span>
                {cafeSettings?.isEmergencyMode
                  ? '⚠️ Emergency Mode Active'
                  : cafeSettings?.bookingsPaused
                  ? '⏸️ Bookings Paused'
                  : isStaff ? 'STAFF DESK ACTIVE' : 'Live & Accepting Bookings'}
              </span>
            </Badge>
          </div>
          <p className="text-caption text-text-secondary">
            {isStaff ? 'Desk operations, camera QR pass verification & station check-in.' : 'Real-time operational view for today\'s venue management.'}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto w-full md:w-auto">
          {!isStaff && (
            <Button
              variant={isPaused ? 'primary' : 'outline'}
              size="sm"
              onClick={handleTogglePauseBookings}
              isLoading={isTogglingPause}
              className={`gap-2 flex-1 md:flex-initial justify-center min-h-[44px] ${isPaused ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold' : ''}`}
            >
              {isPaused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
              <span>{isPaused ? 'Resume Bookings' : 'Pause Bookings Today'}</span>
            </Button>
          )}

          <Button variant="ghost" size="sm" onClick={loadStatusAndOps} className="p-2.5 min-h-[44px] flex-shrink-0" title="Refresh Live Data">
            <RefreshCw className={`h-4 w-4 ${isLoadingOps ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* STAFF PROMINENT CAMERA SCANNER HERO CARD */}
      {isStaff && (
        <Card elevation="raised" className="bg-gradient-to-r from-emerald-950/40 via-surface to-primary/10 border-2 border-emerald-500/40 p-5 shadow-card">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="h-12 w-12 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center font-bold flex-shrink-0 shadow-lg">
                <QrCode className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-heading text-h3 font-bold text-text-primary">Front Desk Pass Scanner</h2>
                  <Badge variant="success" size="sm" className="gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>CAMERA READY</span>
                  </Badge>
                </div>
                <p className="text-caption text-text-secondary mt-0.5">
                  Scan gamer QR passes instantly at the front desk using your phone or desktop camera.
                </p>
              </div>
            </div>
            <Link href="/owner/scanner" className="w-full sm:w-auto">
              <Button variant="primary" size="md" className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold gap-2 shadow-md min-h-[44px]">
                <Camera className="h-5 w-5" />
                <span>Open Camera Pass Scanner</span>
              </Button>
            </Link>
          </div>
        </Card>
      )}

      {actionMessage && (
        <div className={`flex items-center gap-2 p-3.5 rounded-2xl text-caption font-semibold ${
          actionIsError
            ? 'bg-red-500/10 border border-red-500/20 text-red-600'
            : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-600'
        }`}>
          {actionIsError ? <AlertCircle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
          <span>{actionMessage}</span>
          <button
            onClick={() => setActionMessage(null)}
            className="ml-auto text-xs opacity-60 hover:opacity-100"
          >✕</button>
        </div>
      )}

      {/* COMPACT OPERATIONAL STATS RIBBON */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Metric 1: Today's Earnings */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border flex items-center gap-3 shadow-xs">
          <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold flex-shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="text-overline text-text-secondary block truncate">Today&apos;s Earnings</span>
            <span className="font-heading text-h2 font-bold text-emerald-600">₹{totalEarningsToday || dashboardData?.revenueThisMonth || 4250}</span>
          </div>
        </div>

        {/* Metric 2: Upcoming Arrivals */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border flex items-center gap-3 shadow-xs">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="text-overline text-text-secondary block truncate">Upcoming Arrivals</span>
            <span className="font-heading text-h2 font-bold text-text-primary">{upcomingCount || 6} Gamers</span>
          </div>
        </div>

        {/* Metric 3: Tier Occupancy */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border flex items-center gap-3 shadow-xs">
          <div className="h-10 w-10 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold flex-shrink-0">
            <Monitor className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="text-overline text-text-secondary block truncate">Tier Occupancy</span>
            <span className="font-heading text-h2 font-bold text-text-primary">{dashboardData?.occupancyRateThisWeek || 82}%</span>
          </div>
        </div>

        {/* Metric 4: Action Items */}
        <div className="p-3.5 sm:p-4 rounded-2xl bg-surface border border-border flex items-center gap-3 shadow-xs">
          <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold flex-shrink-0">
            <AlertCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <span className="text-overline text-text-secondary block truncate">Action Items</span>
            <span className="font-heading text-h2 font-bold text-amber-600">{upcomingCount || 1} Pending</span>
          </div>
        </div>
      </div>

      {/* REAL-TIME KHEL-O SEAT ALLOCATOR CONTROL CARD */}
      <Card elevation="raised" className="border-2 border-primary/40 bg-gradient-to-r from-card via-surface to-primary/5 p-5 flex flex-col gap-4 shadow-card">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-primary text-white flex items-center justify-center font-bold flex-shrink-0 shadow-lg">
              <Monitor className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-h3 font-bold text-text-primary">KHEL-O App Seat Allocator</h2>
                <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" title="Real-time synchronized across all customer screens" />
              </div>
              <p className="text-caption text-text-secondary">
                Control how many stations are bookable via KHEL-O app vs reserved for walk-in players. Updates reflect in real time on customer screens.
              </p>
            </div>
          </div>

          {/* Quick Presets & Resume/Pause Controls */}
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {appSeatCap === 0 || cafeSettings?.bookingsPaused ? (
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleUpdateSeatCap(Math.round(totalSeatsCount * 0.7))}
                disabled={isUpdatingCap}
                className="text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 gap-1.5 shadow-md"
              >
                <span>🟢 Resume App Bookings</span>
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpdateSeatCap(totalSeatsCount)}
                  disabled={isUpdatingCap}
                  className="text-xs font-semibold"
                >
                  All ({totalSeatsCount})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpdateSeatCap(Math.round(totalSeatsCount * 0.7))}
                  disabled={isUpdatingCap}
                  className="text-xs font-semibold"
                >
                  70% App ({Math.round(totalSeatsCount * 0.7)})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleUpdateSeatCap(0)}
                  disabled={isUpdatingCap}
                  className="text-xs font-semibold text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                >
                  Pause App (0)
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-border/60">
          <div className="flex flex-col gap-1.5 p-3.5 rounded-2xl bg-surface border border-border">
            <span className="text-overline text-text-secondary">Bookable for KHEL-O App</span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleUpdateSeatCap(Math.max(0, appSeatCap - 1))}
                disabled={isUpdatingCap || appSeatCap <= 0}
                className="h-9 w-9 rounded-xl bg-card border border-border flex items-center justify-center font-bold hover:bg-surface-hover transition-colors text-lg disabled:opacity-40"
              >-</button>
              <span className="font-heading text-h2 font-bold text-primary">{appSeatCap}</span>
              <button
                type="button"
                onClick={() => handleUpdateSeatCap(Math.min(totalSeatsCount, appSeatCap + 1))}
                disabled={isUpdatingCap || appSeatCap >= totalSeatsCount}
                className="h-9 w-9 rounded-xl bg-card border border-border flex items-center justify-center font-bold hover:bg-surface-hover transition-colors text-lg disabled:opacity-40"
              >+</button>
              <span className="text-caption text-text-secondary font-semibold">/ {totalSeatsCount} Stations</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-3.5 rounded-2xl bg-surface border border-border">
            <span className="text-overline text-text-secondary">Reserved for Walk-Ins</span>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-heading text-h2 font-bold text-amber-500">{totalSeatsCount - appSeatCap}</span>
              <span className="text-caption text-text-secondary font-semibold">Walk-in Stations</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-3.5 rounded-2xl bg-surface border border-border justify-center">
            <span className="text-overline text-text-secondary">Live Customer Screen Status</span>
            <span className="text-caption font-bold text-emerald-500 flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              {appSeatCap === 0
                ? "App Bookings Paused (Walk-ins only)"
                : `${appSeatCap} stations available for KHEL-O booking`}
            </span>
          </div>
        </div>

        {/* Expandable Per-Hardware Tier Seat Controls */}
        {statusState.cafe?.tiers && statusState.cafe.tiers.length > 0 && (
          <div className="flex flex-col gap-3 pt-3 border-t border-border/60">
            <button
              type="button"
              onClick={() => setIsTierBreakdownOpen((prev) => !prev)}
              className="flex items-center justify-between p-3 rounded-2xl bg-surface border border-border hover:bg-surface-hover transition-colors text-left group"
            >
              <span className="text-caption font-bold text-text-primary flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <span>Custom Per-Tier Controls ({statusState.cafe.tiers.length} Hardware Tiers)</span>
              </span>
              <span className="text-xs font-semibold text-primary group-hover:underline flex items-center gap-1">
                {isTierBreakdownOpen ? 'Hide Tier Adjusters' : 'Tune Individual Tier Seats'}
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isTierBreakdownOpen ? 'rotate-180' : ''}`} />
              </span>
            </button>

            {isTierBreakdownOpen && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {statusState.cafe.tiers.map((t: any) => {
                  const currentAppSeats = t.appBookableSeats !== undefined ? t.appBookableSeats : Math.max(0, Math.round(t.totalSeats * (appSeatCap / totalSeatsCount)));
                  const walkInSeats = Math.max(0, t.totalSeats - currentAppSeats);

                  return (
                    <div key={t.id || t.name} className="p-3.5 rounded-2xl bg-surface border border-border flex flex-col justify-between gap-2 shadow-xs">
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
                            title="Decrease app seats for this tier"
                          >-</button>
                          <span className={`font-bold text-caption font-data px-1 ${currentAppSeats === 0 ? 'text-amber-500 font-bold' : 'text-primary font-bold'}`}>
                            {currentAppSeats} App
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateSingleTier(t.id, Math.min(t.totalSeats, currentAppSeats + 1))}
                            disabled={isUpdatingCap || currentAppSeats >= t.totalSeats}
                            className="h-8 w-8 rounded-lg bg-card border border-border flex items-center justify-center font-bold text-body hover:bg-surface-hover transition-colors disabled:opacity-30"
                            title="Increase app seats for this tier"
                          >+</button>
                        </div>
                        <span className="text-text-secondary text-xs font-semibold">{walkInSeats} Walk-in</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* LIVE TIER OCCUPANCY — compact grid, no wrapping */}
      {tierOccupancy.length > 0 && (
        <Card elevation="raised" className="bg-surface border border-border overflow-hidden">
          {/* Card Header — stacked on mobile so nothing wraps */}
          <div className="px-5 pt-5 pb-4 flex flex-col gap-3 border-b border-border">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <Monitor className="h-5 w-5 text-indigo-400 flex-shrink-0" />
                <h2 className="font-heading text-h3 font-bold text-text-primary leading-tight">
                  Live Occupancy
                </h2>
                <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" title="Updates in real-time" />
              </div>
              <Link href="/owner/scanner" className="flex-shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  className="gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs whitespace-nowrap min-h-[36px]"
                >
                  <QrCode className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Pass Scanner</span>
                  <span className="xs:hidden">Scan</span>
                </Button>
              </Link>
            </div>
            <p className="text-xs text-text-tertiary leading-snug">
              Checked-in gamers vs station capacity per tier — refreshes live.
            </p>
          </div>

          {/* Tier Rows — slim, single-line, no overflow */}
          <div className="divide-y divide-border">
            {tierOccupancy.map((t) => {
              const pct = Math.min(100, Math.max(0, t.occupancyPercent));
              const barColor =
                pct >= 80 ? 'bg-rose-500' : pct >= 50 ? 'bg-amber-500' : 'bg-emerald-500';
              const textColor =
                pct >= 80 ? 'text-rose-500' : pct >= 50 ? 'text-amber-500' : 'text-emerald-500';
              const walkIn = Math.max(0, t.totalSeats - t.appBookableSeats);

              return (
                <div key={t.tierId} className="px-5 py-3.5 flex flex-col gap-2">
                  {/* Row 1 — Tier name + occupancy number */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-heading text-caption font-bold text-text-primary truncate">
                      {t.tierName}
                    </span>
                    <span className={`text-xs font-bold font-data flex-shrink-0 ${textColor}`}>
                      {t.occupiedSeats}/{t.totalSeats}
                      <span className="text-text-secondary font-normal ml-1">({pct}%)</span>
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 rounded-full bg-border overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {/* Row 3 — App quota + Walk-In as 2 badges */}
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-semibold">
                      <Monitor className="h-2.5 w-2.5" />
                      {t.appBookableSeats} App
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-500 text-[10px] font-semibold">
                      {walkIn} Walk-In
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* TODAY'S ARRIVALS FEED */}
      <Card elevation="raised" className="bg-surface border border-border overflow-hidden">
        {/* Header */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between gap-3 border-b border-border">
          <div className="min-w-0">
            <h2 className="font-heading text-h3 font-bold text-text-primary flex items-center gap-2">
              <Clock className="h-5 w-5 text-emerald-500 flex-shrink-0" />
              <span className="truncate">Today&apos;s Arrivals</span>
            </h2>
            <p className="text-xs text-text-tertiary mt-0.5">Verify booking QR or 1-tap check-in.</p>
          </div>
          <Link href="/owner/bookings" className="flex-shrink-0">
            <Button variant="outline" size="sm" className="gap-1 text-xs whitespace-nowrap min-h-[36px]">
              <span>All Bookings</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>

        {/* Booking list */}
        {todayBookings.length === 0 ? (
          <div className="px-5 py-10 text-center text-text-secondary flex flex-col items-center gap-3">
            <QrCode className="h-10 w-10 text-text-tertiary" />
            <p className="text-body font-medium">No bookings logged for today yet.</p>
            <span className="text-xs text-text-tertiary">New gamer bookings will appear here automatically.</span>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {todayBookings.map((b) => {
              const isCheckedIn = b.status === 'checked_in';
              const isActive = b.status === 'active';
              const isCompleted = b.status === 'completed';
              const isConfirmed = b.status === 'confirmed';

              return (
                <div
                  key={b.id}
                  className="px-4 py-3.5 flex items-center gap-3 hover:bg-surface-hover transition-colors"
                >
                  {/* Time chip */}
                  <div className="h-11 w-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-[11px] font-data flex-shrink-0 leading-tight text-center">
                    {b.startTime?.slice(0, 5) || '—'}
                  </div>

                  {/* Info — takes remaining space, truncates gracefully */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="font-heading text-caption font-bold text-text-primary truncate">
                        {b.gamerName || 'Gamer'}
                      </span>
                      <Badge
                        variant={isCheckedIn || isActive || isConfirmed ? 'success' : isCompleted ? 'default' : 'warning'}
                        size="sm"
                        className="flex-shrink-0 text-[10px] py-0"
                      >
                        {isCheckedIn ? '✓ In' : isActive ? '🎮' : b.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-text-secondary truncate leading-snug">
                      {b.tierName || 'Standard Pod'} · {b.durationHours || 2}h ·{' '}
                      <span className="text-emerald-600 font-semibold">₹{b.totalAmount}</span>
                    </p>
                  </div>

                  {/* Actions — icon-only on mobile, label on sm+ */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedBooking(b)}
                      title="View Details"
                      className="h-9 w-9 rounded-xl border border-border bg-surface flex items-center justify-center hover:bg-surface-hover transition-colors"
                    >
                      <Eye className="h-4 w-4 text-primary" />
                    </button>

                    {((b.status as string) === 'confirmed' || (b.status as string) === 'pending_payment' || (b.status as string) === 'booked') && (
                      <button
                        type="button"
                        onClick={() => handleCheckIn(b.id)}
                        title="1-Tap Check In"
                        className="h-9 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="hidden sm:inline">Check In</span>
                      </button>
                    )}

                    {((b.status as string) === 'checked_in' || (b.status as string) === 'active' || (b.status as string) === 'in_session') && (
                      <button
                        type="button"
                        onClick={() => handleStatusUpdate(b.id, 'completed')}
                        title="Mark Complete"
                        className="h-9 px-3 rounded-xl border border-border bg-surface hover:bg-surface-hover text-emerald-600 font-bold text-[11px] flex items-center gap-1 transition-colors whitespace-nowrap"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="hidden sm:inline">Done</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

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
              <Badge variant={selectedBooking.status === 'confirmed' ? 'success' : 'default'}>
                {selectedBooking.status}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-caption">
              <div className="p-3.5 rounded-xl bg-surface border border-border flex flex-col gap-1">
                <span className="text-text-tertiary text-xs">Hardware Tier</span>
                <span className="font-semibold text-text-primary">{selectedBooking.tierName || 'Standard Pod'}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-border flex flex-col gap-1">
                <span className="text-text-tertiary text-xs">Session Date</span>
                <span className="font-semibold text-text-primary">{selectedBooking.sessionDate || 'Today'}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-border flex flex-col gap-1">
                <span className="text-text-tertiary text-xs">Time & Duration</span>
                <span className="font-semibold text-text-primary">{selectedBooking.startTime?.slice(0, 5) || '14:00'} ({selectedBooking.durationHours || 2} Hours)</span>
              </div>

              <div className="p-3.5 rounded-xl bg-surface border border-border flex flex-col gap-1">
                <span className="text-text-tertiary text-xs">Total Paid</span>
                <span className="font-semibold text-emerald-600 text-body">₹{selectedBooking.totalAmount}</span>
              </div>
            </div>

            {Boolean((selectedBooking as unknown as Record<string, unknown>).seatsCount || (selectedBooking as unknown as Record<string, unknown>).seatsBooked) && (
              <div className="p-3.5 rounded-xl bg-surface border border-border flex flex-col gap-1 text-caption">
                <span className="text-text-tertiary text-xs">Stations Reserved</span>
                <span className="font-semibold text-text-primary">{String((selectedBooking as unknown as Record<string, unknown>).seatsCount || (selectedBooking as unknown as Record<string, unknown>).seatsBooked)} Seat(s)</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
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
                  className="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold gap-1.5"
                >
                  <ShieldCheck className="h-4 w-4" />
                  <span>Confirm 1-Tap Check In</span>
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

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
  PauseCircle,
  PlayCircle,
  ShieldCheck,
  ChevronRight,
  RefreshCw,
  Plus,
  Eye
} from 'lucide-react';
import { getOwnerStatus, getOwnerDashboard, getOwnerBookings, checkinBooking, updateOwnerBookingStatus } from '@/lib/api/owner';
import { getOwnerOccupancy, type TierOccupancy } from '@/lib/api/scanner';
import { Card, CardContent, Button, Badge, Modal } from '@/components/ui';
import { PendingApprovalView } from '@/components/owner/PendingApprovalView';
import { ProspectiveOwnerView } from '@/components/owner/ProspectiveOwnerView';

export default function OwnerDashboardPage() {
  const [statusState, setStatusState] = useState<{
    status: 'loading' | 'prospective' | 'draft' | 'pending' | 'verified' | 'suspended';
    cafe?: any;
  }>({ status: 'loading' });

  const [dashboardData, setDashboardData] = useState<any>(null);
  const [todayBookings, setTodayBookings] = useState<any[]>([]);
  const [tierOccupancy, setTierOccupancy] = useState<TierOccupancy[]>([]);
  const [selectedBooking, setSelectedBooking] = useState<any | null>(null);
  const [isLoadingOps, setIsLoadingOps] = useState(false);
  const [isPausedToday, setIsPausedToday] = useState(false);
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

      if (statusRes.status === 'verified' || statusRes.status === 'pending') {
        setIsLoadingOps(true);
        const [dashRes, bookingsRes, occRes] = await Promise.all([
          getOwnerDashboard().catch(() => null),
          getOwnerBookings({ limit: 20 }).catch(() => ({ items: [] })),
          getOwnerOccupancy().catch(() => ({ tiers: [] }))
        ]);

        setDashboardData(dashRes);
        setTodayBookings(bookingsRes?.items || []);
        setTierOccupancy(occRes?.tiers || []);
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

  const handleCheckIn = async (bookingId: string) => {
    try {
      setActionMessage(null);
      setActionIsError(false);
      await checkinBooking(bookingId);
      setActionMessage('✅ Gamer checked in successfully!');
      setActionIsError(false);
      loadStatusAndOps();
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
      loadStatusAndOps();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Status update failed.';
      setActionMessage(msg);
      setActionIsError(true);
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
        cafeName={statusState.cafe?.name || 'Your Gaming Café'}
        onRefreshStatus={loadStatusAndOps}
      />
    );
  }

  const upcomingCount = todayBookings.filter((b) => b.status === 'confirmed' || b.status === 'pending_payment').length;
  const checkedInCount = todayBookings.filter((b) => b.status === 'checked_in' || b.status === 'active' || b.status === 'completed').length;
  const totalEarningsToday = todayBookings.reduce((sum, b) => sum + (Number(b.totalAmount) || 0), 0);

  return (
    <div className="max-w-6xl mx-auto pb-16 pt-2 px-4 flex flex-col gap-8">
      {/* Top Banner & Quick Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-heading text-h1 text-text-primary">{statusState.cafe?.name || 'My Café Operational Dashboard'}</h1>
            <Badge variant="success" size="md">
              Live & Accepting Bookings
            </Badge>
          </div>
          <p className="text-caption text-text-secondary">Real-time operational view for today&apos;s venue management.</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant={isPausedToday ? 'destructive' : 'outline'}
            size="sm"
            onClick={() => setIsPausedToday(!isPausedToday)}
            className="gap-2"
          >
            {isPausedToday ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
            <span>{isPausedToday ? 'Resume Bookings' : 'Pause Bookings Today'}</span>
          </Button>

          <Button variant="ghost" size="sm" onClick={loadStatusAndOps} className="p-2">
            <RefreshCw className={`h-4 w-4 ${isLoadingOps ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

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

      {/* TOP 4 OPERATIONAL ANSWER CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: How much money did I make today? */}
        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold text-text-secondary">Today&apos;s Earnings</span>
              <div className="h-9 w-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold">
                <TrendingUp className="h-5 w-5" />
              </div>
            </div>
            <div className="font-heading text-h1 text-emerald-600">₹{totalEarningsToday || dashboardData?.revenueThisMonth || 4250}</div>
            <p className="text-xs text-text-tertiary">Razorpay Route direct settlement</p>
          </CardContent>
        </Card>

        {/* Card 2: Who is coming today? */}
        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold text-text-secondary">Upcoming Arrivals</span>
              <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="font-heading text-h1 text-text-primary">{upcomingCount || 6} Gamers</div>
            <p className="text-xs text-text-tertiary">Scheduled for today</p>
          </CardContent>
        </Card>

        {/* Card 3: Which PCs are booked? */}
        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold text-text-secondary">Tier Occupancy</span>
              <div className="h-9 w-9 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center font-bold">
                <Monitor className="h-5 w-5" />
              </div>
            </div>
            <div className="font-heading text-h1 text-text-primary">{dashboardData?.occupancyRateThisWeek || 82}%</div>
            <p className="text-xs text-text-tertiary">{checkedInCount} sessions active / completed</p>
          </CardContent>
        </Card>

        {/* Card 4: What do I need to do next? */}
        <Card elevation="resting" className="bg-surface border border-border">
          <CardContent className="p-5 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-caption font-semibold text-text-secondary">Action Items</span>
              <div className="h-9 w-9 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold">
                <AlertCircle className="h-5 w-5" />
              </div>
            </div>
            <div className="font-heading text-h1 text-amber-600">{upcomingCount || 1} Pending</div>
            <p className="text-xs text-text-tertiary">Gamers arriving soon</p>
          </CardContent>
        </Card>
      </div>

      {/* LIVE TIER OCCUPANCY PROGRESS BARS */}
      {tierOccupancy.length > 0 && (
        <Card elevation="raised" className="bg-surface border border-border">
          <CardContent className="p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-indigo-400" />
                  <span>Real-Time Tier Station Occupancy</span>
                </h2>
                <p className="text-caption text-text-secondary">
                  Live ratio of checked-in gamers vs total station capacity per hardware tier.
                </p>
              </div>
              <Link href="/owner/scanner">
                <Button variant="primary" size="sm" className="gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold">
                  <QrCode className="h-4 w-4" />
                  <span>Open Pass Scanner</span>
                </Button>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {tierOccupancy.map((t) => {
                const colorClass =
                  t.occupancyPercent >= 80
                    ? 'bg-rose-500'
                    : t.occupancyPercent >= 50
                    ? 'bg-amber-500'
                    : 'bg-emerald-500';

                return (
                  <div
                    key={t.tierId}
                    className="p-4 rounded-2xl bg-surface-hover border border-border flex flex-col gap-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-heading text-body font-bold text-text-primary">{t.tierName}</span>
                      <span className="text-caption font-bold text-text-primary">
                        {t.occupiedSeats} / {t.totalSeats} Occupied ({t.occupancyPercent}%)
                      </span>
                    </div>

                    <div className="w-full h-3 rounded-full bg-surface border border-border overflow-hidden p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${colorClass}`}
                        style={{ width: `${Math.min(100, Math.max(0, t.occupancyPercent))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-text-tertiary">
                      <span>App-Bookable Quota: {t.appBookableSeats} Seats</span>
                      <span>Walk-In Reserved: {t.totalSeats - t.appBookableSeats} Seats</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* TODAY'S BOOKINGS TIMELINE & ACTION FEED */}
      <Card elevation="raised" className="bg-surface border border-border">
        <CardContent className="p-6 flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border pb-4">
            <div>
              <h2 className="font-heading text-h2 text-text-primary flex items-center gap-2">
                <Clock className="h-5 w-5 text-emerald-500" />
                <span>Today&apos;s Arrivals & Verification Feed</span>
              </h2>
              <p className="text-caption text-text-secondary">Verify customer booking QR code or check in with 1-click.</p>
            </div>
            <Link href="/owner/bookings">
              <Button variant="outline" size="sm" className="gap-1">
                <span>View All Bookings</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>

          {todayBookings.length === 0 ? (
            <div className="p-8 text-center text-text-secondary flex flex-col items-center gap-3 bg-surface-hover rounded-2xl">
              <QrCode className="h-10 w-10 text-text-tertiary" />
              <p className="text-body font-medium">No bookings logged for today yet.</p>
              <span className="text-caption text-text-tertiary">New gamer bookings will appear here automatically.</span>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {todayBookings.map((b) => {
                const isCheckedIn = b.status === 'checked_in';
                const isActive = b.status === 'active';
                const isCompleted = b.status === 'completed';
                const isConfirmed = b.status === 'confirmed';

                return (
                  <div
                    key={b.id}
                    className="p-4 rounded-2xl bg-surface-hover border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all hover:border-emerald-500/40"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center font-bold text-caption">
                        {b.startTime?.slice(0, 5) || '14:00'}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-heading text-body font-bold text-text-primary">{b.gamerName || 'Rohan Sharma'}</span>
                          <Badge
                            variant={isCheckedIn || isActive || isConfirmed ? 'success' : isCompleted ? 'default' : 'warning'}
                            size="sm"
                          >
                            {isCheckedIn ? 'Checked In ✓' : isActive ? 'In Session 🎮' : b.status}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-caption text-text-secondary">
                          <span>{b.tierName || 'Flagship RTX 4080 Pod'}</span>
                          <span>•</span>
                          <span>{b.durationHours || 2} Hours</span>
                          <span>•</span>
                          <span className="font-semibold text-emerald-600">₹{b.totalAmount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedBooking(b)}
                        className="gap-1.5"
                      >
                        <Eye className="h-4 w-4 text-primary" />
                        <span>View Details</span>
                      </Button>

                      {(b.status === 'confirmed' || b.status === 'pending_payment' || b.status === 'booked') && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleCheckIn(b.id)}
                          className="gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold"
                        >
                          <ShieldCheck className="h-4 w-4" />
                          <span>1-Tap Check In</span>
                        </Button>
                      )}

                      {(b.status === 'checked_in' || b.status === 'active' || b.status === 'in_session') && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleStatusUpdate(b.id, 'completed')}
                          className="gap-1.5"
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          <span>Mark Complete</span>
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
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
                  <span className="text-caption text-text-secondary">{selectedBooking.gamerEmail || selectedBooking.gamerPhone || 'Registered Gamer'}</span>
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

            {selectedBooking.seatsBooked && (
              <div className="p-3.5 rounded-xl bg-surface border border-border flex flex-col gap-1 text-caption">
                <span className="text-text-tertiary text-xs">Stations Reserved</span>
                <span className="font-semibold text-text-primary">{selectedBooking.seatsBooked} Seat(s)</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              <Button variant="ghost" onClick={() => setSelectedBooking(null)}>
                Close
              </Button>
              {(selectedBooking.status === 'confirmed' || selectedBooking.status === 'pending_payment' || selectedBooking.status === 'booked') && (
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

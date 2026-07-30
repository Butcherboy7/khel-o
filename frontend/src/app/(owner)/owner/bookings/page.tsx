'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Search,
  CheckCircle2,
  UserX,
  CalendarCheck,
  Calendar,
  Clock,
  Loader2,
  AlertTriangle,
  Camera,
  ShieldAlert,
  X,
} from 'lucide-react';
import { listOwnerBookings, updateOwnerBookingStatus, checkinBooking, emergencyCloseCafe } from '@/lib/api';
import { BookingDetail } from '@/types';
import { formatDateLong, formatTime12h, getTodayString } from '@/lib/format';

const getStatusBadge = (status: string) => {
  switch (status) {
    case 'confirmed':
      return {
        label: 'Confirmed',
        className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      };
    case 'pending_payment':
      return {
        label: 'Pending',
        className: 'bg-amber-50 text-amber-700 border-amber-200',
      };
    case 'cancelled':
      return {
        label: 'Cancelled',
        className: 'bg-red-50 text-red-700 border-red-200',
      };
    case 'completed':
      return {
        label: 'Completed',
        className: 'bg-gray-100 text-gray-700 border-gray-200',
      };
    case 'no_show':
      return {
        label: 'No Show',
        className: 'bg-red-50 text-red-700 border-red-200',
      };
    default:
      return {
        label: status,
        className: 'bg-gray-100 text-gray-700 border-gray-200',
      };
  }
};

function SkeletonRow() {
  return (
    <div className="mx-4 card-base h-28 animate-pulse mb-3 bg-card border border-border rounded-2xl" />
  );
}

export default function OwnerBookingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Tab & search states
  const [activeTab, setActiveTab] = useState<'today' | 'upcoming' | 'all'>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // V2 Modals state
  const [scanModalOpen, setScanModalOpen] = useState(false);
  const [manualBookingId, setManualBookingId] = useState('');
  const [scanSuccessMsg, setScanSuccessMsg] = useState<string | null>(null);
  const [scanErrorMsg, setScanErrorMsg] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeSuccessMsg, setCloseSuccessMsg] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Fetch bookings list via owner endpoint
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ownerBookings'],
    queryFn: () => listOwnerBookings({ page: 1, limit: 100 }),
    staleTime: 30_000,
    retry: 1,
    refetchInterval: 60_000,
  });

  // Booking status mutation via owner endpoint
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'completed' | 'no_show' }) =>
      updateOwnerBookingStatus(id, status),
    onMutate: ({ id }) => {
      setUpdatingId(id);
    },
    onSettled: () => {
      setUpdatingId(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ownerBookings'] });
    },
  });

  const bookings = data?.bookings || [];
  const todayStr = getTodayString();

  // Derive Upcoming confirmed/pending count for badge
  const upcomingCount = useMemo(() => {
    return bookings.filter(
      (b) => b.sessionDate >= todayStr && ['confirmed', 'pending_payment'].includes(b.status)
    ).length;
  }, [bookings, todayStr]);

  // Apply tab filters & search query filter
  const filteredBookings = useMemo(() => {
    return bookings
      .filter((b) => {
        if (activeTab === 'today') return b.sessionDate === todayStr;
        if (activeTab === 'upcoming') {
          return b.sessionDate >= todayStr && ['confirmed', 'pending_payment'].includes(b.status);
        }
        return true;
      })
      .filter((b) => {
        if (debouncedQuery === '') return true;
        const refMatch = b.bookingReference.toLowerCase().includes(debouncedQuery.toLowerCase());
        const nameMatch = b.notes ? b.notes.toLowerCase().includes(debouncedQuery.toLowerCase()) : false;
        return refMatch || nameMatch;
      });
  }, [bookings, activeTab, todayStr, debouncedQuery]);

  // QR Scan handler
  const handleQRCheckin = async (bookingId: string) => {
    if (!bookingId.trim()) return;
    setIsScanning(true);
    setScanErrorMsg(null);
    setScanSuccessMsg(null);
    try {
      const result = await checkinBooking(bookingId);
      setScanSuccessMsg(`Checked in successfully! Assign a PC in the tier: "${result.tierName || 'Gaming Rig'}"`);
      queryClient.invalidateQueries({ queryKey: ['ownerBookings'] });
      setManualBookingId('');
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.response?.data?.detail || 'Check-in failed. Verify the booking window or status.';
      setScanErrorMsg(msg);
    } finally {
      setIsScanning(false);
    }
  };

  // Emergency Close Handler
  const handleEmergencyClose = async () => {
    if (bookings.length === 0) return;
    const cafeId = bookings[0].cafeId;
    setIsClosing(true);
    try {
      await emergencyCloseCafe(cafeId, todayStr);
      setCloseSuccessMsg('Café closed for today. All active sessions have been cancelled and refunded.');
      queryClient.invalidateQueries({ queryKey: ['ownerBookings'] });
      setTimeout(() => {
        setCloseConfirmOpen(false);
        setCloseSuccessMsg(null);
      }, 3000);
    } catch (err: any) {
      alert(err?.response?.data?.error?.message || 'Failed to trigger emergency close.');
    } finally {
      setIsClosing(false);
    }
  };

  return (
    <div className="space-y-4 pb-24 relative">
      {/* PAGE HEADER */}
      <div className="sticky top-0 z-20 bg-card border-b border-border shadow-sm h-14 flex items-center justify-between px-4 -mx-4">
        <button
          type="button"
          onClick={() => router.push('/owner/dashboard')}
          className="p-2 hover:bg-surface rounded-full transition-colors text-text-secondary"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="font-heading font-semibold text-base text-text-primary">
          Bookings
        </span>
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setScanModalOpen(true)}
            className="p-2 bg-primary/10 border border-primary/20 text-primary rounded-full hover:bg-primary/20 transition-colors"
            title="Scan QR Code Check-In"
          >
            <Camera className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={bookings.length === 0}
            onClick={() => setCloseConfirmOpen(true)}
            className="p-2 bg-red-50 border border-red-100 text-error rounded-full hover:bg-red-100 transition-colors disabled:opacity-50"
            title="Emergency Close Cafe Today"
          >
            <ShieldAlert className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SEARCH BAR */}
      <div className="mx-4 mt-4 relative flex items-center">
        <Search className="w-4 h-4 text-text-secondary absolute left-3" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by ref or notes..."
          className="w-full bg-card border border-border rounded-2xl pl-10 pr-4 py-3 text-sm font-body text-text-primary focus:outline-none focus:border-primary transition-all shadow-sm"
        />
      </div>

      {/* TAB BAR */}
      <div className="sticky top-14 z-10 bg-card border-b border-border shadow-sm flex -mx-4 px-4">
        <button
          type="button"
          onClick={() => setActiveTab('today')}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'today'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-text-secondary'
          }`}
        >
          Today
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'upcoming'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-text-secondary'
          }`}
        >
          Upcoming
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'all'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-text-secondary'
          }`}
        >
          All
        </button>
      </div>

      {/* SKELETON LOADING STATE */}
      {isLoading && (
        <div className="space-y-3 pt-2">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      )}

      {/* ERROR STATE */}
      {isError && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md mx-4 mt-4">
          <AlertTriangle className="w-12 h-12 text-error" />
          <h3 className="font-heading font-semibold text-lg text-text-primary">
            Couldn&apos;t load bookings
          </h3>
          <p className="text-text-secondary text-sm">
            {error?.message || 'Unable to load café bookings from server.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="btn-outline text-sm py-2 px-6 rounded-2xl"
          >
            Try Again
          </button>
        </div>
      )}

      {/* EMPTY STATES */}
      {!isLoading && !isError && filteredBookings.length === 0 && (
        <div className="card-base mx-4 p-8 text-center flex flex-col items-center justify-center space-y-2 mt-4">
          <CalendarCheck className="w-10 h-10 text-text-secondary/30" />
          <h3 className="font-heading font-semibold text-base text-text-primary">
            {activeTab === 'today'
              ? 'No sessions today'
              : activeTab === 'upcoming'
              ? 'No upcoming bookings'
              : 'No bookings yet'}
          </h3>
          <p className="text-xs text-text-secondary max-w-[240px]">
            {activeTab === 'today'
              ? 'Bookings scheduled for today appear here.'
              : activeTab === 'upcoming'
              ? 'All future confirmed sessions appear here.'
              : 'When gamers book your café, they appear here.'}
          </p>
        </div>
      )}

      {/* BOOKINGS LIST */}
      {!isLoading && !isError && filteredBookings.length > 0 && (
        <div className="space-y-3 pt-2">
          {filteredBookings.map((b) => {
            const badge = getStatusBadge(b.status);
            const isUpdating = updatingId === b.id;

            return (
              <div
                key={b.id}
                className="mx-4 card-base p-4 flex flex-col gap-3 shadow-sm"
              >
                {/* Row 1: Ref & Status Badge */}
                <div className="flex justify-between items-center">
                  <span className="font-data text-xs text-text-secondary font-bold">
                    {b.bookingReference || `GC-${b.id.slice(0, 5).toUpperCase()}`}
                  </span>
                  <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${badge.className}`}>
                    {badge.label}
                  </span>
                </div>

                {/* Row 2: Hardware Tier & Checkin indicators */}
                <div>
                  <h4 className="font-body font-semibold text-sm text-text-primary">
                    {b.tierName || 'Gaming Slot Rig'}
                  </h4>
                  {b.checkinMethod && (
                    <span className="inline-block text-[9px] font-heading font-bold bg-emerald-50 text-primary px-2 py-0.5 rounded-full mt-1 border border-emerald-100">
                      Checked in via {b.checkinMethod === 'qr_scan' ? 'QR Code' : 'Manual'}
                    </span>
                  )}
                </div>

                {/* Row 3: Date & Time details */}
                <div className="flex items-center gap-3 text-xs text-text-secondary font-data">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>{formatDateLong(b.sessionDate)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span>
                      {formatTime12h(b.startTime)} — {formatTime12h(b.endTime)}
                    </span>
                  </div>
                </div>

                {/* Row 4: Total & Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-border mt-1">
                  <span className="font-data font-semibold text-text-technical text-sm">
                    ₹{(b.totalAmount || 0).toFixed(2)}
                  </span>

                  <div className="flex items-center gap-2">
                    {isUpdating ? (
                      <Loader2 className="w-5 h-5 text-primary animate-spin" />
                    ) : b.status === 'confirmed' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => statusMutation.mutate({ id: b.id, status: 'completed' })}
                          className="bg-primary hover:bg-primary-dark text-white rounded-full text-xs py-1.5 px-3 min-h-[30px] font-semibold shadow-sm active:scale-95 transition-transform flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Complete</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => statusMutation.mutate({ id: b.id, status: 'no_show' })}
                          className="border border-red-200 text-error bg-red-50 hover:bg-red-100 rounded-full text-xs py-1.5 px-3 min-h-[30px] font-semibold active:scale-95 transition-transform flex items-center gap-1"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>No Show</span>
                        </button>
                      </>
                    ) : b.status === 'pending_payment' ? (
                      <span className="text-warning text-xs font-semibold uppercase font-data">
                        Awaiting Payment
                      </span>
                    ) : b.status === 'completed' ? (
                      <span className="text-success text-xs font-semibold uppercase font-body">
                        Session Done
                      </span>
                    ) : b.status === 'cancelled' ? (
                      <span className="text-error text-xs font-semibold uppercase font-body">
                        Cancelled
                      </span>
                    ) : (
                      <span className="text-error text-xs font-semibold uppercase font-body">
                        No Show
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* QR SCAN CHECK-IN DIALOG */}
      {scanModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl w-full max-w-md p-6 relative shadow-2xl flex flex-col space-y-4 font-body">
            <button
              onClick={() => {
                setScanModalOpen(false);
                setScanErrorMsg(null);
                setScanSuccessMsg(null);
              }}
              className="absolute top-4 right-4 p-1.5 hover:bg-surface rounded-full text-text-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-heading font-bold text-lg text-text-primary flex items-center gap-2">
              <Camera className="w-5 h-5 text-primary" />
              <span>QR Code Check-In</span>
            </h2>

            {/* Mock Camera View Finder */}
            <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black flex flex-col items-center justify-center text-center p-4">
              <div className="absolute inset-4 border-2 border-primary/40 border-dashed rounded-lg animate-pulse" />
              <Camera className="w-8 h-8 text-primary/75 animate-bounce" />
              <p className="text-[10px] text-white/80 font-heading font-bold mt-2 tracking-widest uppercase">
                Align QR Code in scanner frame
              </p>
            </div>

            {/* Success/Error Alerts */}
            {scanSuccessMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-start space-x-2 font-medium">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <span>{scanSuccessMsg}</span>
              </div>
            )}
            {scanErrorMsg && (
              <div className="bg-red-50 border border-red-200 text-red-800 text-xs rounded-xl p-3 flex items-start space-x-2 font-medium">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <span>{scanErrorMsg}</span>
              </div>
            )}

            {/* Manual ID Input Section */}
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="block text-xs font-semibold text-text-secondary">Or Enter Booking ID manually</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualBookingId}
                  onChange={(e) => setManualBookingId(e.target.value)}
                  placeholder="e.g. 8a3f-c4b3..."
                  className="flex-1 bg-card border border-border rounded-xl px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-primary font-data"
                />
                <button
                  onClick={() => handleQRCheckin(manualBookingId)}
                  disabled={isScanning || !manualBookingId.trim()}
                  className="btn-primary text-xs px-4 py-2 rounded-xl shrink-0 flex items-center justify-center"
                >
                  {isScanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Check In'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EMERGENCY CLOSE CONFIRMATION DIALOG */}
      {closeConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl w-full max-w-md p-6 relative shadow-2xl flex flex-col space-y-4 font-body">
            <button
              onClick={() => setCloseConfirmOpen(false)}
              className="absolute top-4 right-4 p-1.5 hover:bg-surface rounded-full text-text-secondary transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="font-heading font-bold text-lg text-text-primary flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-error" />
              <span>Emergency Cafe Closure</span>
            </h2>

            <p className="text-xs text-text-secondary leading-relaxed">
              Are you sure you want to close your café lounge for the rest of today?
            </p>
            
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl p-3.5 text-xs font-semibold leading-normal">
              ⚠️ This will cancel all today's remaining bookings, trigger full refunds to gamers, and invoice the 2% Razorpay refund gateway fee to your account.
            </div>

            {closeSuccessMsg && (
              <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl p-3 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-primary" />
                <span>{closeSuccessMsg}</span>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCloseConfirmOpen(false)}
                className="btn-outline flex-1 text-xs py-2 rounded-xl"
              >
                No, Keep Open
              </button>
              <button
                onClick={handleEmergencyClose}
                disabled={isClosing}
                className="btn-primary bg-error border-error text-white hover:bg-red-700 flex-1 text-xs py-2 rounded-xl flex items-center justify-center gap-1.5"
              >
                {isClosing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Yes, Close Cafe</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

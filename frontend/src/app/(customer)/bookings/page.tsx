'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calendar,
  Timer,
  QrCode,
  CalendarX,
  ReceiptText,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { listGamerBookings, cancelBooking } from '@/lib/api';
import { BookingDetail } from '@/types';
import { formatDateLong, formatTime12h, getDurationLabel } from '@/lib/format';

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

function BookingCardSkeleton() {
  return (
    <div className="bg-card rounded-2xl border border-border shadow-md p-4 space-y-3 animate-pulse">
      <div className="flex justify-between items-center">
        <div className="h-5 bg-surface rounded-full w-20" />
        <div className="h-4 bg-surface rounded w-28" />
      </div>
      <div className="space-y-1.5">
        <div className="h-5 bg-surface rounded w-3/4" />
        <div className="h-4 bg-surface rounded-full w-24" />
      </div>
      <div className="space-y-1 pt-1">
        <div className="h-4 bg-surface rounded w-2/3" />
        <div className="h-4 bg-surface rounded w-1/2" />
      </div>
    </div>
  );
}

export default function BookingsListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [cancellingBookingId, setCancellingBookingId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['bookings'],
    queryFn: () => listGamerBookings({ page: 1, limit: 50 }),
    staleTime: 60_000,
    retry: 1,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelBooking(id, 'Cancelled by user'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setCancellingBookingId(null);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error?.message || 'Failed to cancel booking.');
      setCancellingBookingId(null);
    },
  });

  const bookings = data?.bookings || [];

  // Filter into Upcoming and Past
  const { upcoming, past } = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const upcomingStatuses = ['pending_payment', 'confirmed'];

    const up: BookingDetail[] = [];
    const pst: BookingDetail[] = [];

    bookings.forEach((b) => {
      if (upcomingStatuses.includes(b.status) && b.sessionDate >= todayStr) {
        up.push(b);
      } else {
        pst.push(b);
      }
    });

    return { upcoming: up, past: pst };
  }, [bookings]);

  const displayedBookings = activeTab === 'upcoming' ? upcoming : past;

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold font-heading text-text-primary">
          My Bookings
        </h1>
        <p className="text-xs text-text-secondary">
          View your active reservations and past sessions
        </p>
      </div>

      {/* Sticky Tab Bar */}
      <div className="sticky top-14 z-20 bg-card border-b border-border shadow-sm flex -mx-4 px-4">
        <button
          type="button"
          onClick={() => setActiveTab('upcoming')}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'upcoming'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Upcoming ({upcoming.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('past')}
          className={`flex-1 py-3 text-center text-sm font-medium transition-colors border-b-2 ${
            activeTab === 'past'
              ? 'border-primary text-primary font-semibold'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          Past ({past.length})
        </button>
      </div>

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="space-y-3 pt-2">
          <BookingCardSkeleton />
          <BookingCardSkeleton />
          <BookingCardSkeleton />
        </div>
      )}

      {/* Error State */}
      {!isLoading && isError && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md mt-4">
          <AlertTriangle className="w-12 h-12 text-error" />
          <h3 className="font-heading font-semibold text-lg text-text-primary">
            Couldn&apos;t load bookings
          </h3>
          <p className="text-text-secondary text-sm">
            {(error as any)?.message || 'Failed to connect to backend service.'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="border border-border text-text-secondary bg-card hover:bg-gray-50 rounded-2xl min-h-[44px] px-6 text-sm font-medium active:scale-95 transition-all mt-2"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Empty States */}
      {!isLoading && !isError && displayedBookings.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md mt-4">
          {activeTab === 'upcoming' ? (
            <>
              <CalendarX className="w-12 h-12 text-text-secondary" />
              <h3 className="font-heading font-semibold text-lg text-text-primary">
                No upcoming sessions
              </h3>
              <p className="text-text-secondary text-sm">
                Book a gaming café to see your reservations here.
              </p>
              <Link
                href="/"
                className="bg-primary hover:bg-primary-dark text-white rounded-2xl min-h-[44px] px-6 text-sm font-medium active:scale-95 transition-all inline-flex items-center justify-center mt-2"
              >
                Explore Cafés
              </Link>
            </>
          ) : (
            <>
              <ReceiptText className="w-12 h-12 text-text-secondary" />
              <h3 className="font-heading font-semibold text-lg text-text-primary">
                No past bookings yet
              </h3>
              <p className="text-text-secondary text-sm">
                Your completed and cancelled sessions will appear here.
              </p>
            </>
          )}
        </div>
      )}

      {/* Booking Cards List */}
      {!isLoading && !isError && displayedBookings.length > 0 && (
        <div className="space-y-3 pt-2">
          {displayedBookings.map((b) => {
            const badge = getStatusBadge(b.status);

            return (
              <div
                key={b.id}
                onClick={() => router.push(`/bookings/${b.id}`)}
                className="bg-card rounded-2xl border border-border shadow-md p-4 space-y-3 cursor-pointer active:scale-[0.98] transition-transform"
              >
                {/* Header Row: Status Pill & Ref */}
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2.5 py-0.5 text-xs font-bold rounded-full border ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  <span className="font-data text-xs text-text-secondary">
                    {b.bookingReference || `GC-${b.id.slice(0, 8).toUpperCase()}`}
                  </span>
                </div>

                {/* Café & Tier */}
                <div>
                  <h3 className="font-heading font-semibold text-base text-text-primary">
                    {b.cafeName || 'Gaming Café'}
                  </h3>
                  {b.tierName && (
                    <span className="text-primary text-xs bg-surface px-2 py-0.5 rounded-full font-data inline-block mt-1">
                      {b.tierName}
                    </span>
                  )}
                </div>

                {/* Date & Time */}
                <div className="flex items-center space-x-2 text-xs text-text-secondary font-data">
                  <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>
                    {formatDateLong(b.sessionDate)} · {formatTime12h(b.startTime)} — {formatTime12h(b.endTime)}
                  </span>
                </div>

                {/* Duration & Price */}
                <div className="flex items-center justify-between pt-1 border-t border-border">
                  <div className="flex items-center space-x-1.5 text-xs text-text-secondary font-data">
                    <Timer className="w-4 h-4 text-primary flex-shrink-0" />
                    <span>{getDurationLabel(b.durationHours)}</span>
                  </div>

                  <div className="flex items-center space-x-3">
                    <span className="font-data font-semibold text-text-technical text-sm">
                      ₹{b.totalAmount.toFixed(2)}
                    </span>

                    {b.status === 'confirmed' || b.status === 'pending_payment' ? (
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCancellingBookingId(b.id);
                          }}
                          className="border border-red-200 text-error bg-red-50 hover:bg-red-100 rounded-full text-xs py-1.5 px-3 font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/bookings/${b.id}`);
                          }}
                          className="border border-border text-secondary bg-card hover:bg-gray-50 rounded-full text-xs py-1.5 px-3 font-medium flex items-center space-x-1"
                        >
                          <QrCode className="w-3.5 h-3.5 text-primary" />
                          <span>View Pass</span>
                        </button>
                      </div>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-text-secondary" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Cancellation Confirmation Modal */}
      {cancellingBookingId && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-card rounded-3xl w-full max-w-md p-6 flex flex-col items-center text-center space-y-4 shadow-xl border border-border">
            <div className="p-4 bg-error/10 text-error rounded-full">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div>
              <h3 className="font-heading font-bold text-lg text-text-primary">
                Cancel Session Reservation?
              </h3>
              <p className="font-body text-xs text-text-secondary mt-1">
                Are you sure you want to cancel? Session slots are subject to cancellation terms.
              </p>
            </div>

            <div className="w-full flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate(cancellingBookingId)}
                className="w-full bg-error text-white rounded-2xl py-3 font-heading font-semibold text-xs shadow-sm active:scale-95 transition-transform"
              >
                {cancelMutation.isPending ? 'Cancelling...' : 'Yes, Cancel Reservation'}
              </button>

              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => setCancellingBookingId(null)}
                className="w-full border border-border rounded-2xl py-3 text-xs font-medium text-text-secondary"
              >
                Keep Booking
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

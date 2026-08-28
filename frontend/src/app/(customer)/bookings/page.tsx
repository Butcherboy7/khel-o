'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calendar, CalendarX, AlertCircle } from 'lucide-react';
import { listBookings } from '@/lib/api/bookings';
import { queryKeys } from '@/hooks/queries/keys';
import { BookingCard } from '@/components/customer/BookingCard';
import { SkeletonBookingRow, ErrorState, EmptyState, Button } from '@/components/ui';
import type { BookingStatus } from '@/types';

export default function BookingsListPage() {
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.bookings.list({
      status: selectedStatus !== 'all' ? (selectedStatus as BookingStatus) : undefined,
    }),
    queryFn: () =>
      listBookings({
        status: selectedStatus !== 'all' ? (selectedStatus as BookingStatus) : undefined,
      }),
    staleTime: 0, // Always fresh
  });

  const rawBookings = data?.items || [];
  const bookings = rawBookings.filter((b) => {
    if (selectedStatus === 'all') return true;
    return b.status === selectedStatus;
  });

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div>
        <h1 className="font-heading text-h1 text-text-primary">My Booking Passes</h1>
        <p className="text-body text-text-secondary mt-0.5">
          View your upcoming sessions, access QR check-in passes, and track history.
        </p>
      </div>

      {/* Filter Tabs — edge-fades on the trailing side hint that the row
          scrolls horizontally, since tabs otherwise clip mid-word at the
          viewport edge with no visual cue (same pattern as the homepage
          filter chip row). */}
      <div className="relative border-b border-border/60 pb-4">
        <div
          className="flex items-center gap-2 overflow-x-auto scrollbar-hide"
          style={{ maskImage: 'linear-gradient(to right, black 92%, transparent)', WebkitMaskImage: 'linear-gradient(to right, black 92%, transparent)' }}
        >
          {[
            { id: 'all', label: 'All Passes' },
            { id: 'confirmed', label: 'Upcoming' },
            { id: 'checked_in', label: 'Active Session' },
            { id: 'completed', label: 'Completed' },
            { id: 'cancelled', label: 'Cancelled' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedStatus(tab.id)}
              className={`px-4 py-2 rounded-full text-caption font-bold flex-shrink-0 transition-all active:scale-95 ${
                selectedStatus === tab.id
                  ? 'bg-primary text-white shadow-float'
                  : 'bg-surface text-text-secondary border border-border/80 hover:border-primary/30 hover:text-primary'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4-State System Content */}
      <div className="flex flex-col gap-4">
        {isLoading && (
          <>
            <SkeletonBookingRow />
            <SkeletonBookingRow />
            <SkeletonBookingRow />
          </>
        )}

        {isError && (
          <ErrorState
            title="Failed to load bookings"
            message={(error as Error)?.message || 'Could not fetch your bookings.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && bookings.length === 0 && (
          <EmptyState
            title="No Bookings Found"
            description={
              selectedStatus !== 'all'
                ? `You don't have any ${selectedStatus.replace('_', ' ')} bookings.`
                : "You haven't booked any gaming stations yet. Explore verified cafés near you to get started."
            }
            icon={<CalendarX className="h-7 w-7 text-primary" />}
            actionLabel="Explore Gaming Cafés"
            onAction={() => (window.location.href = '/')}
          />
        )}

        {!isLoading && !isError && bookings.length > 0 && (
          <div className="flex flex-col gap-4">
            {bookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

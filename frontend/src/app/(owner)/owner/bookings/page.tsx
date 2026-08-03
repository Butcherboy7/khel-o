'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Calendar,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  QrCode,
} from 'lucide-react';
import { listOwnerBookings, checkinBooking, updateOwnerBookingStatus } from '@/lib/api/owner';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Button,
  Input,
  Card,
  CardContent,
  BookingStatusBadge,
  PriceDisplay,
  SkeletonBookingRow,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { formatSessionDate, formatTime } from '@/lib/format';

export default function OwnerBookingsPage() {
  const queryClient = useQueryClient();
  const [searchRef, setSearchRef] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.owner.bookings({
      date: selectedDate || undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
    }),
    queryFn: () =>
      listOwnerBookings({
        date: selectedDate || undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
      }),
    staleTime: 0, // Always fresh for staff desk operations
    refetchInterval: 30_000,
  });

  const checkinMutation = useMutation({
    mutationFn: (bookingId: string) => checkinBooking(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: string; status: 'completed' | 'no_show' }) =>
      updateOwnerBookingStatus(bookingId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
    },
  });

  const rawBookings = data?.items || [];
  const bookings = searchRef
    ? rawBookings.filter((b) =>
        b.bookingReference.toLowerCase().includes(searchRef.toLowerCase()) ||
        (b.gamerName?.toLowerCase() || '').includes(searchRef.toLowerCase())
      )
    : rawBookings;

  return (
    <div className="flex flex-col gap-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="font-heading text-h1 text-text-primary">Desk Check-in & Bookings</h1>
        <p className="text-body text-text-secondary mt-0.5">
          Scan QR codes, check in arriving gamers, and manage station status.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <Input
            placeholder="Search by Reference ID (e.g. BK-89A12F) or Gamer name..."
            value={searchRef}
            onChange={(e) => setSearchRef(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-40"
          />

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="h-input px-3 rounded-xl border border-border bg-card font-body text-body text-text-primary"
          >
            <option value="all">All Statuses</option>
            <option value="confirmed font-semibold">Confirmed</option>
            <option value="checked_in">Checked In</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Bookings List */}
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
            message={(error as Error)?.message || 'Could not fetch desk bookings.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && bookings.length === 0 && (
          <EmptyState
            title="No Bookings Found"
            description="No bookings match your current search or date filters."
          />
        )}

        {!isLoading && !isError && bookings.length > 0 && (
          <div className="flex flex-col gap-3">
            {bookings.map((booking) => (
              <Card key={booking.id} elevation="resting">
                <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-data text-ref font-semibold text-text-secondary uppercase bg-surface px-2 py-0.5 rounded-md">
                        Ref: {booking.bookingReference}
                      </span>
                      <BookingStatusBadge status={booking.status} size="sm" />
                    </div>

                    <div>
                      <h3 className="font-heading text-h3 text-text-primary flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <span>{booking.gamerName}</span>
                      </h3>
                      <p className="text-caption text-text-secondary">
                        Tier: <span className="font-semibold text-text-primary">{booking.tierName}</span>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-caption text-text-secondary">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span>{formatSessionDate(booking.sessionDate)}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>
                          {formatTime(booking.startTime)} ({booking.durationHours}h)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <PriceDisplay amount={booking.totalAmount} period="" size="md" />

                    {booking.status === 'confirmed' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => checkinMutation.mutate(booking.id)}
                        isLoading={checkinMutation.isPending}
                        loadingText="Checking in..."
                        className="gap-1.5 shadow-card"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Check In</span>
                      </Button>
                    )}

                    {booking.status === 'checked_in' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          updateStatusMutation.mutate({
                            bookingId: booking.id,
                            status: 'completed',
                          })
                        }
                        className="text-success border-success/30 hover:bg-success/10"
                      >
                        Complete Session
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

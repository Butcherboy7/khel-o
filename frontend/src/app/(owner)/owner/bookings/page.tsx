'use client';

import { useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
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
import { listOwnerBookings, checkinBooking, updateOwnerBookingStatus, releasePendingBooking } from '@/lib/api/owner';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Button,
  Input,
  Select,
  Card,
  CardContent,
  BookingStatusBadge,
  PriceDisplay,
  SkeletonBookingRow,
  ErrorState,
  EmptyState,
} from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { InfoTip } from '@/components/shared/InfoTip';
import { INFO_TIPS } from '@/lib/ownerGuideCopy';
import { cn } from '@/lib/cn';
import { addDaysToDateString, formatSessionDate, formatSessionDateShort, formatTime, getOwnerPayoutAmount, getTodayString } from '@/lib/format';

export default function OwnerBookingsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  // Seeds the search box when arriving from a notification's ?ref= link
  // (e.g. "New booking confirmed") so the tap actually lands the owner on
  // that booking instead of an unfiltered list indistinguishable from the
  // link having done nothing.
  const [searchRef, setSearchRef] = useState(() => searchParams.get('ref') || '');
  // Opens on today's desk, which is what the owner needs most; a booking
  // code from a notification searches every day instead.
  const today = getTodayString();
  const tomorrow = addDaysToDateString(today, 1);
  const [selectedDate, setSelectedDate] = useState(() => (searchParams.get('ref') ? '' : today));
  const datePickerRef = useRef<HTMLInputElement>(null);
  const pickedOther = selectedDate !== '' && selectedDate !== today && selectedDate !== tomorrow;
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

  const releaseMutation = useMutation({
    mutationFn: (bookingId: string) => releasePendingBooking(bookingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.owner.all });
    },
  });

  const handleRelease = (bookingId: string) => {
    if (confirm('This will release the held slot and make it available for other customers. Continue?')) {
      releaseMutation.mutate(bookingId);
    }
  };

  const actionError =
    (checkinMutation.error as Error | null)?.message ||
    (updateStatusMutation.error as Error | null)?.message ||
    null;

  const rawBookings = data?.items || [];
  const bookings = searchRef
    ? rawBookings.filter((b) =>
        b.bookingReference.toLowerCase().includes(searchRef.toLowerCase()) ||
        (b.gamerName?.toLowerCase() || '').includes(searchRef.toLowerCase())
      )
    : rawBookings;

  return (
    <div className="flex flex-col gap-6">
      <OwnerPageHeader
        guide="bookings"
        title="Bookings"
        description="Find a booking, check someone in, or free up a seat nobody paid for."
      />

      {/* Filters stack on a phone: side by side, the date field and the status
          menu each got half a narrow screen and the placeholder was cut off
          mid-word. */}
      <div className="flex flex-col gap-3">
        <Input
          placeholder="Search name or booking code"
          value={searchRef}
          onChange={(e) => setSearchRef(e.target.value)}
          leftIcon={<Search className="h-4 w-4" aria-hidden="true" />}
          aria-label="Search bookings by customer name or booking code"
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span id="bookings-day-label" className="text-h4 text-text-primary">Day</span>
            <div role="group" aria-labelledby="bookings-day-label" data-tour="bookings-days" className="flex flex-wrap gap-2">
              {[
                { key: today, label: 'Today' },
                { key: tomorrow, label: 'Tomorrow' },
              ].map((d) => (
                <button
                  key={d.label}
                  type="button"
                  aria-pressed={selectedDate === d.key}
                  onClick={() => setSelectedDate(d.key)}
                  className={dayChip(selectedDate === d.key)}
                >
                  {d.label}
                </button>
              ))}
              {/* The real date field sits under the chip, so the phone's own
                  calendar opens and the day reads "Sat, 24 Oct", not 10/24/2026. */}
              <label className={cn(dayChip(pickedOther), 'relative cursor-pointer')}>
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                {pickedOther ? formatSessionDateShort(selectedDate) : 'Pick a date'}
                <input
                  ref={datePickerRef}
                  type="date"
                  aria-label="Pick a date"
                  value={pickedOther ? selectedDate : ''}
                  onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
                  onClick={() => datePickerRef.current?.showPicker?.()}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                />
              </label>
              <button
                type="button"
                aria-pressed={selectedDate === ''}
                onClick={() => setSelectedDate('')}
                className={dayChip(selectedDate === '')}
              >
                All days
              </button>
            </div>
          </div>

          <div className="flex items-end gap-1">
            <div className="min-w-0 flex-1" data-tour="bookings-show">
              <Select
                label="Show"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="all">Everything</option>
                <option value="pending_payment">Not paid yet</option>
                <option value="confirmed">Paid, not arrived</option>
                <option value="checked_in">Checked in</option>
                <option value="active">Playing now</option>
                <option value="completed">Finished</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">Never showed up</option>
              </Select>
            </div>
            <InfoTip
              text={INFO_TIPS.bookingsStatusFilter}
              label="What the statuses mean"
              align="end"
              className="mb-2"
            />
          </div>
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-xl bg-error/10 border border-error/20 text-caption text-error">
          {actionError}
        </div>
      )}

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
            title="Nothing here"
            description="No bookings match what you searched for. Try a different date, or set Show to Everything."
          />
        )}

        {!isLoading && !isError && bookings.length > 0 && (
          <div className="flex flex-col gap-3">
            {bookings.map((booking) => (
              <Card key={booking.id} elevation="resting">
                {/* The customer's name leads. Previously the booking reference —
                    a code the owner only needs when something goes wrong — sat
                    in the first slot in monospace, above the person's name. */}
                <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:p-5">
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="flex min-w-0 items-center gap-2 font-heading text-h3 text-text-primary">
                        <User className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                        <span className="truncate">{booking.gamerName}</span>
                      </h3>
                      <BookingStatusBadge status={booking.status} size="sm" />
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-secondary">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
                        {formatSessionDate(booking.sessionDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-text-secondary" aria-hidden="true" />
                        {formatTime(booking.startTime)} · {booking.durationHours}h
                      </span>
                      <span className="font-semibold text-text-primary">{booking.tierName}</span>
                    </div>

                    <span className="font-data text-ref uppercase text-text-secondary">
                      {booking.bookingReference}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border pt-3 sm:justify-end sm:border-0 sm:pt-0">
                    <PriceDisplay amount={getOwnerPayoutAmount(booking)} period="" size="md" />

                    {booking.status === 'confirmed' && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => checkinMutation.mutate(booking.id)}
                        isLoading={checkinMutation.isPending}
                        loadingText="Checking in"
                        className="gap-1.5"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>Check in</span>
                      </Button>
                    )}

                    {booking.status === 'pending_payment' && (
                      <Button
                        variant="destructive-outline"
                        size="sm"
                        onClick={() => handleRelease(booking.id)}
                        isLoading={releaseMutation.isPending && releaseMutation.variables === booking.id}
                        loadingText="Freeing"
                        className="gap-1.5"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        <span>Free the seat</span>
                      </Button>
                    )}

                    {(booking.status === 'checked_in' || booking.status === 'active') && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          updateStatusMutation.mutate({
                            bookingId: booking.id,
                            status: 'completed',
                          })
                        }
                        className="gap-1.5"
                      >
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                        <span>Finished</span>
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

function dayChip(active: boolean): string {
  return cn(
    'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-caption font-semibold transition-colors',
    'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    active ? 'border-secondary bg-secondary text-white' : 'border-border bg-card text-text-primary hover:border-text-secondary',
  );
}

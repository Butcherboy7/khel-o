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
  EmptyState,
} from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { InfoTip } from '@/components/shared/InfoTip';
import { INFO_TIPS } from '@/lib/ownerGuideCopy';
import { cn } from '@/lib/cn';
import { groupLabel } from '@/lib/bookingLabels';
import { addDaysToDateString, formatSessionDate, formatSessionDateShort, formatTime, getOwnerPayoutAmount, getTodayString } from '@/lib/format';
import { checkInDropPass, listOwnerDropBookings, type OwnerDropBooking } from '@/lib/api/drops';
import { OwnerLoadError } from '@/components/owner/OwnerLoadError';

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
  const pickedOther = selectedDate !== '' && selectedDate !== 'upcoming' && selectedDate !== today && selectedDate !== tomorrow;
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // 'Coming up' has no single day: ask for every day, then keep today onwards.
  const apiDate = selectedDate === 'upcoming' ? '' : selectedDate;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.owner.bookings({
      date: apiDate || undefined,
      status: selectedStatus !== 'all' ? selectedStatus : undefined,
    }),
    queryFn: () =>
      listOwnerBookings({
        date: apiDate || undefined,
        status: selectedStatus !== 'all' ? selectedStatus : undefined,
      }),
    staleTime: 0, // Always fresh for staff desk operations
    refetchInterval: 30_000,
  });

  const dropQuery = useQuery({ queryKey: ['owner', 'drop-bookings'], queryFn: listOwnerDropBookings, staleTime: 0, refetchInterval: 30_000 });
  const dropCheckin = useMutation({
    mutationFn: (token: string) => checkInDropPass(token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['owner', 'drop-bookings'] }),
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

  // Two taps, asked on the page (not a browser pop-up): the first tap asks,
  // the second does it. One id at a time, whichever action is being confirmed.
  const [confirming, setConfirming] = useState<{ id: string; action: 'free' | 'noshow' } | null>(null);

  const actionError =
    (checkinMutation.error as Error | null)?.message ||
    (dropCheckin.error as Error | null)?.message ||
    (updateStatusMutation.error as Error | null)?.message ||
    (releaseMutation.error as Error | null)?.message ||
    null;

  const rawBookings = (data?.items || []).filter((b) => selectedDate !== 'upcoming' || b.sessionDate >= today);
  const dropStatus = (st: string) => (st === 'refunded' || st === 'given_away' ? 'cancelled' : st);
  const q = searchRef.toLowerCase();
  const dropRows = (dropQuery.data || []).filter(
    (d) =>
      (selectedDate === '' || selectedDate === 'upcoming' || d.date === selectedDate) &&
      (selectedStatus === 'all' || dropStatus(d.status) === selectedStatus) &&
      (!q || d.reference.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)),
  );
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
        description="Find a booking, check someone in, or free up a time nobody paid for."
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
                aria-pressed={selectedDate === 'upcoming'}
                onClick={() => setSelectedDate('upcoming')}
                className={dayChip(selectedDate === 'upcoming')}
              >
                Coming up
              </button>
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
          <OwnerLoadError error={error}
            title="Couldn’t load bookings"
            message={(error as Error)?.message || 'Check your connection and try again.'}
            onRetry={() => refetch()}
          />
        )}

        {!isLoading && !isError && bookings.length === 0 && dropRows.length === 0 && (
          <EmptyState
            title="Nothing here"
            description="No bookings match what you searched for. Try a different date, or set Show to Everything."
          />
        )}

        {dropRows.length > 0 && (
          <div className="flex flex-col gap-3" data-tour="bookings-drops">
            <h2 className="font-heading text-h4 text-text-primary">Launch drop reservations</h2>
            {dropRows.map((d) => (
              <DropBookingCard key={d.id} d={d} onCheckIn={() => d.checkinToken && dropCheckin.mutate(d.checkinToken)} busy={dropCheckin.isPending} />
            ))}
          </div>
        )}

        {!isLoading && !isError && bookings.length > 0 && (
          <div className="flex flex-col gap-3">
            {dropRows.length > 0 && <h2 className="font-heading text-h4 text-text-primary">Normal bookings</h2>}
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
                        {formatTime(booking.startTime)} to {formatTime(booking.endTime)}
                      </span>
                      <span className="font-semibold text-text-primary">{booking.tierName}</span>
                      {groupLabel(booking) && <span className="font-semibold text-text-primary">{groupLabel(booking)}</span>}
                    </div>

                    <span className="font-data text-ref uppercase text-text-secondary">
                      {booking.bookingReference}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border pt-3 sm:justify-end sm:border-0 sm:pt-0">
                    <PriceDisplay amount={getOwnerPayoutAmount(booking)} period="" size="md" />

                    {booking.status === 'confirmed' && confirming?.id !== booking.id && (
                      <>
                        {hasStarted(booking) && (
                          <button
                            type="button"
                            onClick={() => setConfirming({ id: booking.id, action: 'noshow' })}
                            className="min-h-[44px] rounded-xl px-2.5 text-caption font-semibold text-text-secondary hover:bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          >
                            Never showed up
                          </button>
                        )}
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => checkinMutation.mutate(booking.id)}
                          isLoading={checkinMutation.isPending && checkinMutation.variables === booking.id}
                          loadingText="Checking in"
                          className="gap-1.5"
                        >
                          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                          <span>Check in</span>
                        </Button>
                      </>
                    )}

                    {booking.status === 'pending_payment' && confirming?.id !== booking.id && (
                      <Button
                        variant="destructive-outline"
                        size="sm"
                        onClick={() => setConfirming({ id: booking.id, action: 'free' })}
                        className="gap-1.5"
                      >
                        <XCircle className="h-4 w-4" aria-hidden="true" />
                        <span>Free this time</span>
                      </Button>
                    )}

                    {confirming?.id === booking.id && (
                      <div className="flex flex-wrap items-center justify-end gap-2" role="group" aria-label="Are you sure?">
                        <span className="text-caption text-text-secondary">
                          {confirming.action === 'free'
                            ? 'Free this time for other customers?'
                            : 'Mark them as never showed up?'}
                        </span>
                        <Button
                          variant="destructive"
                          size="sm"
                          isLoading={
                            confirming.action === 'free'
                              ? releaseMutation.isPending
                              : updateStatusMutation.isPending
                          }
                          onClick={() => {
                            const { id, action } = confirming;
                            if (action === 'free') releaseMutation.mutate(id, { onSettled: () => setConfirming(null) });
                            else updateStatusMutation.mutate({ bookingId: id, status: 'no_show' }, { onSettled: () => setConfirming(null) });
                          }}
                        >
                          {confirming.action === 'free' ? 'Free it' : 'Yes'}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                          Keep
                        </Button>
                      </div>
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
                        isLoading={updateStatusMutation.isPending && updateStatusMutation.variables?.bookingId === booking.id}
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

/** The booking's start has passed (café time), so "never showed up" is allowed. */
function hasStarted(b: { sessionDate: string; startTime: string }): boolean {
  return new Date(`${b.sessionDate}T${b.startTime.slice(0, 8)}+05:30`).getTime() <= Date.now();
}

function dayChip(active: boolean): string {
  return cn(
    'inline-flex min-h-[44px] items-center gap-1.5 rounded-full border px-4 text-caption font-semibold transition-colors',
    'focus-within:outline-none focus-within:ring-2 focus-within:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
    active ? 'border-secondary bg-secondary text-white' : 'border-border bg-card text-text-primary hover:border-text-secondary',
  );
}

const DROP_STATUS: Record<string, string> = {
  pending_payment: 'Not paid yet',
  confirmed: 'Paid, not arrived',
  checked_in: 'Checked in',
  refunded: 'Refunded',
  given_away: 'Given away',
};

function DropBookingCard({ d, onCheckIn, busy }: { d: OwnerDropBooking; onCheckIn: () => void; busy: boolean }) {
  return (
    <Card elevation="resting">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="flex min-w-0 items-center gap-2 font-heading text-h3 text-text-primary">
              <User className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate">{d.name}</span>
            </h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-caption font-semibold text-primary">{DROP_STATUS[d.status] ?? d.status}</span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-text-secondary">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              {formatSessionDate(d.date)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {formatTime(d.startTime)} · {d.hours ?? ''}h
            </span>
            <span className="font-semibold text-text-primary">{d.dropTitle}</span>
            {d.seats > 1 && <span className="font-semibold text-text-primary">{d.seats} seats</span>}
          </div>
          <span className="font-data text-ref uppercase text-text-secondary">{d.reference}</span>
        </div>
        <div className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-border pt-3 sm:justify-end sm:border-0 sm:pt-0">
          {d.source === 'offline' ? (
            <span className="text-caption text-text-secondary">Sold at the café{d.price ? <>, <strong className="text-text-primary">₹{Math.round(d.price)}</strong> cash taken</> : null}</span>
          ) : (
            <span className="text-caption text-text-secondary">Pays at café: <strong className="text-text-primary">₹{Math.round(d.balanceDue)}</strong></span>
          )}
          {d.status === 'confirmed' && d.checkinToken && (
            <Button variant="primary" size="sm" onClick={onCheckIn} isLoading={busy} loadingText="Checking in" className="gap-1.5">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              <span>Check in</span>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

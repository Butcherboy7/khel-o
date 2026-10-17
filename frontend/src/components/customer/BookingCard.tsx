import Link from 'next/link';
import { Calendar, Clock, MapPin, QrCode, ChevronRight, Navigation, Star, AlertCircle, CreditCard, RotateCcw } from 'lucide-react';
import { Card, CardContent, BookingStatusBadge, PriceDisplay } from '@/components/ui';
import type { BookingDetail } from '@/types';
import { addDaysToDateString, formatSessionDate, formatTime, getTodayString, timeToMinutes } from '@/lib/format';

interface BookingCardProps {
  booking: BookingDetail;
}

/** Checkout with the same café, setup, players, length and start time. The
 *  day is today when that time is still bookable (35 min lead, as checkout
 *  uses), otherwise tomorrow; the date strip lets them change it. */
function bookAgainHref(b: BookingDetail): string {
  const people = b.playersCount ?? b.seatsCount ?? 1;
  const coop = (b.playersCount ?? 0) > (b.seatsCount ?? 1);
  const now = new Date();
  const startMin = timeToMinutes(b.startTime);
  const today = getTodayString();
  const date = startMin >= now.getHours() * 60 + now.getMinutes() + 35 ? today : addDaysToDateString(today, 1);
  const params = new URLSearchParams({
    cafeId: b.cafeId,
    tierId: b.hardwareTierId,
    date,
    time: b.startTime.slice(0, 8),
    dayOffset: '0',
    duration: String(b.durationHours),
    seats: String(people),
  });
  if (coop) params.set('coop', '1');
  return `/bookings/new?${params.toString()}`;
}

export function BookingCard({ booking }: BookingCardProps) {
  const isCompleted = booking.status === 'completed';
  const isConfirmed = booking.status === 'confirmed' || booking.status === 'completed' || booking.status === 'checked_in';
  const isPendingOrFailed = booking.status === 'pending_payment' || booking.status === 'failed';
  const isCancelled = booking.status === 'cancelled';
  const isNoShow = booking.status === 'no_show';
  const isPast = isCompleted || isCancelled || isNoShow;

  return (
    <Card elevation="resting" interactive className="overflow-hidden">
      <CardContent className="p-5 flex flex-col gap-4">
        <Link href={`/bookings/${booking.id}`} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            {/* Top row: Reference ID + Status Badge */}
            <div className="flex items-center gap-2">
              <span className="font-data text-ref font-semibold text-text-secondary uppercase tracking-wider bg-surface px-2 py-0.5 rounded-md">
                Ref: {booking.bookingReference}
              </span>
              <BookingStatusBadge status={booking.status} size="sm" />
            </div>

            {/* Title & Tier */}
            <div>
              <h3 className="font-heading text-h3 text-text-primary">
                {booking.cafeName || 'Gaming Café'}
              </h3>
              <p className="text-caption text-text-secondary font-medium">
                {booking.tierName || 'Hardware Tier'}
              </p>
            </div>

            {/* Metadata pills */}
            <div className="flex flex-wrap items-center gap-3 text-caption text-text-secondary pt-1">
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
              {booking.cafeAddress && (
                <div className="flex items-center gap-1 truncate max-w-xs">
                  <MapPin className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                  <span className="truncate">{booking.cafeAddress}</span>
                </div>
              )}
            </div>
          </div>

          {/* Right Action & Price */}
          <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-border pt-3 sm:pt-0 gap-3 flex-shrink-0">
            <PriceDisplay amount={booking.totalAmount} period="" size="md" />

            {isConfirmed ? (
              <div className="inline-flex items-center gap-1 text-caption font-semibold text-primary">
                <QrCode className="h-4 w-4" />
                <span>View Pass</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            ) : isPendingOrFailed ? (
              <div className="inline-flex items-center gap-1 text-caption font-bold text-warning bg-warning/10 px-2.5 py-1 rounded-full border border-warning/30">
                <CreditCard className="h-3.5 w-3.5" />
                <span>Pay Now</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </div>
            ) : (
              <div className="inline-flex items-center gap-1 text-caption font-semibold text-text-secondary">
                <span>View Details</span>
                <ChevronRight className="h-4 w-4" />
              </div>
            )}
          </div>
        </Link>

        {/* Quick Actions Row */}
        <div className="flex items-center justify-between border-t border-border/60 pt-3 gap-2 flex-wrap">
          <button
            onClick={() => {
              const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                `${booking.cafeName || 'Gaming Café'}, ${booking.cafeAddress || ''}`
              )}`;
              window.open(url, '_blank');
            }}
            className="flex items-center gap-1.5 text-caption font-semibold text-text-secondary hover:text-primary transition-colors"
          >
            <Navigation className="h-3.5 w-3.5" />
            <span>Directions</span>
          </button>

          {isPast ? (
            <div className="flex items-center gap-3">
              {isCompleted && (
                <Link
                  href={`/cafe/${booking.cafeId}`}
                  className="flex min-h-[44px] items-center gap-1.5 text-caption font-semibold text-accent hover:underline"
                >
                  <Star className="h-3.5 w-3.5 fill-accent" />
                  <span>Rate</span>
                </Link>
              )}
              <Link
                href={bookAgainHref(booking)}
                className="-my-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-4 text-caption font-bold text-white transition-colors hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Book again
              </Link>
            </div>
          ) : isPendingOrFailed ? (
            <span className="text-caption font-semibold text-warning">
              Payment required for check-in pass
            </span>
          ) : isCancelled ? (
            <span className="text-caption text-error font-medium">
              Cancelled session
            </span>
          ) : isNoShow ? (
            <span className="text-caption text-error font-medium">
              Session window expired — marked as no-show
            </span>
          ) : (
            <span className="text-caption text-text-secondary/70">
              Pass active for check-in
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

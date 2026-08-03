import Link from 'next/link';
import { Calendar, Clock, MapPin, QrCode, ChevronRight } from 'lucide-react';
import { Card, CardContent, BookingStatusBadge, PriceDisplay } from '@/components/ui';
import type { BookingDetail } from '@/types';
import { formatSessionDate, formatTime } from '@/lib/format';

interface BookingCardProps {
  booking: BookingDetail;
}

export function BookingCard({ booking }: BookingCardProps) {
  return (
    <Card elevation="resting" interactive className="overflow-hidden">
      <Link href={`/bookings/${booking.id}`} className="block">
        <CardContent className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
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

            <div className="inline-flex items-center gap-1 text-caption font-semibold text-primary">
              <QrCode className="h-4 w-4" />
              <span>View Pass</span>
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>
        </CardContent>
      </Link>
    </Card>
  );
}

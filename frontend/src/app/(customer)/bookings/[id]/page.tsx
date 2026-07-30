'use client';

import React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle, Clock, AlertTriangle, XCircle, MapPin } from 'lucide-react';
import { getBooking } from '@/lib/api';
import { formatDateLong, formatTime12h, getDurationLabel } from '@/lib/format';

export default function BookingDetailPage({ params }: { params: { id: string } }) {
  const bookingId = params.id;

  const { data: booking, isLoading, isError, refetch } = useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => getBooking(bookingId),
    enabled: Boolean(bookingId),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse pb-24">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-surface rounded-full" />
          <div className="h-6 bg-surface rounded w-1/3" />
        </div>
        <div className="card-base h-96 bg-surface rounded-3xl" />
      </div>
    );
  }

  if (isError || !booking) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md">
        <AlertTriangle className="w-12 h-12 text-error" />
        <h3 className="font-heading font-semibold text-lg text-text-primary">
          Unable to load booking pass
        </h3>
        <p className="text-text-secondary text-sm">
          Could not find reservation details. Please check your connection.
        </p>
        <div className="flex gap-3 pt-2">
          <Link
            href="/bookings"
            className="border border-border text-text-secondary bg-white px-4 py-2 rounded-2xl text-sm font-medium"
          >
            Back to My Bookings
          </Link>
          <button
            type="button"
            onClick={() => refetch()}
            className="bg-primary text-white px-4 py-2 rounded-2xl text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const isConfirmed = booking.status === 'confirmed';
  const isCompleted = booking.status === 'completed';
  const isCancelled = booking.status === 'cancelled';

  // Dynamic QR generator vector SVG fallback representation
  const qrData = encodeURIComponent(`KHELO:${booking.bookingReference}:${booking.id}`);
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}`;

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center space-x-3">
        <Link
          href="/bookings"
          className="p-2 bg-card border border-border rounded-full text-text-secondary hover:text-text-primary shadow-sm"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <h1 className="text-lg font-bold font-heading text-text-primary">Gaming Pass</h1>
      </div>

      <div className="card-base text-center p-6 space-y-4 shadow-lg border-2 border-border">
        {/* Status Indicator */}
        <div className="inline-flex p-3 rounded-full bg-emerald-50 text-primary">
          {isConfirmed || isCompleted ? (
            <CheckCircle className="w-8 h-8 text-primary" />
          ) : isCancelled ? (
            <XCircle className="w-8 h-8 text-error" />
          ) : (
            <Clock className="w-8 h-8 text-amber-500" />
          )}
        </div>

        <div>
          <h2 className="text-xl font-bold font-heading text-text-primary capitalize">
            Booking {booking.status.replace('_', ' ')}
          </h2>
          <p className="text-xs font-data text-primary font-bold mt-1">
            Ref: {booking.bookingReference || `GC-${booking.id.slice(0, 8).toUpperCase()}`}
          </p>
        </div>

        {/* Dynamic QR Code */}
        {isConfirmed ? (
          <div className="p-4 bg-white border border-border rounded-2xl flex flex-col items-center justify-center space-y-2 shadow-inner">
            <img
              src={qrCodeUrl}
              alt={`QR Code Pass for ${booking.bookingReference}`}
              className="w-44 h-44 object-contain rounded-lg"
            />
            <p className="text-[10px] font-data text-text-secondary">
              Present this QR code to café staff at check-in
            </p>
          </div>
        ) : (
          <div className="p-6 bg-surface border border-border rounded-2xl text-center space-y-1">
            <p className="text-xs font-heading font-semibold text-text-primary">
              Pass Status: {booking.status.toUpperCase()}
            </p>
            <p className="text-[11px] text-text-secondary">
              {isCancelled
                ? 'This booking was cancelled.'
                : 'Complete payment to activate your check-in pass.'}
            </p>
          </div>
        )}

        {/* Session Details List */}
        <div className="text-left p-4 bg-surface rounded-2xl space-y-2 text-xs font-data border border-border">
          <div className="flex justify-between items-center">
            <span className="text-text-secondary flex items-center gap-1">
              <MapPin className="w-3.5 h-3.5 text-primary" /> Café
            </span>
            <span className="text-text-primary font-medium">{booking.cafeName || 'Gaming Café'}</span>
          </div>

          {booking.tierName && (
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">Hardware Tier</span>
              <span className="text-text-primary font-medium">{booking.tierName}</span>
            </div>
          )}

          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Date</span>
            <span className="text-text-primary font-medium">{formatDateLong(booking.sessionDate)}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Time Slot</span>
            <span className="text-text-primary font-medium">
              {formatTime12h(booking.startTime)} — {formatTime12h(booking.endTime)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Duration</span>
            <span className="text-text-primary font-medium">{getDurationLabel(booking.durationHours)}</span>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-border font-bold">
            <span className="text-text-primary">Total Paid</span>
            <span className="text-primary text-sm">₹{booking.totalAmount.toFixed(2)}</span>
          </div>
        </div>

        {booking.notes && (
          <div className="text-left p-3 bg-card border border-border rounded-xl text-xs text-text-secondary italic">
            &quot;{booking.notes}&quot;
          </div>
        )}
      </div>
    </div>
  );
}

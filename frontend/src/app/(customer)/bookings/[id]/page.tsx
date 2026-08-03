'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ChevronLeft,
  Calendar,
  Clock,
  MapPin,
  QrCode,
  ShieldCheck,
  XCircle,
  Share2,
  CalendarPlus,
  ArrowLeft,
} from 'lucide-react';
import { getBooking, cancelBooking } from '@/lib/api/bookings';
import { queryKeys } from '@/hooks/queries/keys';
import {
  Button,
  Card,
  CardContent,
  BookingStatusBadge,
  PriceDisplay,
  Skeleton,
  ErrorState,
  Modal,
} from '@/components/ui';
import { formatSessionDate, formatTime } from '@/lib/format';

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const bookingId = params.id as string;

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.bookings.detail(bookingId),
    queryFn: () => getBooking(bookingId).then((res) => res.booking),
    enabled: Boolean(bookingId),
    staleTime: 0,
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelBooking(bookingId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      setIsCancelModalOpen(false);
    },
  });

  const handleShare = async () => {
    const shareData = {
      title: 'KHEL-O Digital Gaming Pass',
      text: `Check out my booking pass for ${data?.cafeName || 'Gaming Café'} on KHEL-O!`,
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // Share dismissed
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleAddToCalendar = () => {
    if (!data) return;
    const title = encodeURIComponent(`Gaming Session at ${data.cafeName || 'KHEL-O Venue'}`);
    const details = encodeURIComponent(`Pass Ref: ${data.bookingReference}. Tier: ${data.tierName || 'Gaming Station'}`);
    const location = encodeURIComponent(data.cafeAddress || 'Gaming Café');
    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}`;
    window.open(googleCalendarUrl, '_blank');
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 max-w-md mx-auto py-8">
        <Skeleton className="h-8 w-32 rounded-xl" />
        <Skeleton className="h-96 w-full rounded-3xl" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Pass Not Found"
        message={(error as Error)?.message || 'Could not retrieve your digital booking pass.'}
        onRetry={() => refetch()}
      />
    );
  }

  const booking = data;
  const canCancel = booking.status === 'confirmed' || booking.status === 'pending_payment';

  const qrCodeSrc =
    booking.qrCodeUrl ||
    `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      booking.bookingReference,
    )}`;

  return (
    <div className="flex flex-col gap-6 max-w-md mx-auto pb-16">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <Link href="/bookings">
          <Button variant="ghost" size="sm" className="gap-1 text-text-secondary">
            <ChevronLeft className="h-4 w-4" />
            <span>My Passes</span>
          </Button>
        </Link>
        <BookingStatusBadge status={booking.status} size="md" />
      </div>

      {/* Digital Pass Card */}
      <Card elevation="raised" className="overflow-hidden border-2 border-primary/20 bg-card">
        {/* Pass Header */}
        <div className="bg-secondary p-6 text-white text-center flex flex-col items-center gap-1">
          <span className="text-overline text-white/60 tracking-widest uppercase">
            Official Gaming Pass
          </span>
          <h1 className="font-heading text-h2 text-white">{booking.cafeName || 'Gaming Café'}</h1>
          <p className="text-caption text-white/80">{booking.tierName || 'Hardware Tier'}</p>
        </div>

        {/* QR Code Container */}
        <CardContent className="p-6 flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-surface border border-border shadow-card w-full">
            <div className="bg-white p-3 rounded-xl shadow-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrCodeSrc}
                alt={`QR Pass ${booking.bookingReference}`}
                className="h-48 w-48 object-contain"
              />
            </div>
            <div className="text-center">
              <span className="text-overline text-text-secondary">Booking Reference</span>
              <p className="font-data text-h3 font-bold text-text-primary tracking-wider">
                {booking.bookingReference}
              </p>
            </div>
          </div>

          {/* Details Grid */}
          <div className="w-full flex flex-col gap-3 text-body">
            <div className="flex items-center justify-between p-3 rounded-xl bg-surface">
              <div className="flex items-center gap-2 text-text-secondary">
                <Calendar className="h-4 w-4 text-primary" />
                <span>Session Date</span>
              </div>
              <span className="font-semibold text-text-primary">
                {formatSessionDate(booking.sessionDate)}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-surface">
              <div className="flex items-center gap-2 text-text-secondary">
                <Clock className="h-4 w-4 text-primary" />
                <span>Slot & Duration</span>
              </div>
              <span className="font-semibold text-text-primary">
                {formatTime(booking.startTime)} ({booking.durationHours}h)
              </span>
            </div>

            {booking.cafeAddress && (
              <div className="flex items-center justify-between p-3 rounded-xl bg-surface">
                <div className="flex items-center gap-2 text-text-secondary">
                  <MapPin className="h-4 w-4 text-primary flex-shrink-0" />
                  <span>Venue Address</span>
                </div>
                <span className="font-medium text-text-primary text-caption truncate max-w-[180px]">
                  {booking.cafeAddress}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between p-3 rounded-xl bg-surface">
              <span className="text-text-secondary">Total Amount</span>
              <PriceDisplay amount={booking.totalAmount} period="" size="md" />
            </div>
          </div>

          {/* Interactive Utility CTAs */}
          <div className="grid grid-cols-2 gap-3 w-full border-t border-border/60 pt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddToCalendar}
              className="gap-2 text-caption font-semibold"
            >
              <CalendarPlus className="h-4 w-4 text-primary" />
              <span>Add Calendar</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="gap-2 text-caption font-semibold"
            >
              <Share2 className="h-4 w-4 text-accent" />
              <span>{copiedLink ? 'Link Copied!' : 'Share Pass'}</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 text-caption text-text-secondary text-center pt-2">
            <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
            <span>Show this QR pass at the café desk for instant check-in.</span>
          </div>

          {/* Navigation & Cancel Actions */}
          <div className="flex flex-col gap-2 w-full pt-2">
            <Button
              variant="primary"
              size="md"
              fullWidth
              onClick={() => router.push('/')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Explore Cafés</span>
            </Button>

            {canCancel && (
              <Button
                variant="outline"
                size="md"
                fullWidth
                onClick={() => setIsCancelModalOpen(true)}
                className="text-error border-error/30 hover:bg-error/10"
              >
                Cancel Booking
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cancel Confirmation Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Booking"
        description="Are you sure you want to cancel this booking? This action cannot be undone."
        footer={
          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setIsCancelModalOpen(false)}>
              Keep Booking
            </Button>
            <Button
              variant="destructive"
              isLoading={cancelMutation.isPending}
              loadingText="Cancelling..."
              onClick={() => cancelMutation.mutate(cancelReason || 'Cancelled by gamer')}
            >
              Confirm Cancellation
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-caption text-text-secondary">
            Reason for cancellation (optional):
          </p>
          <input
            type="text"
            placeholder="e.g. Schedule conflict"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            className="w-full rounded-xl border border-border bg-surface px-4 py-2.5 text-body text-text-primary"
          />
        </div>
      </Modal>
    </div>
  );
}

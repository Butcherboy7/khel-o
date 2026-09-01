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
  AlertCircle,
  CreditCard,
  RefreshCw,
  Navigation,
  Phone,
} from 'lucide-react';
import { getBooking, cancelBooking } from '@/lib/api/bookings';
import { getCafe } from '@/lib/api/cafes';
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments';
import { queryKeys } from '@/hooks/queries/keys';
import { useRazorpay } from '@/hooks/useRazorpay';
import { useAuthStore } from '@/store/authStore';
import {
  Button,
  Card,
  CardContent,
  BookingStatusBadge,
  PriceDisplay,
  Skeleton,
  ErrorState,
  Modal,
  buttonVariants,
} from '@/components/ui';
import { formatSessionDate, formatTime } from '@/lib/format';
import { MockPaymentModal } from '@/components/MockPaymentModal';
import { getPublicEnv } from '@/lib/runtimeEnv';
import { cn } from '@/lib/cn';

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const bookingId = params.id as string;

  const user = useAuthStore((s) => s.user);
  const { displayRazorpay, mockModalState } = useRazorpay();

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isRetryingPayment, setIsRetryingPayment] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: queryKeys.bookings.detail(bookingId),
    queryFn: () => getBooking(bookingId).then((res) => res.booking),
    enabled: Boolean(bookingId),
    staleTime: 0,
  });

  // Café phone number and precise coordinates aren't included on the booking
  // response — fetch the real café record (same endpoint the booking wizard
  // uses) so "Get Directions" and "Contact Café" can use real data instead
  // of being fabricated or omitted outright.
  const { data: cafeDetail } = useQuery({
    queryKey: queryKeys.cafes.detail(data?.cafeId || ''),
    queryFn: () => getCafe(data!.cafeId).then((res) => res.cafe),
    enabled: Boolean(data?.cafeId),
    staleTime: 60_000,
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelBooking(bookingId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(bookingId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      setIsCancelModalOpen(false);
    },
  });

  const handleRetryPayment = async () => {
    if (!data || isRetryingPayment) return;
    setRetryError(null);
    setIsRetryingPayment(true);

    try {
      const order = await createPaymentOrder(data.id);
      displayRazorpay({
        order_id: order.razorpayOrderId,
        amount: order.amount * 100,
        currency: order.currency,
        key: order.keyId,
        name: 'KHEL-O Gaming',
        description: `Booking Retry: ${data.cafeName || 'Gaming Venue'}`,
        prefill: {
          name: user?.fullName,
          email: user?.email,
          contact: user?.phoneNumber || undefined,
        },
        onDismiss: () => {
          setIsRetryingPayment(false);
        },
        handler: async (paymentResponse) => {
          try {
            await verifyPayment({
              razorpayOrderId: paymentResponse.razorpay_order_id,
              razorpayPaymentId: paymentResponse.razorpay_payment_id,
              razorpaySignature: paymentResponse.razorpay_signature,
            });
            setIsRetryingPayment(false);
            refetch();
            queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
            if (data?.cafeId) {
              queryClient.invalidateQueries({ queryKey: ['cafe-availability', data.cafeId] });
              queryClient.invalidateQueries({ queryKey: queryKeys.cafes.detail(data.cafeId) });
            }
          } catch (verifyErr: any) {
            setRetryError(verifyErr?.message || 'Payment verification failed.');
            setIsRetryingPayment(false);
          }
        },
      });
    } catch (err: any) {
      setRetryError(err?.message || 'Failed to initiate payment retry.');
      setIsRetryingPayment(false);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: 'KHEL-O Booking Confirmation',
      text: `Check out my booking at ${data?.cafeName || 'Gaming Café'} on KHEL-O!`,
      url: window.location.href,
    };
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch {
        // Share dismissed
      }
    } else {
      navigator.clipboard.writeText(window.location.href).catch(() => {});
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleAddToCalendar = () => {
    if (!data) return;
    const title = encodeURIComponent(`Gaming Session at ${data.cafeName || 'KHEL-O Venue'}`);
    const details = encodeURIComponent(`Booking Ref: ${data.bookingReference}. Tier: ${data.tierName || 'Gaming Station'}`);
    const location = encodeURIComponent(data.cafeAddress || 'Gaming Café');

    // Real event window from the booking's own session date + start/end
    // time, formatted for the Google Calendar TEMPLATE action
    // (YYYYMMDDTHHMMSS/YYYYMMDDTHHMMSS). ctz pins the floating times to IST
    // so the event lands at the correct wall-clock slot regardless of the
    // viewer's device timezone.
    const toGCalStamp = (dateStr: string, timeStr: string) =>
      `${dateStr.replace(/-/g, '')}T${timeStr.replace(/:/g, '').padEnd(6, '0').slice(0, 6)}`;
    const dates = `${toGCalStamp(data.sessionDate, data.startTime)}/${toGCalStamp(data.sessionDate, data.endTime)}`;

    const googleCalendarUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&location=${location}&dates=${dates}&ctz=Asia/Kolkata`;
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
        title="Booking Not Found"
        message={(error as Error)?.message || 'Could not retrieve your booking details.'}
        onRetry={() => refetch()}
      />
    );
  }

  const booking = data;
  const isCancelled = booking.status === 'cancelled';
  const isConfirmed = booking.status === 'confirmed' || booking.status === 'completed' || booking.status === 'checked_in';
  const isPendingOrFailed = booking.status === 'pending_payment' || booking.status === 'failed';

  const canCancel = booking.cancelPolicy?.allowed ?? false;
  const cancelDisabledReason = booking.cancelPolicy?.reason ?? '';

  // Directions: prefer the café's real lat/lng (from the café record) for a
  // precise pin, falling back to a text search on the real address string.
  // Omit the action entirely if neither is available rather than link
  // somewhere fabricated.
  const directionsUrl =
    cafeDetail?.latitude != null && cafeDetail?.longitude != null
      ? `https://www.google.com/maps/search/?api=1&query=${cafeDetail.latitude},${cafeDetail.longitude}`
      : booking.cafeAddress
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.cafeAddress)}`
      : null;

  // Only a real café phone number (from the café record) unlocks Contact
  // Café — never show a dead/placeholder action.
  const cafePhone = cafeDetail?.phoneNumber || null;

  const getQrSrc = () => {
    if (booking.qrCodeUrl) {
      if (booking.qrCodeUrl.startsWith('http')) {
        return booking.qrCodeUrl;
      }
      const rawApiUrl = getPublicEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000');
      const apiHost = rawApiUrl.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '');
      return `${apiHost}${booking.qrCodeUrl.startsWith('/') ? '' : '/'}${booking.qrCodeUrl}`;
    }
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
      booking.bookingReference
    )}`;
  };

  const qrCodeSrc = getQrSrc();

  return (
    <div className="flex flex-col gap-6 max-w-md mx-auto pb-16">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <Link href="/bookings">
          <Button variant="ghost" size="sm" className="gap-1 text-text-secondary">
            <ChevronLeft className="h-4 w-4" />
            <span>My Bookings</span>
          </Button>
        </Link>
        <BookingStatusBadge status={booking.status} size="md" />
      </div>

      {/* Booking Confirmation Card */}
      <Card
        elevation="raised"
        className={`overflow-hidden border-2 bg-card animate-fade-in-up ${
          isCancelled
            ? 'border-error/30'
            : isPendingOrFailed
            ? 'border-warning/40'
            : 'border-primary/20'
        }`}
      >
        {/* Booking Header */}
        <div
          className={`${
            isCancelled
              ? 'bg-error/80'
              : isPendingOrFailed
              ? 'bg-warning/90'
              : 'bg-secondary'
          } p-6 text-white text-center flex flex-col items-center gap-1`}
        >
          <span className="text-overline text-white/80 tracking-widest uppercase">
            {isCancelled
              ? 'Cancelled Booking'
              : isPendingOrFailed
              ? 'Payment Not Completed'
              : 'Confirmed Booking'}
          </span>
          <h1 className="font-heading text-h2 text-white">{booking.cafeName || 'Gaming Café'}</h1>
          <p className="text-caption text-white/90">{booking.tierName || 'Hardware Tier'}</p>
        </div>

        {/* QR Code / Void / Pending Payment Container */}
        <CardContent className="p-6 flex flex-col items-center gap-6">
          {retryError && (
            <div className="w-full p-3 rounded-xl bg-error/10 border border-error/20 text-caption text-error text-center">
              {retryError}
            </div>
          )}

          {isCancelled ? (
            <div className="flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-error/10 border border-error/20 text-center w-full">
              <XCircle className="h-16 w-16 text-error" />
              <div>
                <h3 className="font-heading text-h3 font-bold text-error">Booking Cancelled</h3>
                <p className="text-caption text-text-secondary mt-1">
                  This booking was cancelled and its QR check-in code is no longer active.
                </p>
              </div>
              <div className="text-center mt-2">
                <span className="text-overline text-text-secondary">Reference</span>
                <p className="font-data text-body font-bold text-text-primary line-through">
                  {booking.bookingReference}
                </p>
              </div>
            </div>
          ) : isPendingOrFailed ? (
            <div className="flex flex-col items-center justify-center gap-4 p-6 rounded-2xl bg-warning/10 border border-warning/30 text-center w-full">
              <AlertCircle className="h-14 w-14 text-warning" />
              <div>
                <h3 className="font-heading text-h3 font-bold text-text-primary">Payment Required</h3>
                <p className="text-caption text-text-secondary mt-1">
                  Payment was not completed for this booking. Complete payment now to generate your QR check-in code.
                </p>
              </div>

              <div className="flex flex-col gap-2.5 w-full mt-2">
                <Button
                  variant="primary"
                  size="md"
                  fullWidth
                  isLoading={isRetryingPayment}
                  loadingText="Opening Payment..."
                  onClick={handleRetryPayment}
                  className="gap-2 shadow-card"
                >
                  <CreditCard className="h-4 w-4" />
                  <span>Retry Payment</span>
                </Button>

                <Button
                  variant="destructive-outline"
                  size="md"
                  fullWidth
                  disabled={!canCancel}
                  title={!canCancel ? cancelDisabledReason : ''}
                  onClick={() => setIsCancelModalOpen(true)}
                  className="gap-2"
                >
                  <XCircle className="h-4 w-4" />
                  <span>Cancel Booking</span>
                </Button>
                {!canCancel && cancelDisabledReason && (
                  <p className="text-caption text-text-secondary text-center">
                    {cancelDisabledReason}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 p-4 rounded-2xl bg-surface border border-border shadow-card w-full">
              <div className="bg-white p-3 rounded-xl shadow-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={qrCodeSrc}
                  alt={`QR Check-in Code ${booking.bookingReference}`}
                  className="h-48 w-48 object-contain"
                  onError={(e) => {
                    e.currentTarget.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                      booking.bookingReference
                    )}`;
                  }}
                />
              </div>
              <div className="text-center">
                <span className="text-overline text-text-secondary">Booking Reference</span>
                <p className="font-data text-h3 font-bold text-text-primary tracking-wider">
                  {booking.bookingReference}
                </p>
              </div>
            </div>
          )}

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
                <span>Start &ndash; End</span>
              </div>
              <span className="font-semibold text-text-primary">
                {formatTime(booking.startTime)} &ndash; {formatTime(booking.endTime)} ({booking.durationHours}h)
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
              <span className="text-text-secondary">{isConfirmed ? 'Amount Paid' : 'Total Amount'}</span>
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

            {directionsUrl && (
              <a
                href={directionsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2 text-caption font-semibold')}
              >
                <Navigation className="h-4 w-4 text-primary" />
                <span>Get Directions</span>
              </a>
            )}

            {cafePhone && (
              <a
                href={`tel:${cafePhone}`}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2 text-caption font-semibold')}
              >
                <Phone className="h-4 w-4 text-primary" />
                <span>Contact Café</span>
              </a>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="gap-2 text-caption font-semibold"
            >
              <Share2 className="h-4 w-4 text-accent" />
              <span>{copiedLink ? 'Link Copied!' : 'Share Booking'}</span>
            </Button>
          </div>

          <div className="flex items-center gap-2 text-caption text-text-secondary text-center pt-2">
            <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0" />
            <span>Show this QR code at the café desk for instant check-in.</span>
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

            <Button
              variant="destructive-outline"
              size="md"
              fullWidth
              disabled={!canCancel}
              title={!canCancel ? cancelDisabledReason : ''}
              onClick={() => setIsCancelModalOpen(true)}
              className="gap-2"
            >
              <XCircle className="h-4 w-4" />
              <span>Cancel Booking</span>
            </Button>
            {!canCancel && cancelDisabledReason && (
              <p className="text-caption text-text-secondary text-center">
                {cancelDisabledReason}
              </p>
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

      {/* Mock Payment Modal for Sandbox Mode */}
      {mockModalState && mockModalState.isOpen && (
        <MockPaymentModal
          isOpen={mockModalState.isOpen}
          orderId={mockModalState.orderId}
          amount={mockModalState.amount}
          onSuccess={mockModalState.onSuccess}
          onFailure={mockModalState.onFailure}
          onClose={mockModalState.onClose}
        />
      )}
    </div>
  );
}

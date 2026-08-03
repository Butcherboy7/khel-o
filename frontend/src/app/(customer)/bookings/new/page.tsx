'use client';

import { useState, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  Minus,
  Plus,
  User,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import { getCafe } from '@/lib/api/cafes';
import { createBooking } from '@/lib/api/bookings';
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments';
import { queryKeys } from '@/hooks/queries/keys';
import { useRazorpay } from '@/hooks/useRazorpay';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, Skeleton, ErrorState } from '@/components/ui';
import {
  getNext14Days,
  formatDateStrip,
  formatSessionDate,
  generateTimeSlots,
  formatTime,
  getTodayString,
} from '@/lib/format';
import type { HardwareTier } from '@/types';

function BookingWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cafeId = searchParams.get('cafeId') || '';

  const user = useAuthStore((s) => s.user);
  const { displayRazorpay } = useRazorpay();

  const availableDates = getNext14Days();
  const [selectedDate, setSelectedDate] = useState(availableDates[0]?.dateString || getTodayString());
  const [selectedTime, setSelectedTime] = useState('18:00:00');
  const [durationHours, setDurationHours] = useState(2);
  const [seatsCount, setSeatsCount] = useState(1);
  const [selectedTier, setSelectedTier] = useState<HardwareTier | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: cafe, isLoading, isError, error: fetchError } = useQuery({
    queryKey: queryKeys.cafes.detail(cafeId),
    queryFn: () => getCafe(cafeId).then((res) => res.cafe),
    enabled: Boolean(cafeId),
    staleTime: 60_000,
  });

  if (!cafeId) {
    return (
      <ErrorState
        title="No Café Selected"
        message="Please select a gaming café to start a booking."
        onRetry={() => router.push('/')}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-32 w-full rounded-2xl" />
      </div>
    );
  }

  if (isError || !cafe) {
    return (
      <ErrorState
        title="Failed to load venue"
        message={(fetchError as Error)?.message || 'Could not fetch café options.'}
        onRetry={() => router.push('/')}
      />
    );
  }

  const timeSlots = generateTimeSlots(
    cafe.openingTime || '09:00:00',
    cafe.closingTime || '23:00:00',
    selectedDate
  );

  const activeTier = selectedTier || (cafe.tiers && cafe.tiers[0] ? cafe.tiers[0] : null);

  // Price calculations matching Lovable target
  const pricePerHour = activeTier?.pricePerHour || 100;
  const baseTotal = pricePerHour * durationHours * seatsCount;
  const platformFee = 19;
  const gst = Math.round(baseTotal * 0.18);
  const finalTotal = baseTotal + platformFee + gst;

  const handleCheckout = async () => {
    if (!activeTier) {
      setError('Please select a hardware tier to proceed.');
      return;
    }
    if (isProcessing) return;

    setError(null);
    setIsProcessing(true);

    try {
      // Step 1: Create booking
      const bookingRes = await createBooking({
        cafeId: cafe.id,
        hardwareTierId: activeTier.id,
        sessionDate: selectedDate,
        startTime: selectedTime,
        durationHours: durationHours,
        promotionId: activeTier.activePromotion?.id || undefined,
      });

      const booking = bookingRes.booking;

      // Step 2: Create Razorpay Order
      const order = await createPaymentOrder(booking.id);

      // Step 3: Trigger Razorpay Checkout Modal
      displayRazorpay({
        order_id: order.razorpayOrderId,
        amount: order.amount * 100,
        currency: order.currency,
        key: order.keyId,
        name: 'KHEL-O Gaming',
        description: `Booking: ${cafe.name} (${activeTier.name})`,
        prefill: {
          name: user?.fullName,
          email: user?.email,
          contact: user?.phoneNumber || undefined,
        },
        handler: async (paymentResponse) => {
          try {
            await verifyPayment({
              razorpayOrderId: paymentResponse.razorpay_order_id,
              razorpayPaymentId: paymentResponse.razorpay_payment_id,
              razorpaySignature: paymentResponse.razorpay_signature,
            });
            router.push(`/bookings/${booking.id}`);
          } catch (verifyErr: any) {
            setError(verifyErr?.message || 'Payment verification failed.');
            setIsProcessing(false);
          }
        },
      });
    } catch (err: any) {
      setError(err?.message || 'Failed to create booking.');
      setIsProcessing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto pb-32">
      {/* Header (Matches Lovable Target) */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-secondary hover:bg-border/60"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-heading text-h2 font-bold text-text-primary">{cafe.name}</h1>
          <p className="text-caption text-text-secondary">{cafe.city}, Bengaluru</p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-error/10 border border-error/20 text-caption text-error">
          {error}
        </div>
      )}

      {/* Select Date Section */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-h3 font-bold text-text-primary">Select date</h2>
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-1">
          {availableDates.slice(0, 7).map((dateObj: any) => {
            const dateStr = typeof dateObj === 'string' ? dateObj : dateObj.dateString;
            const { day, date } = formatDateStrip(dateStr);
            const isSelected = dateStr === selectedDate;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`flex flex-col items-center justify-center h-20 w-16 rounded-full flex-shrink-0 transition-all ${
                  isSelected
                    ? 'bg-secondary text-white shadow-float font-bold'
                    : 'bg-card text-text-primary border border-border/80 hover:bg-surface'
                }`}
              >
                <span className="text-caption font-semibold">{day}</span>
                <span className="text-h2 font-heading mt-0.5">{date}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Select Time Slot Section */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-h3 font-bold text-text-primary">Select slot</h2>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {timeSlots.slice(0, 16).map((slotObj: any) => {
            const slotStr = typeof slotObj === 'string' ? slotObj : slotObj.timeString;
            const isDisabled = slotObj?.isDisabled || false;
            const isSelected = slotStr === selectedTime;

            return (
              <button
                key={slotStr}
                disabled={isDisabled}
                onClick={() => setSelectedTime(slotStr)}
                className={`py-3 px-3 rounded-full text-caption font-semibold transition-all ${
                  isDisabled
                    ? 'bg-surface text-text-secondary/40 border border-border/40 cursor-not-allowed line-through'
                    : isSelected
                    ? 'bg-secondary text-white shadow-card ring-2 ring-secondary/50'
                    : 'bg-card text-text-primary border border-border/80 hover:bg-surface'
                }`}
              >
                {formatTime(slotStr)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Duration & Seats Steppers Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Duration Control */}
        <div className="p-4 rounded-3xl bg-card border border-border/80 flex items-center justify-between">
          <div>
            <span className="text-overline text-text-secondary uppercase">Duration</span>
            <div className="font-heading text-h3 font-bold text-text-primary mt-0.5">
              {durationHours} hr
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDurationHours((h) => Math.max(1, h - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDurationHours((h) => Math.min(8, h + 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Seats Control */}
        <div className="p-4 rounded-3xl bg-card border border-border/80 flex items-center justify-between">
          <div>
            <span className="text-overline text-text-secondary uppercase">Seats</span>
            <div className="font-heading text-h3 font-bold text-text-primary flex items-center gap-1 mt-0.5">
              <User className="h-4 w-4 text-text-secondary" />
              <span>{seatsCount}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSeatsCount((s) => Math.max(1, s - 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              onClick={() => setSeatsCount((s) => Math.min(6, s + 1))}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Hardware Tier Selection (Radio Cards) */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-h3 font-bold text-text-primary">Hardware tier</h2>
        <div className="flex flex-col gap-3">
          {cafe.tiers && cafe.tiers.length > 0 ? (
            cafe.tiers.map((tier) => {
              const isSelected = activeTier?.id === tier.id;
              return (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTier(tier)}
                  className={`p-4 rounded-3xl text-left transition-all flex items-center justify-between border ${
                    isSelected
                      ? 'border-accent bg-accent/5 ring-1 ring-accent'
                      : 'border-border/80 bg-card hover:bg-surface'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-4 w-4 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? 'border-accent bg-accent' : 'border-border'
                      }`}
                    >
                      {isSelected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <h4 className="font-heading text-h3 font-bold text-text-primary">{tier.name}</h4>
                      <p className="text-caption text-text-secondary">
                        {tier.specs?.gpu || 'RTX 3050'} • {tier.specs?.ram || '16GB RAM'} • {tier.specs?.monitor || '144Hz'}
                      </p>
                    </div>
                  </div>

                  <div className="font-data text-body-emphasis font-bold text-text-primary">
                    ₹{tier.pricePerHour}/hr
                  </div>
                </button>
              );
            })
          ) : (
            <p className="text-body text-text-secondary italic">No hardware tiers listed.</p>
          )}
        </div>
      </div>

      {/* Detailed Price Breakdown Card */}
      <Card elevation="resting" className="rounded-3xl border border-border/80">
        <CardContent className="p-5 flex flex-col gap-2.5 text-body text-text-secondary">
          <div className="flex items-center justify-between">
            <span>
              {activeTier?.name || 'Standard'} × {durationHours} hr × {seatsCount} seat
            </span>
            <span className="font-body font-semibold text-text-primary text-body">₹{baseTotal}</span>
          </div>

          <div className="flex items-center justify-between">
            <span>Platform fee</span>
            <span className="font-body font-semibold text-text-primary text-body">₹{platformFee}</span>
          </div>

          <div className="flex items-center justify-between">
            <span>GST (18%)</span>
            <span className="font-body font-semibold text-text-primary text-body">₹{gst}</span>
          </div>
        </CardContent>
      </Card>

      {/* Sticky Bottom Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-sticky bg-card/95 backdrop-blur-md border-t border-border/80 p-4 shadow-overlay">
        <div className="max-w-content mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-caption text-text-secondary block">
              {formatSessionDate(selectedDate)} • {formatTime(selectedTime)} • {durationHours} hr
            </span>
            <div className="font-heading text-h1 font-bold text-text-primary">
              ₹{finalTotal}
            </div>
          </div>

          <button
            onClick={handleCheckout}
            disabled={isProcessing}
            className="rounded-2xl bg-primary px-10 py-3.5 font-heading text-btn font-bold text-white shadow-float hover:bg-primary-dark disabled:opacity-50 transition-colors"
          >
            {isProcessing ? 'Processing...' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BookingWizardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center p-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <BookingWizardContent />
    </Suspense>
  );
}

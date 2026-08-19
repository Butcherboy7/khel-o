'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ChevronLeft,
  Minus,
  Plus,
  User,
  ShieldCheck,
  Loader2,
  Monitor,
  CheckCircle,
} from 'lucide-react';
import { getCafe, getCafeAvailability } from '@/lib/api/cafes';
import { createBooking } from '@/lib/api/bookings';
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments';
import { queryKeys } from '@/hooks/queries/keys';
import { useRazorpay } from '@/hooks/useRazorpay';
import { MockPaymentModal } from '@/components/MockPaymentModal';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, Skeleton, ErrorState } from '@/components/ui';
import { TimelineRangePicker } from '@/components/customer/TimelineRangePicker';
import {
  getNext14Days,
  formatDateStrip,
  formatSessionDate,
  formatTime,
  getTodayString,
  timeToMinutes,
  minutesToTimeString,
  calculateWindowRemainingSeats,
} from '@/lib/format';
import type { HardwareTier } from '@/types';

function BookingWizardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cafeId = searchParams.get('cafeId') || '';
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const { displayRazorpay, mockModalState } = useRazorpay();

  const availableDates = getNext14Days();
  const [selectedDate, setSelectedDate] = useState(availableDates[0] || getTodayString());

  // Dynamically compute valid initial start time (at least current time + 30 mins)
  const getInitialValidTime = () => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const validMin = Math.ceil((nowMin + 35) / 30) * 30;
    return minutesToTimeString(validMin % 1440);
  };

  const [selectedTime, setSelectedTime] = useState(getInitialValidTime());
  const [durationHours, setDurationHours] = useState(2);
  const [seatsCount, setSeatsCount] = useState(1);
  const [selectedTier, setSelectedTier] = useState<HardwareTier | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: cafe, isLoading, isError, error: fetchError } = useQuery({
    queryKey: queryKeys.cafes.detail(cafeId),
    queryFn: () => getCafe(cafeId).then((res) => res.cafe),
    enabled: Boolean(cafeId),
    staleTime: 2_000,
    refetchInterval: 4_000,
  });

  const activeTier = selectedTier || (cafe?.tiers && cafe.tiers[0] ? cafe.tiers[0] : null);

  const { data: availabilityData } = useQuery({
    queryKey: ['cafe-availability', cafeId, activeTier?.id, selectedDate],
    queryFn: () => getCafeAvailability(cafeId, activeTier!.id, selectedDate),
    enabled: Boolean(cafeId && activeTier?.id && selectedDate),
    staleTime: 2_000,
    refetchInterval: 3_000,
  });

  // Seats actually free for the currently selected time window — same calculation
  // TimelineRangePicker uses for its "Only N seats left!" badge, so the seats
  // stepper and the Book button below can never disagree with what's shown there.
  const totalSeatsForTier = availabilityData?.appBookableSeats || activeTier?.totalSeats || 10;
  const windowRemainingSeats = useMemo(() => {
    const openingStr = cafe?.openingTime || '09:00:00';
    let windowStart = timeToMinutes(selectedTime);
    const openMin = timeToMinutes(openingStr);
    if (windowStart < openMin) windowStart += 1440;
    const windowEnd = windowStart + Math.round(durationHours * 60);
    return calculateWindowRemainingSeats(
      totalSeatsForTier,
      availabilityData?.bookedSlots || [],
      windowStart,
      windowEnd
    );
  }, [totalSeatsForTier, availabilityData?.bookedSlots, selectedTime, durationHours, cafe?.openingTime]);

  // Listen for real-time seat cap updates from owner dashboard
  useEffect(() => {
    const handleSeatCapUpdate = () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cafes.detail(cafeId) });
      queryClient.invalidateQueries({ queryKey: ['cafe-availability'] });
    };

    window.addEventListener('khelo:seat-cap-updated', handleSeatCapUpdate);
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'khelo_seat_cap') handleSeatCapUpdate();
    };
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('khelo:seat-cap-updated', handleSeatCapUpdate);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [cafeId, queryClient]);

  // Automatically find and select the first available time slot when availability loads or date/tier changes
  useEffect(() => {
    if (!cafe || !availabilityData) return;

    const openingStr = cafe.openingTime || '09:00:00';
    const closingStr = cafe.closingTime || '23:00:00';
    const openMin = timeToMinutes(openingStr);
    let closeMin = timeToMinutes(closingStr);
    if (closeMin <= openMin) closeMin += 1440;

    const totalSeats = availabilityData.appBookableSeats || activeTier?.totalSeats || 10;
    const bookedSlots = availabilityData.bookedSlots || [];

    const today = getTodayString();
    let minValidStart = openMin;
    if (selectedDate === today) {
      const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
      minValidStart = Math.max(openMin, Math.ceil((nowMin + 30) / 30) * 30);
    }

    // Find the first 2-hour continuous available slot
    let foundFirstSlot = false;
    for (let m = minValidStart; m <= closeMin - 120; m += 30) {
      let isAvailable = true;
      for (let checkM = m; checkM < m + 120; checkM += 30) {
        let occupied = 0;
        for (const bs of bookedSlots) {
          let bS = timeToMinutes(bs.startTime);
          let bE = timeToMinutes(bs.endTime);
          if (bE <= bS) bE += 1440;
          if (checkM < bE && checkM + 30 > bS) {
            occupied += (bs as any).seatsCount || 1;
          }
        }
        if (occupied + seatsCount > totalSeats) {
          isAvailable = false;
          break;
        }
      }

      if (isAvailable) {
        setSelectedTime(minutesToTimeString(m));
        foundFirstSlot = true;
        break;
      }
    }

    // If no 2-hour slot is free, search for a 1-hour slot
    if (!foundFirstSlot) {
      for (let m = minValidStart; m <= closeMin - 60; m += 30) {
        let isAvailable = true;
        for (let checkM = m; checkM < m + 60; checkM += 30) {
          let occupied = 0;
          for (const bs of bookedSlots) {
            let bS = timeToMinutes(bs.startTime);
            let bE = timeToMinutes(bs.endTime);
            if (bE <= bS) bE += 1440;
            if (checkM < bE && checkM + 30 > bS) {
              occupied += (bs as any).seatsCount || 1;
            }
          }
          if (occupied + seatsCount > totalSeats) {
            isAvailable = false;
            break;
          }
        }

        if (isAvailable) {
          setSelectedTime(minutesToTimeString(m));
          setDurationHours(1);
          foundFirstSlot = true;
          break;
        }
      }
    }

    if (!foundFirstSlot && minValidStart < closeMin) {
      setSelectedTime(minutesToTimeString(minValidStart));
    }
  }, [cafe, availabilityData, selectedDate, activeTier?.id, seatsCount]);

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

  // Price calculations (aligned with backend: gatewayFee = 2%, convenienceFee = 10)
  const pricePerHour = activeTier?.pricePerHour || 100;
  const baseTotal = Math.round(pricePerHour * durationHours * seatsCount);
  const gatewayFee = Math.round(baseTotal * 0.02 * 100) / 100;
  const convenienceFee = 10;
  const finalTotal = baseTotal + gatewayFee + convenienceFee;

  const handleTimelineChange = (newStartTime: string, newDurationHours: number) => {
    setSelectedTime(newStartTime);
    setDurationHours(newDurationHours);
  };

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
        seatsCount: seatsCount,
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
        onDismiss: () => {
          setIsProcessing(false);
          router.push(`/bookings/${booking.id}`);
        },
        handler: async (paymentResponse) => {
          try {
            await verifyPayment({
              razorpayOrderId: paymentResponse.razorpay_order_id,
              razorpayPaymentId: paymentResponse.razorpay_payment_id,
              razorpaySignature: paymentResponse.razorpay_signature,
            });
            queryClient.invalidateQueries({ queryKey: ['cafe-availability'] });
            queryClient.invalidateQueries({ queryKey: queryKeys.cafes.detail(cafeId) });
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
    <>
      <div className="flex flex-col gap-6 max-w-2xl mx-auto pb-32">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-secondary hover:bg-border/60 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="font-heading text-h2 font-bold text-text-primary">{cafe.name}</h1>
          <p className="text-caption text-text-secondary">{cafe.city}, Bengaluru</p>
        </div>
      </div>

      {(cafe.isEmergencyMode || cafe.bookingsPaused || cafe.bookableStations === 0 || availabilityData?.appBookableSeats === 0) && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-600 font-medium text-caption flex items-center gap-3 shadow-card">
          <div className="h-10 w-10 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center flex-shrink-0 text-xl">
            ⏸️
          </div>
          <div>
            <h3 className="font-bold text-body text-text-primary">App Bookings Paused / Walk-Ins Only</h3>
            <p className="text-xs text-text-secondary mt-0.5">
              {cafe.isEmergencyMode
                ? 'Café is currently in Emergency Mode and not accepting new bookings.'
                : 'The venue owner has paused online app bookings or reserved all stations for walk-in players. Please visit the café directly for walk-in availability.'}
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-error/10 border border-error/20 text-caption text-error">
          {error}
        </div>
      )}

      {/* Step 1: Select Date */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-h3 font-bold text-text-primary">1. Select Date</h2>
        <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide py-1">
          {availableDates.map((dateObj: any) => {
            const dateStr = typeof dateObj === 'string' ? dateObj : dateObj.dateString;
            const { day, date } = formatDateStrip(dateStr);
            const isSelected = dateStr === selectedDate;

            return (
              <button
                key={dateStr}
                onClick={() => setSelectedDate(dateStr)}
                className={`flex flex-col items-center justify-center h-20 w-16 rounded-2xl flex-shrink-0 transition-all ${
                  isSelected
                    ? 'bg-secondary text-white shadow-float font-bold scale-105'
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

      {/* Step 2: Select Hardware Tier (Before timeline, simplifies model) */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-h3 font-bold text-text-primary">2. Hardware Tier</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {cafe.tiers && cafe.tiers.length > 0 ? (
            cafe.tiers.map((tier) => {
              const isSelected = activeTier?.id === tier.id;
              const isTierPaused = cafe.bookingsPaused || cafe.isEmergencyMode || cafe.bookableStations === 0 || tier.appBookableSeats === 0;

              return (
                <motion.button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTier(tier)}
                  whileTap={{ scale: 0.97 }}
                  className={`p-4 rounded-3xl text-left transition-all flex flex-col justify-between border ${
                    isSelected
                      ? 'border-accent bg-accent/5 ring-2 ring-accent/60 shadow-card'
                      : 'border-border/80 bg-card hover:bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-heading text-h3 font-bold text-text-primary">{tier.name}</h4>
                      <p className="text-caption text-text-secondary mt-0.5">
                        {tier.specs?.gpu || 'RTX 3050'} • {tier.specs?.ram || '16GB RAM'}
                      </p>
                    </div>
                    <div
                      className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isSelected ? 'border-accent bg-accent text-white' : 'border-border'
                      }`}
                    >
                      {isSelected && <CheckCircle className="h-4 w-4 fill-accent text-white" />}
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-border/50 pt-2.5 mt-2">
                    {isTierPaused ? (
                      <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-xs font-bold text-amber-600">
                        Walk-Ins Only
                      </span>
                    ) : isSelected ? (
                      <span className="text-caption text-text-secondary">
                        <span className={windowRemainingSeats <= 2 ? 'font-bold text-error' : windowRemainingSeats <= 10 ? 'font-bold text-warning' : ''}>
                          {windowRemainingSeats}
                        </span>{' '}
                        free for this slot ({tier.totalSeats || 10} total)
                      </span>
                    ) : (
                      <span className="text-caption text-text-secondary">
                        {tier.appBookableSeats !== undefined ? tier.appBookableSeats : (tier.totalSeats || 10)} app seats ({tier.totalSeats || 10} total)
                      </span>
                    )}
                    <div className="font-data text-body-emphasis font-bold text-text-primary">
                      <span className="rupee-symbol">₹</span>{tier.pricePerHour}<span className="text-caption font-normal text-text-secondary">/hr</span>
                    </div>
                  </div>
                </motion.button>
              );
            })
          ) : (
            <p className="text-body text-text-secondary italic">No hardware tiers listed.</p>
          )}
        </div>
      </div>

      {/* Step 3: Time Range (Playo-style drag slider) */}
      <div className="rounded-3xl bg-surface border border-border/50 px-4 pt-2 pb-4 overflow-hidden">
        <h2 className="font-heading text-h3 font-bold text-text-primary mb-1">3. Time Range</h2>
        <TimelineRangePicker
          openingTime={cafe.openingTime || '09:00:00'}
          closingTime={cafe.closingTime || '23:00:00'}
          selectedDate={selectedDate}
          startTime={selectedTime}
          durationHours={durationHours}
          onChange={handleTimelineChange}
          bookedSlots={availabilityData?.bookedSlots || []}
          totalSeats={totalSeatsForTier}
          requestedSeats={seatsCount}
          remainingSeats={windowRemainingSeats}
        />
      </div>

      {/* Step 4: Number of Seats Stepper */}
      <div className="p-4 rounded-3xl bg-card border border-border/80 flex items-center justify-between">
        <div>
          <span className="text-overline text-text-secondary uppercase">Seats Required</span>
          <div className="font-heading text-h3 font-bold text-text-primary flex items-center gap-1.5 mt-0.5">
            <User className="h-4 w-4 text-primary" />
            <span>{seatsCount} {seatsCount === 1 ? 'Seat' : 'Seats'}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSeatsCount((s) => Math.max(1, s - 1))}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center font-heading text-body font-bold">{seatsCount}</span>
          <button
            type="button"
            onClick={() => setSeatsCount((s) => Math.min(windowRemainingSeats, 6, s + 1))}
            disabled={seatsCount >= windowRemainingSeats || seatsCount >= 6}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Step 5: Dynamic Price Breakdown Card */}
      <Card elevation="resting" className="rounded-3xl border border-border/80">
        <CardContent className="p-5 flex flex-col gap-2.5 text-body text-text-secondary">
          <div className="flex items-center justify-between">
            <span>
              {activeTier?.name || 'Standard'} ({durationHours} hr × {seatsCount} seat{seatsCount > 1 ? 's' : ''})
            </span>
            <span className="font-body font-semibold text-text-primary text-body"><span className="rupee-symbol">₹</span>{baseTotal}</span>
          </div>

          <div className="flex items-center justify-between">
            <span>Gateway fee (2%)</span>
            <span className="font-body font-semibold text-text-primary text-body"><span className="rupee-symbol">₹</span>{gatewayFee.toFixed(2)}</span>
          </div>

          <div className="flex items-center justify-between">
            <span>Convenience fee</span>
            <span className="font-body font-semibold text-text-primary text-body"><span className="rupee-symbol">₹</span>{convenienceFee}</span>
          </div>
        </CardContent>
      </Card>

      {/* Sticky Bottom Action & Total Price Bar — sits above the mobile bottom nav
          (bottom-nav is z-nav/40, fixed bottom-0) rather than underneath it, otherwise
          the nav bar silently eats the first tap on this button on mobile. */}
      <div className="fixed bottom-[calc(var(--bottom-nav-height)_+_env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-overlay bg-card/95 backdrop-blur-md border-t border-border/80 p-4 shadow-overlay">
        <div className="max-w-content mx-auto flex items-center justify-between gap-4">
          <div>
            <span className="text-caption text-text-secondary block truncate max-w-[200px] sm:max-w-none">
              {formatSessionDate(selectedDate)} • {formatTime(selectedTime)} • {durationHours} hr
            </span>
            <div className="font-heading text-h1 font-bold text-text-primary">
              <span className="rupee-symbol">₹</span>{finalTotal}
            </div>
          </div>

          <motion.button
            type="button"
            onClick={handleCheckout}
            whileTap={{ scale: 0.96 }}
            disabled={
              isProcessing ||
              Boolean(cafe.isEmergencyMode) ||
              Boolean(cafe.bookingsPaused) ||
              windowRemainingSeats < seatsCount
            }
            className="rounded-2xl bg-secondary px-8 sm:px-10 py-3.5 font-heading text-btn font-bold text-white shadow-float hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isProcessing
              ? 'Processing...'
              : cafe.isEmergencyMode
              ? 'Emergency Mode Active'
              : cafe.bookingsPaused
              ? 'Bookings Paused'
              : windowRemainingSeats === 0
              ? 'Sold Out'
              : windowRemainingSeats < seatsCount
              ? `Only ${windowRemainingSeats} Seat${windowRemainingSeats > 1 ? 's' : ''} Left`
              : 'Continue to Payment'}
          </motion.button>
        </div>
      </div>
    </div>

      {/* Mock Payment Modal for Sandbox Mode */}
      <MockPaymentModal
        isOpen={mockModalState?.isOpen || false}
        orderId={mockModalState?.orderId || ''}
        amount={mockModalState?.amount || 0}
        onSuccess={mockModalState?.onSuccess || (() => {})}
        onFailure={mockModalState?.onFailure || (() => {})}
        onClose={mockModalState?.onClose || (() => {})}
      />
    </>
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

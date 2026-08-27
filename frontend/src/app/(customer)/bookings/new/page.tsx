'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  Minus,
  Plus,
  User,
  ShieldCheck,
  Loader2,
  Monitor,
  CheckCircle,
  Tag,
} from 'lucide-react';
import { getCafe, getCafeAvailability } from '@/lib/api/cafes';
import { createBooking } from '@/lib/api/bookings';
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments';
import { queryKeys } from '@/hooks/queries/keys';
import { useRazorpay } from '@/hooks/useRazorpay';
import { MockPaymentModal } from '@/components/MockPaymentModal';
import { useAuthStore } from '@/store/authStore';
import { Card, CardContent, Skeleton, ErrorState } from '@/components/ui';
import { LoginRequiredDialog } from '@/components/auth/LoginRequiredDialog';
import { saveBookingIntent } from '@/lib/bookingIntent';
import { TimelineRangePicker } from '@/components/customer/TimelineRangePicker';
import {
  getNext14Days,
  formatDateStrip,
  formatSessionDate,
  formatTime,
  getTodayString,
  timeToMinutes,
  minutesToTimeAndDayOffset,
  addDaysToDateString,
  calculateWindowRemainingSeats,
} from '@/lib/format';

function BookingWizardContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const cafeId = searchParams.get('cafeId') || '';
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { displayRazorpay, mockModalState } = useRazorpay();

  const availableDates = getNext14Days();
  const [selectedDate, setSelectedDate] = useState(searchParams.get('date') || availableDates[0] || getTodayString());

  // Dynamically compute a valid initial start time (at least current time +
  // 30 mins). When "now + 35 mins, rounded up to the next 30-min mark"
  // overflows past midnight (e.g. it's 23:35), the computed time wraps to
  // the small hours (e.g. "00:00:00") — that slot belongs to *tomorrow*,
  // not `selectedDate`. dayOffset carries that rollover so callers can
  // advance the effective session date instead of losing it (see
  // effectiveSessionDate below).
  const getInitialValidTimeAndOffset = () => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const validMin = Math.ceil((nowMin + 35) / 30) * 30;
    return minutesToTimeAndDayOffset(validMin);
  };

  const initialValid = getInitialValidTimeAndOffset();
  const [selectedTime, setSelectedTime] = useState(searchParams.get('time') || initialValid.time);
  // How many calendar days past `selectedDate` the current `selectedTime`
  // actually falls on (0 = same day, 1 = the overnight tail past
  // midnight). The value ACTUALLY submitted to the backend and shown to the
  // user is `addDaysToDateString(selectedDate, selectedDateOffset)` — see
  // effectiveSessionDate below.
  //
  // Deliberately NOT seeded from `initialValid.dayOffset`: that guess comes
  // from the wall clock alone, with no knowledge of the café's actual
  // opening/closing hours, so it cannot tell "past midnight, overnight
  // venue" apart from "past midnight, venue that's simply closed right
  // now." Seeding it from the clock let a non-overnight café (e.g.
  // 10:00-23:00) opened at 23:35 get stuck at dayOffset=1 with no later
  // branch able to correct it — see the café-aware auto-select effect
  // below, which is the only thing allowed to set this once real café
  // hours are known. It starts at 0 (same day) and, until that effect
  // runs, a stale initial time guess simply fails the backend's lead-time
  // check the same way it did before this feature existed, instead of
  // silently mis-dating the booking.
  //
  // Restored from the URL on a login round-trip so it stays coherent with
  // `time`/`date` there too — clamped to [0, 1] since it's untrusted input
  // (a crafted `?dayOffset=45` must not be able to shift the submitted
  // sessionDate 45 days out).
  const [selectedDateOffset, setSelectedDateOffset] = useState(() => {
    if (!searchParams.get('time')) return 0;
    const parsed = parseInt(searchParams.get('dayOffset') || '0', 10);
    const safe = Number.isFinite(parsed) ? parsed : 0;
    return Math.min(1, Math.max(0, safe));
  });
  const [durationHours, setDurationHours] = useState(() => {
    const d = parseFloat(searchParams.get('duration') || '');
    return Number.isFinite(d) && d > 0 ? d : 2;
  });
  const [seatsCount, setSeatsCount] = useState(() => {
    const s = parseInt(searchParams.get('seats') || '', 10);
    return Number.isFinite(s) && s > 0 ? s : 1;
  });
  // Selections restore from the URL so a login redirect mid-flow (an
  // unauthenticated visitor tapping "Continue to Payment") lands the user
  // back on exactly what they'd picked, not a blank wizard. Tier is kept as
  // just an id (not the resolved object) so the restored selection is valid
  // synchronously on mount — no separate effect has to wait for the café's
  // tiers to load and race against the URL-sync effect below.
  const [selectedTierId, setSelectedTierId] = useState<string | null>(searchParams.get('tierId'));

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const { data: cafe, isLoading, isError, error: fetchError } = useQuery({
    queryKey: queryKeys.cafes.detail(cafeId),
    queryFn: () => getCafe(cafeId).then((res) => res.cafe),
    enabled: Boolean(cafeId),
    staleTime: 2_000,
    refetchInterval: 4_000,
  });

  const activeTier =
    (cafe?.tiers && selectedTierId ? cafe.tiers.find((t) => t.id === selectedTierId) : undefined) ||
    (cafe?.tiers && cafe.tiers[0] ? cafe.tiers[0] : null);

  // The calendar date actually submitted to the backend and shown to the
  // user — `selectedDate` advanced by `selectedDateOffset` when the chosen
  // start time is on the overnight tail past midnight. This must be used
  // for BOTH the createBooking() call and the sticky bottom bar summary so
  // what the user sees is exactly what gets sent (see handleCheckout below).
  const effectiveSessionDate = addDaysToDateString(selectedDate, selectedDateOffset);

  // Keep the URL in sync with the current selection so it survives a
  // redirect to /login and back (see AuthGuard / handleCheckout).
  useEffect(() => {
    if (!cafeId) return;
    const params = new URLSearchParams();
    params.set('cafeId', cafeId);
    params.set('date', selectedDate);
    params.set('time', selectedTime);
    params.set('dayOffset', String(selectedDateOffset));
    params.set('duration', String(durationHours));
    params.set('seats', String(seatsCount));
    if (activeTier?.id) params.set('tierId', activeTier.id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [cafeId, selectedDate, selectedTime, selectedDateOffset, durationHours, seatsCount, activeTier?.id, pathname, router]);

  const { data: availabilityData } = useQuery({
    queryKey: ['cafe-availability', cafeId, activeTier?.id, selectedDate],
    queryFn: () => getCafeAvailability(cafeId, activeTier!.id, selectedDate),
    enabled: Boolean(cafeId && activeTier?.id && selectedDate),
    staleTime: 2_000,
    refetchInterval: 3_000,
  });

  // Bookings that START after midnight are stored under `selectedDate + 1`
  // (the backend's /availability filters `Booking.session_date ==
  // parsed_date`), so the tail of the timeline past midnight is invisible
  // unless we also fetch tomorrow's availability and merge it in below.
  const nextDayDateStr = addDaysToDateString(selectedDate, 1);
  const { data: nextDayAvailabilityData } = useQuery({
    queryKey: ['cafe-availability', cafeId, activeTier?.id, nextDayDateStr],
    queryFn: () => getCafeAvailability(cafeId, activeTier!.id, nextDayDateStr),
    enabled: Boolean(cafeId && activeTier?.id && nextDayDateStr),
    staleTime: 2_000,
    refetchInterval: 3_000,
  });

  // Same-day slots plus tomorrow's slots shifted +1440 minutes so they land
  // in the picker's "minutes past midnight of the opening day" space (e.g. a
  // 00:30 booking stored under tomorrow becomes "24:30" here). Deliberately
  // NOT using minutesToTimeString for the shift — it wraps hours via `% 24`,
  // which would collapse the offset right back to a same-day-looking time.
  const mergedBookedSlots = useMemo(() => {
    const sameDay = availabilityData?.bookedSlots || [];
    const nextDay = (nextDayAvailabilityData?.bookedSlots || []).map((bs) => {
      const shiftedStart = timeToMinutes(bs.startTime) + 1440;
      const shiftedEnd = timeToMinutes(bs.endTime) + 1440;
      const toShiftedTimeStr = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
      return {
        ...bs,
        startTime: toShiftedTimeStr(shiftedStart),
        endTime: toShiftedTimeStr(shiftedEnd),
      };
    });
    return [...sameDay, ...nextDay];
  }, [availabilityData?.bookedSlots, nextDayAvailabilityData?.bookedSlots]);

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
      mergedBookedSlots,
      windowStart,
      windowEnd
    );
  }, [totalSeatsForTier, mergedBookedSlots, selectedTime, durationHours, cafe?.openingTime]);

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

  // Automatically find and select the first available time slot — but only
  // when the user's actual inputs (date/tier/seats) change, not on every
  // background availability poll (cafe/availabilityData refetch every few
  // seconds and get new object references each time even when the data is
  // unchanged, which would otherwise silently overwrite whatever slot the
  // user — or a restored URL, after a login redirect mid-wizard — already
  // has selected).
  const initialAutoSelectKey = useRef(
    searchParams.get('time')
      ? `${searchParams.get('date') || ''}|${searchParams.get('tierId') || ''}|${searchParams.get('seats') || ''}`
      : null
  );
  const lastAutoSelectKey = useRef<string | null>(initialAutoSelectKey.current);
  const userHasSelectedSlot = useRef(initialAutoSelectKey.current !== null);
  useEffect(() => {
    if (!cafe || !availabilityData) return;
    // Once the user has explicitly picked a slot (handleTimelineChange),
    // never let a later seatsCount/date/tier change silently re-run
    // auto-select and overwrite it — that was booking a different slot
    // than what the user saw on screen when they e.g. added a participant.
    // If the new seat count no longer fits the selected slot, the
    // availability check further down the component disables checkout
    // and explains why, instead of quietly picking a new time.
    if (userHasSelectedSlot.current) return;

    const key = `${selectedDate}|${activeTier?.id || ''}|${seatsCount}`;
    if (lastAutoSelectKey.current === key) return;
    lastAutoSelectKey.current = key;

    const openingStr = cafe.openingTime || '09:00:00';
    const closingStr = cafe.closingTime || '23:00:00';
    const openMin = timeToMinutes(openingStr);
    let closeMin = timeToMinutes(closingStr);
    if (closeMin <= openMin) closeMin += 1440;

    const totalSeats = availabilityData.appBookableSeats || activeTier?.totalSeats || 10;
    const bookedSlots = mergedBookedSlots;

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
        const { time, dayOffset } = minutesToTimeAndDayOffset(m);
        setSelectedTime(time);
        setSelectedDateOffset(dayOffset);
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
          const { time, dayOffset } = minutesToTimeAndDayOffset(m);
          setSelectedTime(time);
          setSelectedDateOffset(dayOffset);
          setDurationHours(1);
          foundFirstSlot = true;
          break;
        }
      }
    }

    if (!foundFirstSlot && minValidStart < closeMin) {
      const { time, dayOffset } = minutesToTimeAndDayOffset(minValidStart);
      setSelectedTime(time);
      setSelectedDateOffset(dayOffset);
    }
  }, [cafe, availabilityData, mergedBookedSlots, selectedDate, activeTier?.id, seatsCount]);

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

  // Price calculations — this is a checkout-time estimate only, the server
  // recomputes and is authoritative. Combined platform service fee (Razorpay's
  // real processing cost + KHEL-O's margin) must match backend Settings
  // RAZORPAY_COST_PERCENT + PLATFORM_MARGIN_PERCENT (2.65% + 1.20% today).
  // No separate flat convenience fee anymore.
  const pricePerHour = activeTier?.pricePerHour || 100;
  const baseTotal = Math.round(pricePerHour * durationHours * seatsCount);
  const SERVICE_FEE_PERCENT = 3.85;

  // Café-specific promotions are created by the owner (Owner → Promotional
  // Offers) and apply automatically at checkout — no code to type. Eligibility
  // is evaluated against the SELECTED slot (effectiveSessionDate +
  // selectedTime), not "now": a promo browsed at 2pm for an 8pm slot must
  // apply if 8pm is in its window, and vice versa. This mirrors
  // PromotionService._is_promotion_active in
  // backend/app/services/promotion_service.py exactly, including its Python
  // datetime.weekday() convention (Monday=0…Sunday=6) — JS Date.getDay() uses
  // Sunday=0…Saturday=6, hence the conversion below. The backend re-validates
  // and is authoritative; this is a checkout-time estimate so what's shown
  // here matches what Razorpay actually charges.
  const activePromo = activeTier?.activePromotion || null;
  let discountAmount = 0;
  let promoEligible = false;
  if (activePromo) {
    const slotDate = new Date(`${effectiveSessionDate}T${selectedTime}`);
    const validFrom = new Date(activePromo.validFrom);
    const validUntil = new Date(activePromo.validUntil);
    const pythonWeekday = (slotDate.getDay() + 6) % 7;
    const slotHour = parseInt(selectedTime.split(':')[0], 10);
    promoEligible =
      activePromo.isActive &&
      slotDate >= validFrom &&
      slotDate <= validUntil &&
      activePromo.daysOfWeek.includes(pythonWeekday) &&
      slotHour >= activePromo.startHour &&
      slotHour < activePromo.endHour &&
      (activePromo.maxUses == null || activePromo.currentUses < activePromo.maxUses);
    if (promoEligible) {
      discountAmount = Math.round(baseTotal * (activePromo.discountPercentage / 100) * 100) / 100;
    }
  }

  // Service fee applies to the POST-discount subtotal, matching
  // booking_service.py (gateway_fee is computed off `subtotal`, i.e.
  // base_amount - discount_amount, not off base_amount).
  const subtotal = baseTotal - discountAmount;
  const serviceFee = Math.round(subtotal * (SERVICE_FEE_PERCENT / 100) * 100) / 100;
  const finalTotal = subtotal + serviceFee;

  const handleTimelineChange = (newStartTime: string, newDurationHours: number, dayOffset: number) => {
    userHasSelectedSlot.current = true;
    setSelectedTime(newStartTime);
    setDurationHours(newDurationHours);
    setSelectedDateOffset(dayOffset);
  };

  const navigateToAuth = (target: '/login' | '/register') => {
    // Redirect URL construction is untouched from the original inline
    // redirect — it already mirrors date/tier/time/seats via the URL sync
    // effect above, so this round-trip continues to land back on the same
    // slot after login/register.
    const fullPath = `${pathname}?${searchParams.toString()}`;

    // Also persist to localStorage so the selection survives a crash (see
    // global-error.tsx) + reload, which would otherwise drop the ?redirect=
    // param entirely. This is navigation intent only — never a source of
    // truth for price/availability, which the backend always revalidates.
    saveBookingIntent({
      cafeId,
      sessionDate: effectiveSessionDate,
      startTime: selectedTime,
      durationHours,
      seatsCount,
      tierId: activeTier?.id,
      dayOffset: selectedDateOffset,
      returnPath: fullPath,
    });

    const url = `${target}?redirect=${encodeURIComponent(fullPath)}`;
    try {
      router.push(url);
    } catch {
      window.location.assign(url);
    }
  };

  const handleLoginFromPrompt = () => navigateToAuth('/login');
  const handleRegisterFromPrompt = () => navigateToAuth('/register');

  const handleCheckout = async () => {
    if (!activeTier) {
      setError('Please select a hardware tier to proceed.');
      return;
    }
    if (isProcessing) return;

    // Browsing and slot selection are public; login is only required at
    // the point of payment. Rather than silently redirecting, explain why
    // via LoginRequiredDialog — "Log in" there triggers the actual redirect
    // (handleLoginFromPrompt below), which still preserves the current
    // selection exactly as before via the URL sync effect above.
    if (!isAuthenticated) {
      setError(null);
      setShowLoginPrompt(true);
      return;
    }

    setError(null);
    setIsProcessing(true);

    try {
      // Step 1: Create booking
      const bookingRes = await createBooking({
        cafeId: cafe.id,
        hardwareTierId: activeTier.id,
        sessionDate: effectiveSessionDate,
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
                onClick={() => {
                  setSelectedDate(dateStr);
                  // A freshly picked calendar day always starts as "same
                  // day" until the café-aware auto-select effect (keyed on
                  // selectedDate) re-evaluates real availability and hours;
                  // otherwise the sticky bar can show yesterday's leftover
                  // +1-day offset for a moment during the refetch.
                  setSelectedDateOffset(0);
                }}
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
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => setSelectedTierId(tier.id)}
                  className={`p-4 rounded-3xl text-left transition-all active:scale-[0.97] flex flex-col justify-between border ${
                    isSelected
                      ? 'border-accent bg-accent/5 ring-2 ring-accent/60 shadow-card'
                      : 'border-border/80 bg-card hover:bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-heading text-h3 font-bold text-text-primary">{tier.name}</h4>
                      <p className="text-caption text-text-secondary mt-0.5">
                        {tier.specs?.gpu
                          ? `${tier.specs.gpu}${tier.specs?.ram ? ` • ${tier.specs.ram}` : ''}`
                          : tier.specs?.console || tier.specs?.other || tier.model || 'Gaming Station'}
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
                </button>
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
          bookedSlots={mergedBookedSlots}
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
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center font-heading text-body font-bold">{seatsCount}</span>
          <button
            type="button"
            onClick={() => setSeatsCount((s) => Math.min(windowRemainingSeats, 6, s + 1))}
            disabled={seatsCount >= windowRemainingSeats || seatsCount >= 6}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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

          {discountAmount > 0 && activePromo && (
            <div className="flex items-center justify-between text-success">
              <span className="flex items-center gap-1.5 font-semibold">
                <Tag className="h-4 w-4 flex-shrink-0" />
                {activePromo.title} (-{activePromo.discountPercentage}%)
              </span>
              <span className="font-body font-bold text-body">
                -<span className="rupee-symbol">₹</span>{discountAmount.toFixed(2)}
              </span>
            </div>
          )}

          {activePromo && !promoEligible && (
            <p className="text-xs text-text-tertiary flex items-start gap-1.5">
              <Tag className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <span>
                {activePromo.title} available {activePromo.daysOfWeek.length === 7 ? 'every day' : 'on select days'}, {activePromo.startHour}:00–{activePromo.endHour}:00 — pick a slot in that window to apply it.
              </span>
            </p>
          )}

          <div className="flex items-center justify-between">
            <span>Platform service fee ({SERVICE_FEE_PERCENT}%)</span>
            <span className="font-body font-semibold text-text-primary text-body"><span className="rupee-symbol">₹</span>{serviceFee.toFixed(2)}</span>
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
              {formatSessionDate(effectiveSessionDate)} • {formatTime(selectedTime)} • {durationHours} hr
            </span>
            <div className="font-heading text-h1 font-bold text-text-primary">
              <span className="rupee-symbol">₹</span>{finalTotal}
            </div>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={
              isProcessing ||
              Boolean(cafe.isEmergencyMode) ||
              Boolean(cafe.bookingsPaused) ||
              windowRemainingSeats < seatsCount
            }
            className="rounded-2xl bg-secondary px-8 sm:px-10 py-3.5 font-heading text-btn font-bold text-white shadow-float hover:bg-secondary/90 active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
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
          </button>
        </div>
      </div>
    </div>

      {/* Login required prompt — shown instead of a silent redirect when an
          unauthenticated visitor taps "Continue to Payment". */}
      <LoginRequiredDialog
        isOpen={showLoginPrompt}
        onCancel={() => setShowLoginPrompt(false)}
        onLogin={handleLoginFromPrompt}
        onRegister={handleRegisterFromPrompt}
      />

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

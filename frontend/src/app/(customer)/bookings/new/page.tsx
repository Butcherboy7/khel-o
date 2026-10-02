'use client';

import { InfoTip } from '@/components/shared/InfoTip';
import { CUSTOMER_INFO } from '@/lib/customerGuideCopy';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { basePriceForMinutes } from '@/lib/pricing';
import { ActivitySpecLine, AboutThisSetup } from '@/components/customer/ActivitySpecs';
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronDown,
  Minus,
  Plus,
  Users,
  ShieldCheck,
  Monitor,
  Tag,
  PauseCircle,
  Gamepad2,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { getCafe, getCafeAvailability } from '@/lib/api/cafes';
import { fireAnalyticsEvent } from '@/lib/api/analyticsEvents';
import { listBookings, createBooking, getBookingQuote, getPlatformFeePercentage } from '@/lib/api/bookings';
import { createPaymentOrder, verifyPayment } from '@/lib/api/payments';
import { queryKeys } from '@/hooks/queries/keys';
import { useRazorpay } from '@/hooks/useRazorpay';
import { MockPaymentModal } from '@/components/MockPaymentModal';
import { useAuthStore } from '@/store/authStore';
import { Skeleton, ErrorState } from '@/components/ui';
import { LoginRequiredDialog } from '@/components/auth/LoginRequiredDialog';
import { saveBookingIntent } from '@/lib/bookingIntent';
import { TimelineRangePicker } from '@/components/customer/TimelineRangePicker';
import { OffersPanel } from '@/components/customer/OffersPanel';
import { useCampaign } from '@/hooks/useCampaign';
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
  // People playing (the Players stepper). How many consoles that holds is
  // `consolesCount` below: 1 in co-op, one each otherwise.
  const [seatsCount, setSeatsCount] = useState(() => {
    const s = parseInt(searchParams.get('seats') || '', 10);
    return Number.isFinite(s) && s > 0 ? s : 1;
  });
  const [coopChosen, setCoopChosen] = useState(() => searchParams.get('coop') === '1');
  const [showCoopNotice, setShowCoopNotice] = useState(false);
  const initialDurationParam = useRef(searchParams.get('duration'));
  const durationDefaultedFor = useRef<string | null>(null);
  // Selections restore from the URL so a login redirect mid-flow (an
  // unauthenticated visitor tapping "Continue to Payment") lands the user
  // back on exactly what they'd picked, not a blank wizard. Tier is kept as
  // just an id (not the resolved object) so the restored selection is valid
  // synchronously on mount — no separate effect has to wait for the café's
  // tiers to load and race against the URL-sync effect below.
  const [selectedTierId, setSelectedTierId] = useState<string | null>(searchParams.get('tierId'));

  const [selectedGame, setSelectedGame] = useState('');

  // Offers apply on their own: the server picks the best one for the slot
  // (see the quote query below). These two only record an explicit choice: a
  // tapped offer, or a KHELO code typed in / carried by the /redeem QR link
  // (?promoCode=...). A code is just another way to pick an offer, so
  // choosing one clears the other.
  const [chosenOfferId, setChosenOfferId] = useState<string | null>(null);
  const [appliedCode, setAppliedCode] = useState<string | null>(
    () => (searchParams.get('promoCode') || '').toUpperCase() || null,
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [showTierSwitcher, setShowTierSwitcher] = useState(false);
  const [showTrustDetails, setShowTrustDetails] = useState(false);

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

  // Super Admin-controlled rate (Admin → Platform Settings) — this is a
  // checkout-time estimate only, the server recomputes and charges the
  // authoritative amount using whatever rate is live at booking-creation
  // time. Falls back to today's known rate while the request is in flight
  // so the summary doesn't flash a $0 fee on first paint.
  // Anyone who has booked before has used the time slider, so its one-time
  // coachmark is skipped for them (shares the My Bookings cache entry).
  const { data: pastBookings } = useQuery({
    queryKey: queryKeys.bookings.list({ limit: 1 }),
    queryFn: () => listBookings({ limit: 1 }),
    enabled: isAuthenticated,
    staleTime: 5 * 60_000,
  });
  const hasBookedBefore = (pastBookings?.items?.length ?? 0) > 0;

  const { data: platformFeeData } = useQuery({
    queryKey: ['platform-fee-percentage'],
    queryFn: getPlatformFeePercentage,
    staleTime: 60_000,
  });
  const SERVICE_FEE_PERCENT = platformFeeData?.platformFeePercentage ?? 4;

  const handleApplyCode = (code: string) => {
    codeClearedByUser.current = false;
    setChosenOfferId(null);
    setAppliedCode(code);
  };
  const handleClearCode = () => {
    codeClearedByUser.current = true;
    setAppliedCode(null);
  };
  const handleChooseOffer = (offerId: string) => setChosenOfferId(offerId);

  // A link-only campaign this visitor arrived with (or saved earlier) at this
  // café applies on its own: the code is carried even if the link was lost on
  // the way from the Instagram browser to a normal one.
  const campaign = useCampaign(cafeId);
  const codeClearedByUser = useRef(false);
  useEffect(() => {
    if (campaign.code && !appliedCode && !codeClearedByUser.current) setAppliedCode(campaign.code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.code]);

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
    if (coopChosen) params.set('coop', '1');
    // Fall back to selectedTierId (set synchronously from the URL on mount)
    // so this effect — which also runs while `cafe` is still loading and
    // `activeTier` is briefly undefined — never overwrites the URL with the
    // tierId momentarily missing, which would drop it on a reload/crash
    // during that window.
    const tierIdToPersist = activeTier?.id || selectedTierId;
    if (tierIdToPersist) params.set('tierId', tierIdToPersist);
    // Keep an applied offer code in the URL so it survives a reload, a login
    // round-trip, or reopening the link in another browser.
    if (appliedCode) params.set('promoCode', appliedCode);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [cafeId, selectedDate, selectedTime, selectedDateOffset, durationHours, seatsCount, coopChosen, activeTier?.id, selectedTierId, appliedCode, pathname, router]);

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

  // Co-op: friends share ONE console. Offered when the owner allows it and
  // the group fits on one; forced when there aren't enough free consoles
  // for everyone to have their own.
  const coopMax = activeTier?.coopEnabled ? (activeTier.coopMaxPlayers ?? 2) : 0;
  const canCoop = seatsCount >= 2 && seatsCount <= coopMax;
  const canSeparate = seatsCount <= windowRemainingSeats;
  const isCoop = canCoop && (coopChosen || !canSeparate);
  const consolesCount = isCoop ? 1 : seatsCount;
  const maxPlayers = Math.min(6, Math.max(windowRemainingSeats, coopMax));
  const minDurationMin = Math.max(15, activeTier?.minBookingMinutes ?? 60);
  const durationStep = minDurationMin % 30 === 0 ? 30 : 15;
  const durationLabel = durationHours < 1 ? `${Math.round(durationHours * 60)} min` : `${durationHours} hr`;

  // Start on the setup's default length (owner-set) unless the URL already
  // carried one, and never below its minimum.
  useEffect(() => {
    if (!activeTier || durationDefaultedFor.current === activeTier.id) return;
    const firstTier = durationDefaultedFor.current === null;
    durationDefaultedFor.current = activeTier.id;
    const minH = minDurationMin / 60;
    if (!(firstTier && initialDurationParam.current) && activeTier.defaultBookingMinutes) {
      setDurationHours(Math.max(minH, activeTier.defaultBookingMinutes / 60));
    } else {
      setDurationHours((d) => Math.max(minH, d));
    }
  }, [activeTier, minDurationMin]);

  const chooseCoop = (next: boolean) => {
    if (next && !isCoop) setShowCoopNotice(true);
    if (!next) setShowCoopNotice(false);
    setCoopChosen(next);
  };
  useEffect(() => {
    if (!showCoopNotice) return;
    const t = setTimeout(() => setShowCoopNotice(false), 7000);
    return () => clearTimeout(t);
  }, [showCoopNotice]);

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

    const key = `${selectedDate}|${activeTier?.id || ''}|${consolesCount}`;
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
        if (occupied + consolesCount > totalSeats) {
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
          if (occupied + consolesCount > totalSeats) {
            isAvailable = false;
            break;
          }
        }

        if (isAvailable) {
          const { time, dayOffset } = minutesToTimeAndDayOffset(m);
          setSelectedTime(time);
          setSelectedDateOffset(dayOffset);
          setDurationHours((d) => Math.max(d, minDurationMin / 60, 1));
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
  }, [cafe, availabilityData, mergedBookedSlots, selectedDate, activeTier?.id, consolesCount, minDurationMin]);

  // The server's price for exactly this slot: base, offer, fee, total. Offers
  // are decided here and nowhere else, so what is shown is what is charged.
  // The previous answer stays on screen while a new one loads (no flicker),
  // and Pay waits for it so nobody pays a stale total.
  const quoteQuery = useQuery({
    queryKey: [
      'booking-quote',
      cafe?.id,
      activeTier?.id,
      effectiveSessionDate,
      selectedTime,
      durationHours,
      consolesCount,
      seatsCount,
      chosenOfferId,
      appliedCode,
    ],
    queryFn: () =>
      getBookingQuote({
        cafeId: cafe!.id,
        hardwareTierId: activeTier!.id,
        sessionDate: effectiveSessionDate,
        startTime: selectedTime,
        durationHours,
        seatsCount: consolesCount,
        playersCount: seatsCount,
        promotionId: chosenOfferId,
        promoCode: appliedCode,
      }),
    enabled: Boolean(cafe?.id && activeTier?.id && selectedTime),
    placeholderData: keepPreviousData,
    staleTime: 5_000,
    retry: false,
  });
  const quote = quoteQuery.data;
  const quoteSettling = quoteQuery.isFetching;

  // Fire once per (cafe, tier) selection, not on every render — this must
  // stay above the early returns below (rules of hooks: this component
  // returns early while isLoading/isError, so a hook placed after those
  // checks would be called conditionally).
  useEffect(() => {
    if (!activeTier) return;
    fireAnalyticsEvent('booking_flow_started', {
      cafeId,
      metadata: { tierId: activeTier.id },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cafeId, activeTier?.id]);

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
  // recomputes and is authoritative. SERVICE_FEE_PERCENT comes from the
  // Super Admin-controlled platform fee rate fetched above.
  const pricePerHour = activeTier?.pricePerHour || 100;
  // Hourly co-op rate, for the option label only (the total uses basePriceForMinutes).
  const coopRate = pricePerHour + Number(activeTier?.coopExtraPlayerPrice ?? 0) * (seatsCount - 1);
  // Same formula as the server (lib/pricing.ts), so a café's own 15/30-minute
  // prices show here exactly as they will be charged.
  const baseTotal = basePriceForMinutes(
    activeTier ?? { pricePerHour },
    Math.round(durationHours * 60),
    { players: seatsCount, isCoop, seats: consolesCount },
  );

  // Offers come from the server's quote (see above): this page does no
  // eligibility or discount maths of its own, so an offer can never show as
  // available and then not apply (or the other way round).
  const discountAmount = quote?.discountAmount ?? 0;

  // Service fee applies to the POST-discount subtotal, matching
  // booking_service.py (gateway_fee is computed off `subtotal`, i.e.
  // base_amount - discount_amount, not off base_amount).
  const subtotal = baseTotal - discountAmount;
  const serviceFee = quote ? quote.platformFee : Math.round(subtotal * (SERVICE_FEE_PERCENT / 100) * 100) / 100;
  const finalTotal = subtotal + serviceFee;

  // ₹187.2 -> "187.20", ₹180 -> "180": rupees with paise only when present.
  const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

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
      fireAnalyticsEvent('checkout_login_shown', { cafeId, metadata: { tierId: activeTier.id } });
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
        seatsCount: consolesCount,
        playersCount: seatsCount,
        // Exactly the offer the quote applied; the server still re-checks it
        // under a lock, so a sold-out offer is refused rather than charged.
        promotionId: quote?.appliedOffer?.id,
        promoCode: appliedCode ?? undefined,
        game: selectedGame || undefined,
      });

      const booking = bookingRes.booking;

      // Step 2: Create Razorpay Order
      const order = await createPaymentOrder(booking.id);

      // Step 3: Trigger Razorpay Checkout Modal
      const payMeta = { bookingId: booking.id, amount: order.amount };
      fireAnalyticsEvent('payment_opened', { cafeId, metadata: payMeta });
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
          fireAnalyticsEvent('payment_dismissed', { cafeId, metadata: payMeta });
          setIsProcessing(false);
          router.push(`/bookings/${booking.id}`);
        },
        onFailed: (reason) => {
          fireAnalyticsEvent('payment_failed', { cafeId, metadata: { ...payMeta, reason: reason.slice(0, 60) } });
        },
        handler: async (paymentResponse) => {
          try {
            await verifyPayment({
              razorpayOrderId: paymentResponse.razorpay_order_id,
              razorpayPaymentId: paymentResponse.razorpay_payment_id,
              razorpaySignature: paymentResponse.razorpay_signature,
            });
            fireAnalyticsEvent('booking_completed', { cafeId, metadata: payMeta });
            queryClient.invalidateQueries({ queryKey: ['cafe-availability'] });
            queryClient.invalidateQueries({ queryKey: queryKeys.cafes.detail(cafeId) });
            router.push(`/bookings/${booking.id}`);
          } catch (verifyErr: any) {
            fireAnalyticsEvent('payment_failed', { cafeId, metadata: { ...payMeta, reason: 'verification' } });
            setError(verifyErr?.message || 'Payment verification failed.');
            setIsProcessing(false);
          }
        },
      });
    } catch (err: any) {
      if (typeof err?.code === 'string' && err.code.startsWith('PROMOTION_')) {
        // The offer ended between the quote and Pay (e.g. the last spot went).
        // Re-price calmly instead of showing a raw error; nothing was charged.
        setChosenOfferId(null);
        setAppliedCode(null);
        queryClient.invalidateQueries({ queryKey: ['booking-quote'] });
        setError('That offer just ended, so the price has been updated. Check the new total and tap Pay again.');
      } else {
        setError(err?.message || 'Failed to create booking.');
      }
      setIsProcessing(false);
    }
  };

  return (
    <>
      {/* pb clears the fixed bar's own height (price + CTA stack into two
          rows on mobile, ~140px) PLUS the bottom-nav-height it sits above
          on mobile (the bar's own `bottom` offset) — 140 + 64 + safe-area
          margin — so page content, including the trust-details expansion,
          never sits underneath it. sm+ reverts to the shorter single-row
          bar with no bottom-nav beneath it. */}
      <div className="flex flex-col gap-3.5 max-w-2xl mx-auto pb-60 sm:pb-28">
      {/* Compact contextual header — replaces the global brand header once
          a customer is inside the booking flow. */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          aria-label="Back"
          className="flex h-11 w-11 -m-1 flex-shrink-0 items-center justify-center rounded-full bg-surface text-secondary hover:bg-border/60 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-h3 font-bold text-text-primary truncate">{cafe.name}</h1>
          <p className="text-caption text-text-secondary truncate">{cafe.city}, {cafe.state}</p>
        </div>
      </div>

      {/* Tier switcher — the tier itself is picked on the café page (one
          fewer full step here, no re-reading the same specs twice); this
          chip is only for the rarer case of changing your mind, and doing
          it in place keeps the date/time/seats already chosen below. */}
      {cafe.tiers && cafe.tiers.length > 0 && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTierSwitcher((v) => !v)}
            className="flex w-full items-center justify-between gap-2 p-3 rounded-2xl bg-surface border border-border/60 text-left"
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex items-center gap-2 min-w-0">
                <Monitor className="h-4 w-4 text-accent flex-shrink-0" />
                <span className="font-heading text-body font-bold text-text-primary truncate">
                  {activeTier?.name || 'Select hardware'}
                </span>
                {activeTier && (
                  <span className="text-caption text-text-secondary flex-shrink-0">
                    <span className="rupee-symbol">₹</span>{activeTier.pricePerHour}/hr
                  </span>
                )}
              </span>
              {activeTier && <ActivitySpecLine tier={activeTier} className="pl-6" />}
            </span>
            <span className="text-caption font-semibold text-primary flex-shrink-0">
              {showTierSwitcher ? 'Close' : 'Change'}
            </span>
          </button>

          {showTierSwitcher && (
            <div className="mt-2 flex flex-col gap-2 p-2 rounded-2xl bg-card border border-border/80 shadow-card">
              {cafe.tiers.map((tier) => (
                <button
                  key={tier.id}
                  type="button"
                  onClick={() => {
                    setSelectedTierId(tier.id);
                    setShowTierSwitcher(false);
                  }}
                  className={`flex items-center justify-between gap-2 p-3 rounded-xl text-left transition-colors ${
                    activeTier?.id === tier.id ? 'bg-accent/10 border border-accent/40' : 'hover:bg-surface border border-transparent'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block font-heading text-body font-bold text-text-primary truncate">{tier.name}</span>
                    <ActivitySpecLine tier={tier} />
                    <span className="block text-caption text-text-secondary">
                      {tier.appBookableSeats !== undefined ? tier.appBookableSeats : (tier.totalSeats || 10)} app seats ({tier.totalSeats || 10} total)
                    </span>
                  </span>
                  <span className="font-data text-body-emphasis font-bold text-text-primary flex-shrink-0">
                    <span className="rupee-symbol">₹</span>{tier.pricePerHour}<span className="text-caption font-normal text-text-secondary">/hr</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTier && <AboutThisSetup tier={activeTier} />}

      {(cafe.isEmergencyMode || cafe.bookingsPaused || cafe.bookableStations === 0 || availabilityData?.appBookableSeats === 0) && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-600 font-medium text-caption flex items-center gap-3 shadow-card">
          <div className="h-10 w-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center flex-shrink-0">
            <PauseCircle className="h-5 w-5" strokeWidth={2.25} aria-hidden="true" />
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

      {/* Date — compact strip, no instructional heading; the layout order
          (tier → date → time → players → price) already communicates the
          sequence. */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
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
              className={`flex flex-col items-center justify-center h-14 w-12 rounded-xl flex-shrink-0 transition-all ${
                isSelected
                  ? 'bg-secondary text-white shadow-float font-bold'
                  : 'bg-card text-text-primary border border-border/80 hover:bg-surface'
              }`}
            >
              <span className="text-[10px] font-semibold leading-none">{day}</span>
              <span className="text-body font-heading font-bold leading-none mt-1">{date}</span>
            </button>
          );
        })}
      </div>

      {/* Walk-in-only notice for the selected tier specifically (the card-level
          version above covers the whole café; a single paused tier needs its
          own callout since the tier switcher no longer shows this inline). */}
      {activeTier && !cafe.isEmergencyMode && !cafe.bookingsPaused && cafe.bookableStations !== 0 && activeTier.appBookableSeats === 0 && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-caption font-semibold text-amber-600">
          {activeTier.name} is walk-ins only right now — pick a different tier above, or visit in person.
        </div>
      )}

      {/* Time + duration + availability — one unified component (the
          Playo-style drag slider already combines all of these). */}
      <TimelineRangePicker
        openingTime={cafe.openingTime || '09:00:00'}
        closingTime={cafe.closingTime || '23:00:00'}
        selectedDate={selectedDate}
        startTime={selectedTime}
        durationHours={durationHours}
        onChange={handleTimelineChange}
        bookedSlots={mergedBookedSlots}
        totalSeats={totalSeatsForTier}
        requestedSeats={consolesCount}
        remainingSeats={windowRemainingSeats}
        skipCoachmark={hasBookedBefore}
        minDurationMinutes={minDurationMin}
        stepMinutes={durationStep}
      />

      {/* Players — compact horizontal row. Renamed from "Seats": this count
          is how many people are using the tier's gaming capacity, not a
          specific physical seat assignment. */}
      <div className="relative p-3.5 rounded-2xl bg-card border border-border/80">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="font-heading text-body font-bold text-text-primary flex items-center gap-1.5">
            <Users className="h-4 w-4 text-primary flex-shrink-0" />
            Players
            {coopMax > 0 && <InfoTip quiet text={CUSTOMER_INFO.coop} label="What is co-op?" />}
          </span>
          <p className="text-caption text-text-secondary truncate">How many people are playing?</p>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => setSeatsCount((s) => Math.max(1, s - 1))}
            aria-label="Decrease players"
            className="flex h-11 w-11 -m-1 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center font-heading text-body font-bold">{seatsCount}</span>
          <button
            type="button"
            onClick={() => setSeatsCount((s) => Math.min(maxPlayers, s + 1))}
            disabled={seatsCount >= maxPlayers}
            aria-label="Increase players"
            className="flex h-11 w-11 -m-1 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

        {/* Co-op vs own consoles — lives inside the Players card and only
            appears when there's a real choice to make (2+ players on a
            setup whose owner allows sharing). */}
        {canCoop && (
          <div role="radiogroup" aria-label="How you'll play" className="mt-3 grid grid-cols-2 gap-2 border-t border-border/70 pt-3">
            {([
              { coop: true, title: 'Co-op', sub: `1 console · ₹${Math.round(coopRate)}/hr`, off: false, why: '' },
              { coop: false, title: 'Own consoles', sub: `${seatsCount} consoles · ₹${Math.round(pricePerHour * seatsCount)}/hr`, off: !canSeparate, why: `Only ${windowRemainingSeats} free now` },
            ] as const).map((o) => {
              const on = o.coop === isCoop;
              return (
                <button
                  key={o.title}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  disabled={o.off}
                  onClick={() => chooseCoop(o.coop)}
                  className={cn(
                    'min-w-0 rounded-xl border-[1.5px] px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    on ? 'border-primary bg-primary/[0.06]' : 'border-border bg-card hover:border-text-secondary/40',
                    o.off && 'cursor-not-allowed opacity-50'
                  )}
                >
                  <span className={cn('block font-heading text-body font-bold', on ? 'text-primary-dark' : 'text-text-primary')}>{o.title}</span>
                  <span className="block truncate text-caption text-text-secondary">{o.off ? o.why : o.sub}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* One-time heads-up when co-op is picked. Floats over the card's top
            edge instead of pushing the layout, and leaves on its own. */}
        {showCoopNotice && isCoop && (
          <div
            role="status"
            className="absolute inset-x-3 bottom-full z-20 mb-2 flex items-start gap-2 rounded-xl bg-secondary px-3 py-2.5 text-caption text-white shadow-float motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1"
          >
            <Gamepad2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
            <p className="min-w-0 flex-1 leading-snug">{CUSTOMER_INFO.coopNotice}</p>
            <button type="button" onClick={() => setShowCoopNotice(false)} className="flex-shrink-0 rounded-md px-1.5 py-0.5 font-semibold text-white/90 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              Got it
            </button>
            <span className="absolute left-8 top-full border-[6px] border-transparent border-t-secondary" aria-hidden />
          </div>
        )}
      </div>

      {/* Price summary — sits directly under Players so the whole decision
          (tier, date, slot, players, what it costs) resolves in the first
          viewport. The two optional inputs below it are deliberately the
          first thing you scroll to, not something you scroll past. Total is
          repeated on the fixed payment bar. */}
      <div className="p-3.5 rounded-2xl bg-card border border-border/80 flex flex-col gap-1.5 text-caption text-text-secondary">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate">
            {activeTier?.name || 'Standard'} · {durationLabel} · {seatsCount} player{seatsCount > 1 ? 's' : ''}
            {isCoop && ' · co-op'}
          </span>
          <span className="flex-shrink-0 font-semibold text-text-primary"><span className="rupee-symbol">₹</span>{money(baseTotal)}</span>
        </div>

        {discountAmount > 0 && quote?.appliedOffer && (
          <div className="flex items-center justify-between gap-3 text-success">
            <span className="min-w-0 flex items-center gap-1.5 font-semibold">
              <Tag className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{quote.appliedOffer.title} ({quote.appliedOffer.label})</span>
            </span>
            <span className="flex-shrink-0 font-bold">
              -<span className="rupee-symbol">₹</span>{discountAmount.toFixed(2)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-0.5">
            Platform Fee
            <InfoTip quiet text={CUSTOMER_INFO.platformFee} label="What is the platform fee?" />
          </span>
          <span className="font-semibold text-text-primary"><span className="rupee-symbol">₹</span>{serviceFee.toFixed(2)}</span>
        </div>

        <div className="flex items-center justify-between pt-1.5 mt-0.5 border-t border-border/60">
          <span className="font-heading font-bold text-text-primary">Total</span>
          <span className="font-heading font-bold text-body-emphasis text-text-primary"><span className="rupee-symbol">₹</span>{money(finalTotal)}</span>
        </div>
        <p className="flex items-center gap-1.5 pt-1 text-[11px] text-text-secondary">
          <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-success" aria-hidden />
          Secured by Razorpay · UPI, cards &amp; wallets · Instant confirmation
        </p>
      </div>

      {/* Offers: applied automatically by the server; tap to switch, or enter a
          code. Sits directly under the price it changes. */}
      <OffersPanel
        quote={quote}
        loading={quoteQuery.isLoading}
        appliedCode={appliedCode}
        onChooseOffer={handleChooseOffer}
        onMakeLength={(minutes) => {
          userHasSelectedSlot.current = true;
          setDurationHours(minutes / 60);
        }}
        onApplyCode={handleApplyCode}
        onClearCode={handleClearCode}
      />

      {/* Game — free-text combobox: types any name, datalist merely suggests
          from this café's supportedGames. */}
      <div className="p-3.5 rounded-2xl bg-card border border-border/80">
        <label className="text-caption font-semibold text-text-secondary mb-1 block">
          What are you playing? (optional)
        </label>
        <input
          type="text"
          list="cafe-games"
          value={selectedGame}
          onChange={(e) => setSelectedGame(e.target.value)}
          placeholder="Type any game name"
          className="w-full rounded-xl border border-border bg-surface px-3 py-2.5 text-body text-text-primary"
        />
        <datalist id="cafe-games">
          {Object.values(cafe?.supportedGames ?? {})
            .flat()
            .map((g) => (
              <option key={g} value={g} />
            ))}
        </datalist>
      </div>

      {/* Security / cancellation — collapsed to one line; tap to expand the
          full reassurance copy instead of always showing it. */}
      <div className="rounded-2xl bg-surface/60 border border-border/50">
        <button
          type="button"
          onClick={() => setShowTrustDetails((v) => !v)}
          className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left"
        >
          <ShieldCheck className="h-4 w-4 text-success flex-shrink-0" />
          <span className="min-w-0 flex-1 truncate text-caption font-medium text-text-secondary">
            Secure via Razorpay · Free cancellation ≤2 hrs
          </span>
          <ChevronDown className={`h-4 w-4 flex-shrink-0 text-text-secondary transition-transform ${showTrustDetails ? 'rotate-180' : ''}`} />
        </button>
        {showTrustDetails && (
          <div className="px-3.5 pb-3 flex flex-col gap-1.5 text-xs text-text-secondary">
            <p>Payments secured by Razorpay — your card and UPI details are never stored by KHEL-O.</p>
            <p>Free cancellation up to 2 hours before your session — full refund to your original payment method.</p>
            <p>
              <a href="/refund-policy" target="_blank" className="font-semibold text-primary hover:underline">
                Read the refund policy
              </a>
            </p>
          </div>
        )}
      </div>

      {/* Sticky Bottom Action & Total Price Bar — sits above the mobile bottom nav
          (bottom-nav is z-nav/40, fixed bottom-0) rather than underneath it, otherwise
          the nav bar silently eats the first tap on this button on mobile. */}
      <div className="action-bar-fixed fixed bottom-[calc(var(--bottom-nav-height)_+_env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 z-overlay bg-card border-t border-border px-4 py-3 shadow-overlay">
        {/* Compact on purpose: the total, what it's made of, and the pay
            button in one row, so the slider above keeps the screen. The
            Razorpay line lives in the price summary above, not here. */}
        <div className="max-w-content mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-heading text-h2 font-bold leading-tight text-text-primary">
              <span className="rupee-symbol">₹</span>{money(finalTotal)}
            </div>
            <span className="block truncate text-caption text-text-secondary">
              ₹{money(subtotal)} session + ₹{money(serviceFee)} platform fee
            </span>
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={
              isProcessing ||
              quoteSettling ||
              Boolean(cafe.isEmergencyMode) ||
              Boolean(cafe.bookingsPaused) ||
              windowRemainingSeats < consolesCount
            }
            className="flex-shrink-0 min-h-btn rounded-2xl bg-primary px-6 py-3 font-heading text-btn font-bold text-white shadow-float hover:bg-primary-dark active:scale-[0.96] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {isProcessing
              ? 'Processing...'
              : cafe.isEmergencyMode
              ? 'Emergency Mode Active'
              : cafe.bookingsPaused
              ? 'Bookings Paused'
              : windowRemainingSeats === 0
              ? 'Sold Out'
              : windowRemainingSeats < consolesCount
              ? `Only ${windowRemainingSeats} Seat${windowRemainingSeats > 1 ? 's' : ''} Left`
              : `Pay ₹${money(finalTotal)}`}
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
        <div className="flex flex-col gap-6 max-w-2xl mx-auto py-6" aria-busy="true">
          <Skeleton className="h-8 w-48 rounded-xl" />
          <Skeleton className="h-24 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      }
    >
      <BookingWizardContent />
    </Suspense>
  );
}

'use client';

import { InfoTip } from '@/components/shared/InfoTip';
import { CUSTOMER_INFO } from '@/lib/customerGuideCopy';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { basePriceForMinutes } from '@/lib/pricing';
import { playersCapOf, unitNoun } from '@/lib/playerCap';
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
import { Skeleton, ErrorState, BottomSheet } from '@/components/ui';
import { CheckoutSignInSheet } from '@/components/auth/CheckoutSignInSheet';
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
  customerPrice,
} from '@/lib/format';
import { hourlyOffer } from '@/lib/offers';
import type { HardwareTier } from '@/types';

// The hourly price a setup is shown at: the same number its card on the café
// page shows (the live offer for one player, if any), so the price never
// jumps between the card that was tapped and this page.
const shownHourly = (t: Pick<HardwareTier, 'pricePerHour' | 'activePromotion'>) =>
  customerPrice(hourlyOffer(t.pricePerHour, t.activePromotion)?.price ?? t.pricePerHour);

// "Free cancel till 8:00 AM" (or "till Sun 8:00 AM" on another day): the last
// moment a full refund is possible, 2 hours before the start (the server's
// rule in booking_service). Null once that moment has passed.
function cancelByLabel(sessionDate: string, startTime: string): string | null {
  const [h, m] = startTime.split(':').map(Number);
  if (!Number.isFinite(h)) return null;
  const by = new Date(`${sessionDate}T00:00:00`);
  if (Number.isNaN(by.getTime())) return null;
  by.setHours(h, Number.isFinite(m) ? m : 0, 0, 0);
  by.setTime(by.getTime() - 2 * 60 * 60 * 1000);
  if (by.getTime() <= Date.now()) return null;
  const hour12 = ((by.getHours() + 11) % 12) + 1;
  const time = `${hour12}:${String(by.getMinutes()).padStart(2, '0')} ${by.getHours() < 12 ? 'AM' : 'PM'}`;
  const sameDay = by.toDateString() === new Date().toDateString();
  const day = sameDay ? '' : `${by.toLocaleDateString('en-IN', { weekday: 'short' })} `;
  return `Free cancel till ${day}${time}`;
}

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
    return Number.isFinite(d) && d > 0 ? d : 1;
  });
  // People playing (the Players stepper). How many consoles that holds is
  // `consolesCount` below: 1 in co-op, one each otherwise.
  const [seatsCount, setSeatsCount] = useState(() => {
    const s = parseInt(searchParams.get('seats') || '', 10);
    return Number.isFinite(s) && s > 0 ? s : 1;
  });
  // Tables, lanes and rooms: price is per unit, so group size is separate from
  // the unit count (`seatsCount`) and never changes the price.
  const [groupSize, setGroupSize] = useState(1);
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
  // Offers + code live in a sheet so the checkout itself fits one phone screen.
  const [offersOpen, setOffersOpen] = useState(false);
  const [gameOpen, setGameOpen] = useState(false);
  // While the game box has the keyboard up, the pay bar steps aside: on a
  // phone it would otherwise ride up with the keyboard and sit on the box.
  const [typingGame, setTypingGame] = useState(false);

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
  const isActivity = activeTier?.tierType === 'activity';
  const playersCap = isActivity ? playersCapOf(activeTier?.attributes) : null;
  const unit = unitNoun(activeTier?.taxonomyKey);
  const groupMax = playersCap ? playersCap * seatsCount : 0;
  const groupShown = playersCap ? Math.min(groupSize, groupMax) : null;
  const playersToSend = isActivity ? (groupShown ?? undefined) : seatsCount;
  const coopMax = activeTier?.coopEnabled ? (activeTier.coopMaxPlayers ?? 2) : 0;
  const canCoop = seatsCount >= 2 && seatsCount <= coopMax;
  const canSeparate = seatsCount <= windowRemainingSeats;
  const isCoop = canCoop && (coopChosen || !canSeparate);
  const consolesCount = isCoop ? 1 : seatsCount;
  const maxPlayers = isActivity ? Math.min(6, windowRemainingSeats) : Math.min(6, Math.max(windowRemainingSeats, coopMax));
  const minDurationMin = Math.max(15, activeTier?.minBookingMinutes ?? 60);
  // The owner's longest booking for this setup (8 hours when unset).
  const maxDurationMin = Math.max(minDurationMin, Math.min(480, activeTier?.maxBookingMinutes ?? 480));
  const durationStep = minDurationMin % 30 === 0 ? 30 : 15;
  // Today, after the last possible start (same rule as the time picker):
  // nothing can be booked, so say so instead of showing an impossible slot.
  const noTimeLeftToday = (() => {
    if (!cafe || selectedDate !== getTodayString()) return false;
    const open = timeToMinutes(cafe.openingTime || '09:00:00');
    let close = timeToMinutes(cafe.closingTime || '23:00:00');
    if (close <= open) close += 1440;
    const now = new Date();
    const earliest = Math.max(open, Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / durationStep) * durationStep);
    return close - earliest < minDurationMin;
  })();
  const durationLabel = durationHours < 1 ? `${Math.round(durationHours * 60)} min` : `${durationHours} hr`;

  // Start on the setup's default length (owner-set) unless the URL already
  // carried one, and never below its minimum.
  useEffect(() => {
    if (!activeTier || durationDefaultedFor.current === activeTier.id) return;
    const firstTier = durationDefaultedFor.current === null;
    durationDefaultedFor.current = activeTier.id;
    const minH = minDurationMin / 60;
    const maxH = maxDurationMin / 60;
    if (!(firstTier && initialDurationParam.current) && activeTier.defaultBookingMinutes) {
      setDurationHours(Math.min(maxH, Math.max(minH, activeTier.defaultBookingMinutes / 60)));
    } else {
      setDurationHours((d) => Math.min(maxH, Math.max(minH, d)));
    }
  }, [activeTier, minDurationMin, maxDurationMin]);

  // Never sit on a length past the setup's longest booking (a shared link,
  // an offer's suggested length, or switching to a setup with a lower limit).
  useEffect(() => {
    if (activeTier && durationHours * 60 > maxDurationMin) setDurationHours(maxDurationMin / 60);
  }, [activeTier, durationHours, maxDurationMin]);

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
  const leftTodayOnce = useRef(false);
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

    // Too late today for even the shortest session (e.g. 11 PM at an 11:30
    // close): open on tomorrow instead of offering a slot that can't be booked.
    // Only on first arrival; a customer who taps today gets told why below.
    if (!foundFirstSlot && selectedDate === today && closeMin - minValidStart < minDurationMin && !leftTodayOnce.current) {
      leftTodayOnce.current = true;
      setSelectedDate(addDaysToDateString(today, 1));
      setSelectedDateOffset(0);
      return;
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
      playersToSend,
      chosenOfferId,
      appliedCode,
      // Signed in or not changes the first-booking offer, so re-ask on login.
      user?.id ?? null,
    ],
    queryFn: () =>
      getBookingQuote({
        cafeId: cafe!.id,
        hardwareTierId: activeTier!.id,
        sessionDate: effectiveSessionDate,
        startTime: selectedTime,
        durationHours,
        seatsCount: consolesCount,
        playersCount: playersToSend,
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

  // Signed in from the sheet at Pay: carry on to payment once the price for
  // the signed-in customer is in. If signing in changed the total (the
  // first-booking offer), stop and show it instead of charging a number
  // they haven't seen. Refs, because the total and handleCheckout are only
  // worked out below the early returns.
  const payAfterSignIn = useRef<number | null>(null);
  const totalRef = useRef<number>(0);
  const checkoutRef = useRef<() => void>(() => {});
  const [signedInNote, setSignedInNote] = useState<string | null>(null);
  useEffect(() => {
    if (payAfterSignIn.current == null || !isAuthenticated || quoteSettling || !quote) return;
    const before = payAfterSignIn.current;
    payAfterSignIn.current = null;
    if (Math.abs(totalRef.current - before) < 0.01) {
      checkoutRef.current();
    } else {
      const now = totalRef.current;
      setSignedInNote(`You're signed in. Your total is now ₹${Number.isInteger(now) ? now : now.toFixed(2)}. Tap Pay to finish.`);
    }
  }, [isAuthenticated, quoteSettling, quote]);

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
  // KHEL-O's ₹1 off a round price (₹150 -> ₹149): folded into the session
  // line so the sum on screen adds up. KHEL-O pays the café the ₹1.
  const cafeSubtotal = baseTotal - discountAmount;
  const kheloDiscount = quote ? quote.kheloDiscount : cafeSubtotal - customerPrice(cafeSubtotal);
  const sessionLine = baseTotal - kheloDiscount;
  const subtotal = cafeSubtotal - kheloDiscount;
  const serviceFee = quote ? quote.platformFee : Math.round(subtotal * (SERVICE_FEE_PERCENT / 100) * 100) / 100;
  const finalTotal = quote ? quote.total : subtotal + serviceFee;
  // First booking (launch offer): the fee is waived. Shown struck through.
  const feeWaived = quote?.firstBookingOffer ? quote.platformFeeBeforeOffer : 0;
  // Whole rupees, rounded down: "You save ₹69", never paise, never more than is true.
  const youSave = Math.floor(discountAmount + feeWaived + 1e-6);

  const cancelBy = cancelByLabel(effectiveSessionDate, selectedTime);
  totalRef.current = finalTotal;

  // ₹187.2 -> "187.20", ₹180 -> "180": rupees with paise only when present.
  const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

  const handleTimelineChange = (newStartTime: string, newDurationHours: number, dayOffset: number, auto = false) => {
    if (!auto) userHasSelectedSlot.current = true;
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
    setSignedInNote(null);
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
        playersCount: playersToSend,
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
            // ?welcome=1 plays the one-time "you're in" moment on the pass.
            router.push(`/bookings/${booking.id}?welcome=1`);
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
  checkoutRef.current = handleCheckout;

  return (
    <>
      {/* One screen on an average phone (390x664): header, dates, the time +
          players card and the price card all sit above the pay bar, with no
          bottom nav on this page. pb clears the pay bar (~76px + safe area). */}
      <div className="flex flex-col gap-2 max-w-2xl mx-auto pb-28">
      {/* Header: back, the café, and the setup being booked as a chip. The
          setup is picked on the café page; the chip is for changing your
          mind here without losing the date and time already chosen. */}
      <div className="relative">
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="flex h-11 w-11 -ml-2 flex-shrink-0 items-center justify-center rounded-full text-secondary hover:bg-surface transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="font-heading text-body-emphasis font-bold leading-tight text-text-primary truncate">{cafe.name}</h1>
            <p className="text-caption text-text-secondary truncate">{cafe.addressLine2 || cafe.city}</p>
          </div>
          {activeTier && cafe.tiers && cafe.tiers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowTierSwitcher((v) => !v)}
              aria-expanded={showTierSwitcher}
              aria-label={`Setup: ${activeTier.name}, ₹${shownHourly(activeTier)} per hour. Change setup`}
              className="flex min-h-[44px] max-w-[55%] flex-shrink items-center gap-1.5 rounded-full border border-border/80 bg-card pl-3 pr-2 shadow-sm transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Monitor className="h-4 w-4 flex-shrink-0 text-accent" aria-hidden />
              <span className="min-w-0 truncate font-heading text-caption font-bold text-text-primary">{activeTier.name}</span>
              <span className="flex-shrink-0 text-caption text-text-secondary">
                <span className="rupee-symbol">₹</span>{shownHourly(activeTier)}/hr
              </span>
              <ChevronDown className={cn('h-4 w-4 flex-shrink-0 text-text-secondary transition-transform', showTierSwitcher && 'rotate-180')} aria-hidden />
            </button>
          )}
        </div>

        {showTierSwitcher && cafe.tiers && (
          <div className="absolute inset-x-0 top-full z-dropdown mt-2 flex flex-col gap-1.5 rounded-2xl border border-border/80 bg-card p-2 shadow-float">
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
                </span>
                <span className="font-data text-body-emphasis font-bold text-text-primary flex-shrink-0">
                  <span className="rupee-symbol">₹</span>{shownHourly(tier)}<span className="text-caption font-normal text-text-secondary">/hr</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

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

      {signedInNote && (
        <div role="status" className="rounded-2xl border border-success/25 bg-success/10 px-4 py-3 text-caption font-semibold text-emerald-700">
          {signedInNote}
        </div>
      )}

      {/* Date — compact strip, no instructional heading; the layout order
          (tier → date → time → players → price) already communicates the
          sequence. */}
      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
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
              className={`flex flex-col items-center justify-center h-12 w-12 rounded-xl flex-shrink-0 transition-all ${
                isSelected
                  ? 'bg-primary text-white shadow-float font-bold'
                  : 'bg-card text-text-primary border border-border/80 hover:bg-surface'
              }`}
            >
              <span className="text-[10px] font-semibold leading-none">{day}</span>
              <span className="text-body font-heading font-bold leading-none mt-0.5">{date}</span>
            </button>
          );
        })}
      </div>

      {noTimeLeftToday && (
        <p role="status" className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-caption font-semibold text-amber-700">
          No time left to book today. Pick another day above.
        </p>
      )}

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
        maxDurationMinutes={maxDurationMin}
        stepMinutes={durationStep}
      >
        {/* Players, inside the time card: how many people, and for 2+ on a
            shareable setup, co-op vs own consoles. */}
        {isActivity ? (
          <div className="flex flex-col divide-y divide-border/70">
            {windowRemainingSeats > 1 && (
              <div className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <span className="font-heading text-body font-bold text-text-primary">How many {unit.many}?</span>
                  <p className="truncate text-caption text-text-secondary">Price is per {unit.one} · {windowRemainingSeats} free</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setSeatsCount((s) => Math.max(1, s - 1))} disabled={seatsCount <= 1} aria-label={`Fewer ${unit.many}`} className="flex h-11 w-11 -my-1.5 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-7 text-center font-heading text-body font-bold">{seatsCount}</span>
                  <button type="button" onClick={() => setSeatsCount((s) => Math.min(maxPlayers, s + 1))} disabled={seatsCount >= maxPlayers} aria-label={`More ${unit.many}`} className="flex h-11 w-11 -my-1.5 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            {playersCap && groupShown !== null && (
              <div className="flex items-center justify-between gap-3 py-1.5">
                <div className="min-w-0">
                  <span className="font-heading text-body font-bold text-text-primary">Players</span>
                  <p className="truncate text-caption text-text-secondary">Up to {playersCap} per {unit.one}, same price</p>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setGroupSize(() => Math.max(1, groupShown - 1))} disabled={groupShown <= 1} aria-label="Decrease players" className="flex h-11 w-11 -my-1.5 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-7 text-center font-heading text-body font-bold">{groupShown}</span>
                  <button type="button" onClick={() => setGroupSize(() => Math.min(groupMax, groupShown + 1))} disabled={groupShown >= groupMax} aria-label="Increase players" className="flex h-11 w-11 -my-1.5 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="relative">
            <div className="flex items-center justify-between gap-3 py-1">
              <span className="flex items-center gap-1.5 font-heading text-body font-bold text-text-primary">
                <Users className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
                Players
                {coopMax > 0 && <InfoTip quiet text={CUSTOMER_INFO.coop} label="What is co-op?" />}
              </span>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button type="button" onClick={() => setSeatsCount((s) => Math.max(1, s - 1))} disabled={seatsCount <= 1} aria-label="Decrease players" className="flex h-11 w-11 -my-1.5 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-7 text-center font-heading text-body font-bold">{seatsCount}</span>
                <button type="button" onClick={() => setSeatsCount((s) => Math.min(maxPlayers, s + 1))} disabled={seatsCount >= maxPlayers} aria-label="Increase players" className="flex h-11 w-11 -my-1.5 items-center justify-center rounded-full bg-surface text-text-primary hover:bg-border/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
        {/* Co-op vs own consoles — lives inside the Players card and only
            appears when there's a real choice to make (2+ players on a
            setup whose owner allows sharing). */}
        {canCoop && (
          <div role="radiogroup" aria-label="How you'll play" className="mt-1.5 mb-1 grid grid-cols-2 gap-2">
            {([
              { coop: true, title: 'Co-op', sub: `1 console · ₹${customerPrice(Math.round(coopRate))}/hr`, off: false, why: '' },
              { coop: false, title: 'Own consoles', sub: `${seatsCount} consoles · ₹${customerPrice(Math.round(pricePerHour * seatsCount))}/hr`, off: !canSeparate, why: `Only ${windowRemainingSeats} free now` },
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
        )}
      </TimelineRangePicker>

      {/* Price: what it costs, the offer in use (tap to change or enter a
          code), the fee, and the total. Every amount sits in the right-hand
          column so the sum reads top to bottom. */}
      <div className="flex flex-col gap-1 rounded-2xl border border-border/80 bg-card p-3.5 text-caption text-text-secondary">
        <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate">
            {activeTier?.name || 'Standard'} · {durationLabel} ·{' '}
            {isActivity
              ? `${seatsCount} ${seatsCount > 1 ? unit.many : unit.one}${groupShown ? ` · ${groupShown} player${groupShown > 1 ? 's' : ''}` : ''}`
              : `${seatsCount} player${seatsCount > 1 ? 's' : ''}`}
            {isCoop && ' · co-op'}
          </span>
          <span className="flex-shrink-0 font-semibold text-text-primary"><span className="rupee-symbol">₹</span>{money(sessionLine)}</span>
        </div>

        {/* The offer line: what's applied, what's on offer, or the code link.
            One tap opens every offer for this slot and the code box. */}
        {discountAmount > 0 && quote?.appliedOffer ? (
          <button
            type="button"
            onClick={() => setOffersOpen(true)}
            className="-mx-1.5 flex min-h-[36px] items-center justify-between gap-3 rounded-lg bg-success/10 px-2 text-left text-emerald-700 transition-colors hover:bg-success/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span className="flex min-w-0 items-center gap-1.5 font-semibold">
              <Tag className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
              {/* Same words as the café page's offer line: "20% off · 1 player". */}
              <span className="truncate">
                {[
                  quote.appliedOffer.label,
                  quote.appliedOffer.playMode === 'solo' ? '1 player' : quote.appliedOffer.playMode === 'coop' ? '2 players' : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              <span className="flex-shrink-0 font-semibold text-primary-dark">Change</span>
            </span>
            <span className="flex-shrink-0 font-bold">
              −<span className="rupee-symbol">₹</span>{money(discountAmount)}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOffersOpen(true)}
            className="-mx-1.5 flex min-h-[36px] items-center gap-1.5 rounded-lg px-1.5 text-left font-semibold text-primary-dark transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Tag className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
            {(quote?.availableOffers?.length ?? 0) > 0 ? (
              `${quote!.availableOffers.length} offer${quote!.availableOffers.length > 1 ? 's' : ''} for this slot · View`
            ) : quote?.offerHint ? (
              // One line: the deal (without the setup name, already shown above)
              // and what unlocks it, with "View" always visible at the end.
              <>
                <span className="min-w-0 truncate">
                  {quote.offerHint.title.replace(/\s*\S?·\s*[^·]*$/, '')} · {quote.offerHint.message.replace(/\.$/, '')}
                </span>
                <span className="ml-auto flex-shrink-0 pl-2">View</span>
              </>
            ) : appliedCode ? (
              `Code ${appliedCode} · Change`
            ) : (
              'Have a code?'
            )}
          </button>
        )}

        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex min-w-0 items-center gap-0.5">
            Platform fee
            <InfoTip quiet text={CUSTOMER_INFO.platformFee} label="What is the platform fee?" />
            {feeWaived > 0 && <span className="truncate font-semibold text-success">· first booking</span>}
          </span>
          {feeWaived > 0 ? (
            <span className="flex-shrink-0">
              <span className="mr-1.5 line-through"><span className="rupee-symbol">₹</span>{feeWaived.toFixed(2)}</span>
              <span className="font-bold text-success">FREE</span>
            </span>
          ) : (
            <span className="flex-shrink-0 font-semibold text-text-primary"><span className="rupee-symbol">₹</span>{serviceFee.toFixed(2)}</span>
          )}
        </div>

        <div className="mt-1 flex items-center justify-between gap-3 border-t border-border/60 pt-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="font-heading text-body font-bold text-text-primary">Total</span>
            {youSave > 0 && (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-bold text-emerald-700">
                <Tag className="h-3 w-3 flex-shrink-0" aria-hidden />
                <span className="truncate">You save <span className="rupee-symbol">₹</span>{money(youSave)}</span>
              </span>
            )}
          </span>
          <span className="flex-shrink-0 font-heading text-body-emphasis font-bold text-text-primary"><span className="rupee-symbol">₹</span>{money(finalTotal)}</span>
        </div>
      </div>

      {/* The two optional extras, one quiet row: name your game, and the
          payment / cancellation promise (tap for the details). */}
      <div className="flex items-center justify-between gap-3">
        {!gameOpen && !selectedGame ? (
          <button
            type="button"
            onClick={() => setGameOpen(true)}
            className="-ml-1 flex min-h-[44px] flex-shrink-0 items-center gap-1.5 rounded-lg px-1 text-caption font-semibold text-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <Gamepad2 className="h-4 w-4 text-primary" aria-hidden />
            Add game <span className="font-normal text-text-secondary">(optional)</span>
          </button>
        ) : (
          <span className="flex items-center gap-1.5 text-caption font-semibold text-text-secondary">
            <Gamepad2 className="h-4 w-4 text-primary" aria-hidden />
            Game
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowTrustDetails((v) => !v)}
          aria-expanded={showTrustDetails}
          className="flex min-h-[44px] min-w-0 items-center gap-1 rounded-lg text-right text-caption text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-success" aria-hidden />
          <span className="truncate">Secure · Razorpay</span>
          <ChevronDown className={cn('h-3.5 w-3.5 flex-shrink-0 transition-transform', showTrustDetails && 'rotate-180')} aria-hidden />
        </button>
      </div>

      {(gameOpen || selectedGame) && (
        <>
          <input
            type="text"
            list="cafe-games"
            autoFocus={gameOpen && !selectedGame}
            aria-label="What are you playing? (optional)"
            value={selectedGame}
            onChange={(e) => setSelectedGame(e.target.value)}
            onFocus={(e) => {
              setTypingGame(true);
              // Once the keyboard is up, bring the box to the middle of what's
              // still visible, so the keyboard never hides what you type.
              const el = e.currentTarget;
              setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
            }}
            onBlur={() => setTypingGame(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="What are you playing? e.g. FC 25"
            className="-mt-1.5 h-11 w-full scroll-mb-40 rounded-xl border border-border bg-card px-3 text-body text-text-primary focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/25"
          />
          <datalist id="cafe-games">
            {Object.values(cafe?.supportedGames ?? {})
              .flat()
              .map((g) => (
                <option key={g} value={g} />
              ))}
          </datalist>
        </>
      )}

      {showTrustDetails && (
        <div className="-mt-1.5 flex flex-col gap-1.5 rounded-2xl bg-card px-3.5 py-3 text-caption text-text-secondary">
          <p>Payments secured by Razorpay: UPI, cards and wallets. Your card and UPI details are never stored by KHEL-O.</p>
          <p>Free cancellation up to 2 hours before your session, with a full refund to your original payment method.</p>
          <a href="/refund-policy" target="_blank" className="font-semibold text-primary hover:underline">
            Read the refund policy
          </a>
        </div>
      )}

      <BottomSheet isOpen={offersOpen} onClose={() => setOffersOpen(false)} title="Offers for this slot">
        <OffersPanel
          inSheet
          quote={quote}
          loading={quoteQuery.isLoading}
          appliedCode={appliedCode}
          onChooseOffer={(id) => {
            handleChooseOffer(id);
            setOffersOpen(false);
          }}
          onMakeLength={(minutes) => {
            userHasSelectedSlot.current = true;
            setDurationHours(minutes / 60);
            setOffersOpen(false);
          }}
          onApplyCode={(code) => {
            handleApplyCode(code);
            setOffersOpen(false);
          }}
          onClearCode={handleClearCode}
        />
      </BottomSheet>

      {/* Pay bar. The customer bottom nav is hidden on this page (see
          CustomerShell), so it sits on the bottom edge, clear of the
          home-indicator safe area. */}
      <div
        className={cn(
          'action-bar-fixed fixed bottom-0 left-0 right-0 z-overlay bg-card border-t border-border px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-overlay transition-transform duration-200 ease-out',
          typingGame && 'pointer-events-none'
        )}
        // Inline, because .action-bar-fixed sets its own transform.
        style={typingGame ? { transform: 'translate3d(0, 100%, 0)' } : undefined}
      >
        {/* Compact on purpose: the total, what it's made of, and the pay
            button in one row, so the slider above keeps the screen. The
            Razorpay line lives in the price summary above, not here. */}
        <div className="max-w-content mx-auto flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-heading text-h2 font-bold leading-tight text-text-primary">
              <span className="rupee-symbol">₹</span>{money(finalTotal)}
            </div>
            {/* The refund promise, as a real time, right where people decide to
                pay. "You save" already sits on the Total row above. */}
            {cancelBy ? (
              <span className="flex min-w-0 items-center gap-1 text-caption font-semibold text-emerald-700">
                <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" aria-hidden />
                <span className="truncate">{cancelBy}</span>
              </span>
            ) : selectedTime ? (
              // Under 2 hours to go the server won't take a cancellation, so
              // say so here rather than promise it (the saving is on Total).
              <span className="block truncate text-caption text-text-secondary">
                Starts within 2 hrs: can&apos;t be cancelled
              </span>
            ) : (
              <span className="block truncate text-caption text-text-secondary">
                ₹{money(subtotal)} session + ₹{money(serviceFee)} platform fee
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCheckout}
            disabled={
              isProcessing ||
              quoteSettling ||
              Boolean(cafe.isEmergencyMode) ||
              Boolean(cafe.bookingsPaused) ||
              noTimeLeftToday ||
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
              : noTimeLeftToday
              ? 'Pick another day'
              : windowRemainingSeats === 0
              ? 'Sold Out'
              : windowRemainingSeats < consolesCount
              ? `Only ${windowRemainingSeats} Seat${windowRemainingSeats > 1 ? 's' : ''} Left`
              : `Pay ₹${money(finalTotal)}`}
          </button>
        </div>
      </div>
    </div>

      {/* Signed-out visitor tapped Pay: sign in right here (Google in one
          tap), then payment carries on with every pick kept. */}
      <CheckoutSignInSheet
        isOpen={showLoginPrompt}
        onClose={() => setShowLoginPrompt(false)}
        amountLabel={`₹${money(finalTotal)}`}
        summary={`${activeTier?.name || 'Setup'} · ${durationLabel} · ${seatsCount} player${seatsCount > 1 ? 's' : ''}`}
        onSignedIn={() => {
          payAfterSignIn.current = finalTotal;
          setShowLoginPrompt(false);
        }}
        onUseEmail={handleLoginFromPrompt}
        onCreateAccount={handleRegisterFromPrompt}
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

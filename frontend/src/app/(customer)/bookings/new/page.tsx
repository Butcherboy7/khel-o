'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  Calendar as CalendarIcon,
  Clock,
  Timer,
  AlertCircle,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { getCafe, createBooking, createPaymentOrder, verifyPayment, CreateBookingRequest } from '@/lib/api';
import { useRazorpay } from '@/hooks/useRazorpay';
import { useAuthStore } from '@/store/authStore';
import {
  formatDateLong,
  addHoursToTime,
  generateTimeSlots,
  isSlotDisabled,
} from '@/lib/format';

export default function NewBookingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { displayRazorpay } = useRazorpay();
  const user = useAuthStore((state) => state.user);

  const cafeId = searchParams.get('cafeId');
  const tierId = searchParams.get('tierId');

  // Wizard local state
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [selectedDuration, setSelectedDuration] = useState<number>(2.0);
  const [notes, setNotes] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState<boolean>(false);

  // Fetch café context
  const {
    data: cafe,
    isLoading: isCafeLoading,
    isError: isCafeError,
  } = useQuery({
    queryKey: ['cafe', cafeId],
    queryFn: () => getCafe(cafeId!),
    enabled: Boolean(cafeId),
  });

  const selectedTier = useMemo(() => {
    if (!cafe || !tierId) return null;
    return cafe.tiers?.find((t) => t.id === tierId) || null;
  }, [cafe, tierId]);

  // Booking mutation
  const bookingMutation = useMutation({
    mutationFn: (payload: CreateBookingRequest) => createBooking(payload),
    onSuccess: async (booking) => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
      setIsProcessingPayment(true);
      try {
        const paymentOrder = await createPaymentOrder(booking.id);
        displayRazorpay({
          amount: Math.round(paymentOrder.amount * 100),
          currency: paymentOrder.currency || 'INR',
          name: cafe?.name || 'KHEL-O Gaming',
          description: `Booking #${booking.bookingReference}`,
          order_id: paymentOrder.orderId,
          prefill: {
            name: user?.fullName || 'Gamer',
            email: user?.email || '',
            contact: user?.phoneNumber || '',
          },
          handler: async (response) => {
            try {
              await verifyPayment({
                bookingId: booking.id,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              queryClient.invalidateQueries({ queryKey: ['bookings'] });
              router.push(`/bookings/${booking.id}`);
            } catch (err: any) {
              setErrorMessage('Payment verification failed. Please check My Bookings.');
              setIsProcessingPayment(false);
            }
          },
        });
      } catch (err: any) {
        // Fallback: Navigate to booking detail if order creation fails (sandbox handling)
        router.push(`/bookings/${booking.id}`);
      }
    },
    onError: (error: any) => {
      setIsProcessingPayment(false);
      const errorCode = error?.response?.data?.error?.code || error?.response?.data?.detail?.code;
      const detailMsg = error?.response?.data?.error?.message || error?.response?.data?.detail;

      if (errorCode === 'INVALID_START_TIME' || (typeof detailMsg === 'string' && detailMsg.includes('future'))) {
        setErrorMessage('That time slot has passed. Please pick another.');
        setCurrentStep(2);
      } else if (errorCode === 'TIER_FULLY_BOOKED') {
        setErrorMessage('This tier is fully booked for that time. Try another slot.');
        setCurrentStep(2);
      } else if (errorCode === 'PROMOTION_EXHAUSTED' || errorCode === 'PROMOTION_INVALID') {
        setErrorMessage('This promotion is no longer available. Proceeding without discount.');
        // Stay on step 3
      } else {
        setErrorMessage(typeof detailMsg === 'string' ? detailMsg : 'Something went wrong. Please try again.');
      }
    },
  });

  // 14-day date generator
  const dateOptions = useMemo(() => {
    const dates = [];
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const monthName = d.toLocaleDateString('en-US', { month: 'short' });

      dates.push({
        dateStr,
        dayNum: d.getDate(),
        dayName,
        monthName,
        isToday: i === 0,
      });
    }
    return dates;
  }, []);

  // Time slots generator
  const timeSlots = useMemo(() => {
    return generateTimeSlots(cafe?.openingTime, cafe?.closingTime);
  }, [cafe?.openingTime, cafe?.closingTime]);

  // End time preview
  const calculatedEndTime = useMemo(() => {
    if (!selectedTime || !selectedDuration) return '';
    return addHoursToTime(selectedTime, selectedDuration);
  }, [selectedTime, selectedDuration]);

  const isEndTimeOverClosing = useMemo(() => {
    if (!calculatedEndTime || !cafe?.closingTime) return false;
    return calculatedEndTime > cafe.closingTime;
  }, [calculatedEndTime, cafe?.closingTime]);

  // Price calculations (Client preview)
  const priceCalculation = useMemo(() => {
    if (!selectedTier) return { baseAmount: 0, discountAmount: 0, gatewayFee: 0, platformFee: 0, totalAmount: 0, promo: null };

    const pricePerHour = selectedTier.pricePerHour || 0;
    const baseAmount = Math.round(pricePerHour * selectedDuration * 100) / 100;

    let discountAmount = 0;
    const activePromo = cafe?.activePromotions && cafe.activePromotions.length > 0 ? cafe.activePromotions[0] : null;

    if (activePromo) {
      if (activePromo.discountType === 'percentage') {
        discountAmount = Math.round(baseAmount * (activePromo.discountValue / 100) * 100) / 100;
      } else if (activePromo.discountType === 'fixed') {
        discountAmount = Math.min(baseAmount, activePromo.discountValue);
      }
    }

    const subtotal = Math.max(0, baseAmount - discountAmount);
    const gatewayFee = Math.round(subtotal * 0.02 * 100) / 100;
    const platformFee = 10.00; // Flat platform fee
    const totalAmount = Math.round((subtotal + gatewayFee + platformFee) * 100) / 100;

    return {
      baseAmount,
      discountAmount,
      gatewayFee,
      platformFee,
      totalAmount,
      promo: activePromo,
    };
  }, [selectedTier, selectedDuration, cafe?.activePromotions]);

  // Auto-select today if selectedDate is empty
  React.useEffect(() => {
    if (!selectedDate && dateOptions.length > 0) {
      setSelectedDate(dateOptions[0].dateStr);
    }
  }, [dateOptions, selectedDate]);

  // Group time slots by time of day
  const groupedTimeSlots = useMemo(() => {
    const morning: string[] = [];
    const afternoon: string[] = [];
    const evening: string[] = [];
    const night: string[] = [];

    timeSlots.forEach((slot) => {
      const hour = parseInt(slot.slice(0, 2), 10);
      if (hour >= 6 && hour < 12) morning.push(slot);
      else if (hour >= 12 && hour < 17) afternoon.push(slot);
      else if (hour >= 17 && hour < 21) evening.push(slot);
      else night.push(slot);
    });

    return [
      { label: '🌅 Morning', slots: morning },
      { label: '☀️ Afternoon', slots: afternoon },
      { label: '🌇 Evening', slots: evening },
      { label: '🌙 Night', slots: night },
    ].filter((g) => g.slots.length > 0);
  }, [timeSlots]);

  // Handle Missing Query Params or invalid loading state
  if (!cafeId || !tierId) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md">
        <AlertCircle className="w-12 h-12 text-error" />
        <h3 className="font-heading font-semibold text-lg text-text-primary">
          Missing Reservation Details
        </h3>
        <p className="text-text-secondary text-sm">
          Please select a café and hardware tier first to reserve your slot.
        </p>
        <Link
          href="/"
          className="bg-primary text-white font-medium py-2.5 px-6 rounded-2xl text-sm active:scale-95 transition-transform mt-2"
        >
          Return to Explore
        </Link>
      </div>
    );
  }

  if (isCafeLoading) {
    return (
      <div className="space-y-4 animate-pulse pb-24">
        <div className="flex items-center justify-between">
          <div className="w-10 h-10 bg-surface rounded-full" />
          <div className="h-6 bg-surface rounded w-1/3" />
          <div className="w-10" />
        </div>
        <div className="w-full h-16 bg-surface rounded-2xl" />
        <div className="h-8 bg-surface rounded w-2/3" />
        <div className="w-full h-48 bg-surface rounded-2xl" />
      </div>
    );
  }

  if (isCafeError || !cafe || !selectedTier) {
    return (
      <div className="bg-card border border-border rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-3 shadow-md">
        <AlertCircle className="w-12 h-12 text-error" />
        <h3 className="font-heading font-semibold text-lg text-text-primary">
          Unable to load tier options
        </h3>
        <p className="text-text-secondary text-sm">
          The selected gaming café or hardware tier could not be found.
        </p>
        <Link
          href="/"
          className="bg-primary text-white font-medium py-2.5 px-6 rounded-2xl text-sm active:scale-95 transition-transform mt-2"
        >
          Return to Explore
        </Link>
      </div>
    );
  }

  // Back button handler
  const handleBack = () => {
    if (currentStep === 1 || currentStep === 2) {
      router.push(`/cafes/${cafeId}`);
    } else if (currentStep === 3) {
      setCurrentStep(1);
    }
  };

  const handleBookingSubmit = () => {
    setErrorMessage(null);
    const payload: CreateBookingRequest = {
      cafeId,
      hardwareTierId: tierId,
      sessionDate: selectedDate,
      startTime: selectedTime,
      durationHours: selectedDuration,
      notes: notes.trim() || undefined,
      promotionId: priceCalculation.promo ? priceCalculation.promo.id : undefined,
    };
    bookingMutation.mutate(payload);
  };

  return (
    <div className="space-y-4 pb-28">
      {/* STEP 1 & 2 UNIFIED: SELECT DATE & TIME & DURATION */}
      {(currentStep === 1 || currentStep === 2) && (
        <>
          {/* Top Header */}
          <div className="flex items-center justify-between relative">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 bg-card border border-border rounded-full text-text-secondary hover:text-text-primary shadow-sm z-10"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 text-center">
              <h1 className="text-lg font-bold font-heading text-text-primary">
                Reserve your slot
              </h1>
              <div className="flex items-center justify-center space-x-1.5 mt-1">
                <div className="w-6 h-2 bg-primary rounded-full" />
                <div className="w-2 h-2 bg-border rounded-full" />
              </div>
            </div>
            <div className="w-9" />
          </div>

          {/* Café Context Strip */}
          <div className="bg-card border border-border rounded-2xl p-3 flex items-center justify-between shadow-sm">
            <div className="font-heading font-semibold text-sm text-text-primary truncate max-w-[200px]">
              {cafe.name}
            </div>
            <div className="text-primary font-data font-medium text-xs px-2.5 py-1 bg-surface rounded-full flex-shrink-0 border border-border">
              {selectedTier.name} • ₹{selectedTier.pricePerHour}/hr
            </div>
          </div>

          {/* Error Alert Banner */}
          {errorMessage && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs rounded-2xl p-3.5 flex items-start space-x-2 animate-shake">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <span className="flex-1 font-medium">{errorMessage}</span>
            </div>
          )}

          {/* 📅 PERSISTENT DATE SELECTOR ROW */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-heading font-semibold text-sm text-text-primary">
                📅 Select Date
              </label>
              <span className="text-xs text-text-secondary font-medium">
                {formatDateLong(selectedDate || dateOptions[0]?.dateStr)}
              </span>
            </div>

            <div className="flex space-x-2 overflow-x-auto pb-2 scrollbar-none snap-x snap-mandatory">
              {dateOptions.map((opt) => {
                const isSelected = selectedDate === opt.dateStr;
                return (
                  <button
                    key={opt.dateStr}
                    type="button"
                    onClick={() => setSelectedDate(opt.dateStr)}
                    className={`w-[60px] h-[78px] flex-shrink-0 snap-start rounded-2xl border p-2 flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-primary text-white border-primary shadow-md scale-105 font-bold'
                        : 'bg-card border-border text-text-primary hover:border-primary/50'
                    }`}
                  >
                    <span
                      className={`text-[9px] uppercase font-semibold ${
                        isSelected ? 'text-white/80' : 'text-text-secondary'
                      }`}
                    >
                      {opt.dayName}
                    </span>
                    <span className="font-heading font-bold text-xl my-0.5">
                      {opt.dayNum}
                    </span>
                    <span
                      className={`text-[9px] ${
                        isSelected ? 'text-white/80' : 'text-text-secondary'
                      }`}
                    >
                      {opt.monthName}
                    </span>
                    {opt.isToday && (
                      <span
                        className={`text-[8px] font-bold mt-0.5 ${
                          isSelected ? 'text-white' : 'text-primary'
                        }`}
                      >
                        Today
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ⏰ GROUPED TIME SLOTS */}
          <div className="space-y-3 pt-1">
            <label className="block font-heading font-semibold text-sm text-text-primary">
              ⏰ Select Start Time
            </label>

            {groupedTimeSlots.map((group) => (
              <div key={group.label} className="space-y-1.5">
                <span className="text-xs font-semibold text-text-secondary">
                  {group.label}
                </span>
                <div className="grid grid-cols-4 gap-2">
                  {group.slots.map((slot) => {
                    const disabled = isSlotDisabled(selectedDate, slot);
                    const isSelected = selectedTime === slot;
                    const displayTime = slot.slice(0, 5);

                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedTime(slot)}
                        className={`py-2 text-center text-sm font-data rounded-2xl border transition-all ${
                          disabled
                            ? 'bg-surface border-border text-text-secondary opacity-30 cursor-not-allowed line-through'
                            : isSelected
                            ? 'bg-primary text-white border-primary shadow-md font-bold scale-105'
                            : 'bg-card border-border text-text-primary hover:border-primary/50'
                        }`}
                      >
                        {displayTime}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ⏳ TACTILE DURATION & PRICE PREVIEW */}
          <div className="space-y-2 pt-2">
            <label className="block font-heading font-semibold text-sm text-text-primary">
              ⏳ Gaming Duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[1, 1.5, 2, 3, 4, 5, 6, 8].map((hrs) => {
                const isSelected = selectedDuration === hrs;
                const estCost = Math.round(selectedTier.pricePerHour * hrs);
                return (
                  <button
                    key={hrs}
                    type="button"
                    onClick={() => setSelectedDuration(hrs)}
                    className={`p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-primary text-white border-primary shadow-md scale-105 font-bold'
                        : 'bg-card border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <span className="text-sm font-data">{hrs}h</span>
                    <span className={`text-[10px] ${isSelected ? 'text-white/90' : 'text-text-secondary'}`}>
                      ₹{estCost}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Session End Time Preview */}
          {selectedTime && selectedDuration && (
            <div className="bg-surface border border-border rounded-2xl p-3 flex items-center justify-between shadow-sm">
              <div className="text-xs text-text-secondary">
                Session window: <span className="font-semibold text-text-primary font-data">{selectedTime.slice(0, 5)} - {calculatedEndTime.slice(0, 5)}</span>
              </div>
              <div className="font-data font-bold text-sm text-primary">
                Est: ₹{priceCalculation.totalAmount.toFixed(0)}
              </div>
            </div>
          )}

          {/* Fixed Bottom CTA */}
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border p-4 shadow-lg">
            <div className="max-w-md mx-auto">
              <button
                type="button"
                disabled={!selectedTime || !selectedDuration}
                onClick={() => setCurrentStep(3)}
                className="w-full bg-primary text-white rounded-2xl py-3.5 font-heading font-semibold text-sm shadow-sm active:scale-95 transition-transform disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center space-x-2"
              >
                <span>Continue to Review ({priceCalculation.totalAmount > 0 ? `₹${priceCalculation.totalAmount.toFixed(0)}` : 'Select Slot'})</span>
              </button>
            </div>
          </div>
        </>
      )}

      {/* STEP 3: REVIEW AND CONFIRM */}
      {currentStep === 3 && (
        <div className="space-y-4">
          {/* Top Header Step 3 */}
          <div className="flex items-center justify-between relative">
            <button
              type="button"
              onClick={handleBack}
              className="p-2 bg-card border border-border rounded-full text-text-secondary hover:text-text-primary shadow-sm z-10"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 text-center">
              <h1 className="text-lg font-bold font-heading text-text-primary">
                Review Booking
              </h1>
              <div className="flex items-center justify-center space-x-1.5 mt-1">
                <div className="w-2 h-2 bg-border rounded-full" />
                <div className="w-6 h-2 bg-primary rounded-full" />
              </div>
            </div>
            <div className="w-9" />
          </div>

          {/* Summary Card */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-md">
            <div className="flex justify-between items-center pb-3 border-b border-border">
              <h3 className="font-heading font-semibold text-base text-text-primary">
                {cafe.name}
              </h3>
              <span className="text-primary text-xs bg-surface border border-border px-2.5 py-1 rounded-full font-data">
                {selectedTier.name}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="flex items-center space-x-2 text-text-secondary">
                  <CalendarIcon className="w-4 h-4 text-primary" />
                  <span>Date</span>
                </span>
                <span className="font-medium text-text-primary">
                  {formatDateLong(selectedDate)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="flex items-center space-x-2 text-text-secondary">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>Time</span>
                </span>
                <span className="font-medium text-text-primary font-data">
                  {selectedTime.slice(0, 5)} - {calculatedEndTime.slice(0, 5)}
                </span>
              </div>

              <div className="flex justify-between items-center">
                <span className="flex items-center space-x-2 text-text-secondary">
                  <Timer className="w-4 h-4 text-primary" />
                  <span>Duration</span>
                </span>
                <span className="font-data font-medium text-text-primary">
                  {selectedDuration} hrs
                </span>
              </div>
            </div>
          </div>

          {/* Active Promo Flash Badge */}
          {priceCalculation.promo && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3 flex items-center space-x-2 text-xs">
              <Sparkles className="w-4 h-4 text-primary flex-shrink-0" />
              <span className="font-semibold">
                🔥 Flash Deal Applied: {priceCalculation.promo.title}
              </span>
            </div>
          )}

          {/* Price Breakdown Card */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-2.5 shadow-sm">
            <h3 className="font-heading font-semibold text-base text-text-primary">
              Price breakdown
            </h3>

            <div className="flex justify-between text-sm">
              <span className="text-text-secondary">
                Base ({selectedDuration}h × ₹{selectedTier.pricePerHour})
              </span>
              <span className="font-data text-text-primary">
                ₹{priceCalculation.baseAmount.toFixed(2)}
              </span>
            </div>

            {priceCalculation.discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-primary font-medium">🔥 Discount</span>
                <span className="font-data text-primary font-medium">
                  -₹{priceCalculation.discountAmount.toFixed(2)}
                </span>
              </div>
            )}

            <div className="space-y-0.5">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Platform fee</span>
                <span className="font-data text-text-primary">
                  ₹{priceCalculation.platformFee.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="space-y-0.5">
              <div className="flex justify-between text-sm">
                <span className="text-text-secondary">Payment gateway fee</span>
                <span className="font-data text-text-primary">
                  ₹{priceCalculation.gatewayFee.toFixed(2)}
                </span>
              </div>
              <p className="text-[11px] text-text-secondary italic">
                This is Razorpay's charge, not a platform fee
              </p>
            </div>

            <div className="pt-2 border-t border-border flex justify-between items-center">
              <span className="font-heading font-bold text-base text-text-primary">
                Total payable
              </span>
              <span className="font-data font-bold text-xl text-primary">
                ₹{priceCalculation.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Optional Notes */}
          <div className="space-y-1.5">
            <label className="block text-text-secondary text-sm font-medium">
              Special requests (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={200}
              rows={3}
              placeholder="e.g., prefer a corner seat"
              className="bg-card border border-border rounded-2xl px-4 py-3 w-full text-base focus:outline-none focus:border-primary text-text-primary placeholder:text-text-secondary shadow-sm"
            />
          </div>

          {/* Terms Note */}
          <p className="text-xs text-text-secondary text-center px-4">
            By booking, you agree to our Terms and Cancellation Policy
          </p>

          {/* Fixed Bottom CTA for Step 3 */}
          <div className="fixed bottom-0 left-0 right-0 z-30 bg-card border-t border-border p-4 shadow-lg">
            <div className="max-w-md mx-auto">
              <button
                type="button"
                disabled={bookingMutation.isPending || isProcessingPayment}
                onClick={handleBookingSubmit}
                className="w-full bg-primary text-white rounded-2xl py-3.5 font-heading font-semibold text-sm shadow-sm active:scale-95 transition-transform flex items-center justify-center space-x-2 disabled:opacity-60 disabled:pointer-events-none"
              >
                {bookingMutation.isPending || isProcessingPayment ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Processing Payment...</span>
                  </>
                ) : (
                  <span>Confirm and Pay ₹{priceCalculation.totalAmount.toFixed(2)}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

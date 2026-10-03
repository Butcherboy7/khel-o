import type { Promotion } from '@/types/promotion';
/** How many spots left before "Only N left" appears. Above this the cap is
 *  not worth mentioning; at or below it, it is the reason to book now. */
export const LOW_SPOTS_AT = 5;
const SOON_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

interface UrgencyInput {
  slotsRemaining?: number | null;
  /** ISO timestamp the offer stops being valid. */
  validUntil?: string | null;
}

/**
 * The one honest nudge for an offer, or null when there's nothing true to say.
 * Scarcity wins over a deadline: "Only 4 left" is a stronger, more specific
 * fact than "Ends in 2 days". Never invents urgency: both inputs come from the
 * offer itself.
 */
export function offerUrgency(o: UrgencyInput, now: number = Date.now()): string | null {
  if (o.slotsRemaining != null && o.slotsRemaining > 0 && o.slotsRemaining <= LOW_SPOTS_AT) {
    return `Only ${o.slotsRemaining} left`;
  }
  if (o.validUntil) {
    const ms = new Date(o.validUntil).getTime() - now;
    if (Number.isFinite(ms) && ms > 0 && ms <= SOON_DAYS * DAY_MS) {
      if (ms < DAY_MS) return 'Ends today';
      return `Ends in ${Math.ceil(ms / DAY_MS)} days`;
    }
  }
  return null;
}

/** 15 → "15 min", 60 → "1 hr", 90 → "1.5 hr". */
export function lengthLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hrs = minutes / 60;
  return `${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)} hr`;
}

/** "20% off" + who it is for, so a solo and a 2-player offer on one setup read apart. */
export function offerLabelWithMode(label: string, playMode?: string | null): string {
  if (playMode === 'coop') return `${label} · 2 players`;
  if (playMode === 'solo') return `${label} · solo`;
  return label;
}

/**
 * What a live offer does to a setup's hourly price, in a form a card can show
 * as "₹140 → ₹119/hr · 15% off". Covers a percentage offer and a 1-hour
 * fixed-price deal; anything else (a 15/30-min deal, a flat ₹ off) returns
 * null and is left to checkout, which prices every length exactly.
 */
export function hourlyOffer(regular: number, promo?: Promotion | null): { price: number; pct: number } | null {
  if (!promo || promo.isLiveNow === false || !(regular > 0)) return null;
  if (promo.promotionType === 'percentage' && (promo.discountPercentage ?? 0) > 0) {
    const pct = promo.discountPercentage as number;
    return { price: Math.round(regular * (1 - pct / 100)), pct };
  }
  if (
    promo.promotionType === 'fixed_price' &&
    Math.round(Number(promo.minDurationHours ?? 0) * 60) === 60 &&
    promo.fixedPriceAmount != null &&
    Number(promo.fixedPriceAmount) < regular
  ) {
    const price = Number(promo.fixedPriceAmount);
    return { price, pct: Math.round((1 - price / regular) * 100) };
  }
  return null;
}

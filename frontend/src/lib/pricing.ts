/** What a booking costs before any offer — a line-for-line mirror of
 * backend app/services/pricing_service.base_price_for_minutes, so the
 * checkout estimate matches what the server charges.
 *
 * - 15 / 30 min: the setup's own price if the owner set one, else hourly/4
 *   and hourly/2.
 * - 60 min and above: the owner's package price for that length when set
 *   (lengthPrices, e.g. 3 hr = 400). Otherwise the nearest shorter package
 *   plus the hourly rate for the extra time, or hourly × minutes / 60 when
 *   there's no shorter package.
 * - Co-op: extra-player price per extra player, scaled by minutes/60 — except
 *   a 30-min co-op session with the owner's coopPrice30m (2 players), plus
 *   the scaled extra for each player past the second.
 * - Solo on several consoles: multiplied by `seats`. */
export interface PriceableTier {
  pricePerHour: number;
  price15m?: number | null;
  price30m?: number | null;
  coopPrice30m?: number | null;
  coopExtraPlayerPrice?: number | null;
  lengthPrices?: Record<string, number> | null;
}

/** The tier's package prices as [minutes, price] pairs, shortest first. */
export function packagePrices(tier: Pick<PriceableTier, 'lengthPrices'>): [number, number][] {
  return Object.entries(tier.lengthPrices ?? {})
    .map(([k, v]) => [Number(k), Number(v)] as [number, number])
    .filter(([m, p]) => Number.isFinite(m) && m >= 60 && Number.isFinite(p) && p > 0)
    .sort((a, b) => a[0] - b[0]);
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function basePriceForMinutes(
  tier: PriceableTier,
  minutes: number,
  opts: { players?: number; isCoop?: boolean; seats?: number } = {},
): number {
  const { players = 1, isCoop = false, seats = 1 } = opts;
  const hourly = Number(tier.pricePerHour) || 0;

  let unit: number;
  if (minutes === 15 && tier.price15m != null) unit = Number(tier.price15m);
  else if (minutes === 30 && tier.price30m != null) unit = Number(tier.price30m);
  else if (minutes === 15) unit = hourly / 4;
  else if (minutes === 30) unit = hourly / 2;
  else {
    const packages = packagePrices(tier);
    const exact = packages.find(([m]) => m === minutes);
    const shorter = packages.filter(([m]) => m < minutes).pop();
    if (exact) unit = exact[1];
    else if (shorter) unit = shorter[1] + (hourly * (minutes - shorter[0])) / 60;
    else unit = (hourly * minutes) / 60;
  }

  const extra = Number(tier.coopExtraPlayerPrice ?? 0);
  const total =
    isCoop && minutes === 30 && players >= 2 && tier.coopPrice30m != null
      ? Number(tier.coopPrice30m) + extra * (players - 2) * (minutes / 60)
      : isCoop
        ? unit + extra * Math.max(players - 1, 0) * (minutes / 60)
        : unit * seats;
  return round2(total);
}

/** Launch offer: a customer's first booking has no platform fee, until this
 *  moment (30 Nov 2026, 11:59 pm IST) or the first 500 such bookings. The
 *  server decides each booking (checkout_maths.py); this only gates the copy
 *  that advertises it, so it never shows after the end date. */
export const FIRST_BOOKING_OFFER_ENDS = Date.parse('2026-11-30T23:59:59+05:30');

export function firstBookingOfferLive(now: number = Date.now()): boolean {
  return now <= FIRST_BOOKING_OFFER_ENDS;
}

import type { CafeDetail } from '@/types';

/** Below this, the "N people want this" line reads as a weakness, not proof —
 *  the same >= 5 rule the explore card applies to the waitlist count. */
export const WAITLIST_SHOW_MIN = 5;

type SeoCafe = Pick<CafeDetail, 'name' | 'city' | 'tiers' | 'averageRating' | 'totalReviews' | 'isLeadListing'>;

const CUE_SPORTS = /snooker|pool|billiard/i;

/** What the venue is, from what it actually offers: a bowling alley must not
 *  be titled "Gaming Café" — that is both wrong and never matches "bowling"
 *  searches. Gaming setups lead; the first activity is added after them. */
export function venueNoun(tiers: SeoCafe['tiers']): string {
  const active = (tiers ?? []).filter((t) => t.isActive !== false);
  const hasGaming = active.some((t) => t.tierType !== 'activity');
  const kinds = Array.from(
    new Set(
      active
        .filter((t) => t.tierType === 'activity')
        .map((t) => (t.activityKind || t.name || '').trim())
        .filter(Boolean),
    ),
  );
  const label = (kind: string) => {
    if (CUE_SPORTS.test(kind)) return 'Snooker';
    if (/bowling/i.test(kind)) return 'Bowling';
    return kind.replace(/\b\w/g, (c) => c.toUpperCase());
  };
  const activities = Array.from(new Set(kinds.map(label)));

  if (hasGaming) return activities.length > 0 ? `Gaming Café & ${activities[0]}` : 'Gaming Café';
  if (activities.length === 0) return 'Gaming Café';
  if (activities.length === 1) {
    if (activities[0] === 'Bowling') return 'Bowling Alley';
    if (activities[0] === 'Snooker') return 'Snooker & Pool Hub';
    return activities[0];
  }
  return `${activities[0]} & ${activities[1]}`;
}

/** "Rockstar Gaming Cafe, Bowenpally" — the area people search by, unless the
 *  name already says it ("Gamers Guild Hyderabad" stays as is). */
export function nameWithArea(name: string, area: string | null | undefined): string {
  if (!area) return name;
  return name.toLowerCase().includes(area.toLowerCase()) ? name : `${name}, ${area}`;
}

export function minHourlyPrice(tiers: SeoCafe['tiers']): number | null {
  const prices = (tiers ?? []).filter((t) => t.isActive !== false).map((t) => Number(t.pricePerHour)).filter((p) => Number.isFinite(p) && p > 0);
  return prices.length > 0 ? Math.min(...prices) : null;
}

/**
 * The search-result title and description for a café page.
 *
 * Bookable cafés lead with booking ("Book from ₹140/hr") — the one thing the
 * café's own Instagram, JustDial or magicpin can't offer. "Booking soon"
 * (lead) cafés must never promise booking: they answer what people search for
 * them ("reviews", "photos", price) and ask for the vote instead, with the
 * waitlist count once it is big enough to persuade.
 */
export function buildCafeSeo(
  cafe: SeoCafe,
  opts: { locality?: string | null; waitlistCount?: number | null; platformLabels?: string[] } = {},
): { title: string; description: string } {
  const area = opts.locality || cafe.city;
  const place = nameWithArea(cafe.name, area);
  const noun = venueNoun(cafe.tiers);
  const minPrice = minHourlyPrice(cafe.tiers);
  const platforms = (opts.platformLabels ?? []).slice(0, 3);
  const platformText = platforms.length > 0 ? ` ${platforms.join(', ')}.` : '';
  const rating =
    cafe.totalReviews > 0 && cafe.averageRating > 0
      ? ` Rated ${Number(cafe.averageRating).toFixed(1)}★ (${cafe.totalReviews} review${cafe.totalReviews === 1 ? '' : 's'}).`
      : '';

  if (cafe.isLeadListing) {
    const count = opts.waitlistCount ?? 0;
    const title = `${place} — ${minPrice ? 'Prices, ' : ''}Photos & Reviews`;
    const price = minPrice ? ` Approx ₹${minPrice}/hr.` : '';
    const demand =
      count >= WAITLIST_SHOW_MIN
        ? ` ${count} players want to book ${cafe.name} online — add your vote and we'll bring it to KHEL-O.`
        : ` Want to book ${cafe.name} online? Add your vote and we'll bring it to KHEL-O.`;
    return {
      title,
      description: `${noun} in ${area}.${price}${platformText}${rating}${demand}`,
    };
  }

  const title = minPrice ? `${place} — Book from ₹${minPrice}/hr` : `${place} — Book Online`;
  const from = minPrice ? ` from ₹${minPrice}/hr` : '';
  return {
    title,
    description: `Book ${cafe.name}, ${noun.toLowerCase()} in ${area}${from}.${platformText}${rating} See free seats live and pay online on KHEL-O — no calls needed.`,
  };
}

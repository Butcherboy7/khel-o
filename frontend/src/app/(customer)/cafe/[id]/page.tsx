import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ApiError } from '@/lib/api/errors';
import { getCafe, cafePath, isCafeUuid } from '@/lib/api/cafes';
import { PLATFORMS } from '@/constants/platforms';
import Link from 'next/link';
import { getCafeLinks, getCafeWaitlistCount } from '@/lib/api/seo';
import { listCafeReviews } from '@/lib/api/reviews';
import { customerPrice, formatTime, isOpen24h, titleCaseCity } from '@/lib/format';
import { hourlyOffer } from '@/lib/offers';
import { cleanName, venueArea, venueKind } from '@/lib/venueKind';
import { SeoLinkGroups } from '@/components/customer/SeoLinkGroups';
import type { CafeDetail } from '@/types';
import { CafeDetailClient } from './CafeDetailClient';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

/** "?promoCode=X&utm_source=ig" from the incoming URL, so a redirect never drops
 *  an offer code or ad-attribution tags. */
function queryString(sp: Record<string, string | string[] | undefined> | undefined): string {
  const out = new URLSearchParams();
  for (const [key, value] of Object.entries(sp ?? {})) {
    for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) out.append(key, v);
  }
  const qs = out.toString();
  return qs ? `?${qs}` : '';
}

// React's cache() memoizes per-request, so generateMetadata and the page body
// (both of which need the same café) only hit the backend once per request.
// `null` = couldn't load (backend blip: render the client fallback, which
// retries); 'missing' = the API says there is no such café (a real 404, so
// Google drops the URL instead of indexing an empty "not found" page).
const getCafeCached = cache(async (id: string): Promise<CafeDetail | null | 'missing'> => {
  try {
    const res = await getCafe(id);
    return res.cafe;
  } catch (err) {
    return err instanceof ApiError && err.status === 404 ? 'missing' : null;
  }
});

/** "Offers: ₹80 off Mon–Thu 10 AM–2 PM; 25% off Fri–Sun 10 AM–2 PM." Up to two distinct ones, as the café page shows them. */
function promoSummary(promos: CafeDetail['activePromotions']): string {
  const seen = new Set<string>();
  const parts: string[] = [];
  for (const p of promos ?? []) {
    if (!p.label) continue;
    const text = `${p.label}${p.when ? ` ${p.when.replace(' · ', ' ')}` : ''}`;
    if (seen.has(text)) continue;
    seen.add(text);
    parts.push(text);
    if (parts.length === 2) break;
  }
  return parts.length ? ` Offers: ${parts.join('; ')}.` : '';
}

/**
 * The lowest hourly price a player can really get from a recurring offer (a weekday-morning
 * ₹80 off, a 25% happy hour), whether or not its window is open right now. The title says
 * "from ₹99/hr" only together with when that price applies, never as the all-day price.
 * Offers are not stacked; each applies to its own setup (or all setups) for a 1-hour booking.
 */
function lowestOfferPrice(
  tiers: CafeDetail['tiers'],
  promos: CafeDetail['activePromotions'],
): { price: number; when: string | null } | null {
  let best: { price: number; when: string | null } | null = null;
  for (const t of tiers ?? []) {
    const regular = t.pricePerHour;
    if (!(regular > 0)) continue;
    for (const p of promos ?? []) {
      if (p.isActive === false || p.slotsRemaining === 0) continue;
      if (p.applicableTierId && p.applicableTierId !== t.id) continue;
      if ((p.minBookingMinutes ?? 0) > 60) continue;
      let raw: number | null = null;
      if (p.promotionType === 'percentage' && (p.discountPercentage ?? 0) > 0) {
        raw = Math.round(regular * (1 - (p.discountPercentage as number) / 100));
      } else if (p.promotionType === 'fixed_amount' && (p.fixedDiscountAmount ?? 0) > 0) {
        raw = regular - Number(p.fixedDiscountAmount);
      } else if (
        p.promotionType === 'fixed_price' &&
        Math.round(Number(p.minDurationHours ?? 0) * 60) === 60 &&
        p.fixedPriceAmount != null
      ) {
        raw = Number(p.fixedPriceAmount);
      }
      if (raw == null || !(raw > 0) || raw >= regular) continue;
      const price = customerPrice(raw);
      if (best == null || price < best.price) best = { price, when: p.when ? p.when.replace(' · ', ' ') : null };
    }
  }
  return best;
}

const getCafeLinksCached = cache((cafeId: string) => getCafeLinks(cafeId).catch(() => null));
const getWaitlistCountCached = cache((cafeId: string) => getCafeWaitlistCount(cafeId).catch(() => null));

/** Below this, "N players want it" reads as a weakness, not proof — the same
 *  >= 5 rule the explore card applies to the vote count. */
const WAITLIST_SHOW_MIN = 5;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const loaded = await getCafeCached(id);
  const cafe = loaded === 'missing' ? null : loaded;

  if (!cafe) {
    return { title: 'Café not found' };
  }
  const waitlist = cafe.isLeadListing ? await getWaitlistCountCached(cafe.id) : null;

  // The price the café page and checkout show (live offer, KHEL-O's ₹1 off),
  // so Google never says "from ₹150" for a ₹119 setup. Booking Soon prices
  // come from research and stay as found.
  const minPrice = cafe.tiers && cafe.tiers.length > 0
    ? Math.min(...cafe.tiers.map((t) => (cafe.isLeadListing
      ? t.pricePerHour
      : customerPrice(hourlyOffer(t.pricePerHour, t.activePromotion)?.price ?? t.pricePerHour))))
    : null;
  // The cheapest true price from a recurring offer, shown with when it applies.
  const deal = cafe.isLeadListing ? null : lowestOfferPrice(cafe.tiers, cafe.activePromotions);
  const headlinePrice = deal && minPrice != null && deal.price < minPrice ? deal : null;
  // Human labels ("PlayStation, PC Gaming"), not raw enum values.
  const platformLabels = Array.from(new Set((cafe.tiers ?? []).map((t) => t.platform).filter(Boolean)))
    .map((p) => PLATFORMS.find((x) => x.value === p)?.label)
    .filter((label): label is string => !!label && label !== 'Other');

  // "Snooker Syndicate, Alwal — Snooker & Pool in Hyderabad": what the place
  // is and where, in the words people search with.
  const name = cleanName(cafe.name);
  const city = titleCaseCity(cafe.city);
  const area = venueArea(cafe.addressLine2);
  const kind = venueKind({ name, tiers: cafe.tiers });
  const where = area ? `${area}, ${city}` : city;
  const facts = [
    headlinePrice
      ? `From ₹${headlinePrice.price}/hr${headlinePrice.when ? ` (${headlinePrice.when})` : ' in off-peak slots'}, ₹${minPrice}/hr otherwise`
      : minPrice ? `From ₹${minPrice}/hr` : null,
    cafe.openingTime && cafe.closingTime ? (isOpen24h(cafe.openingTime, cafe.closingTime) ? 'open 24 hours' : `open ${formatTime(cafe.openingTime)}–${formatTime(cafe.closingTime)}`) : null,
    platformLabels.length > 0 ? platformLabels.join(', ') : null,
    // Reviews left on KHEL-O itself, so quoting them is ours to make.
    cafe.totalReviews > 0 && cafe.averageRating > 0
      ? `rated ${Number(cafe.averageRating).toFixed(1)}★ (${cafe.totalReviews} review${cafe.totalReviews === 1 ? '' : 's'})`
      : null,
  ].filter(Boolean).join(', ');
  const factLine = facts ? ` ${facts.charAt(0).toUpperCase()}${facts.slice(1)}.` : '';
  const offerLine = cafe.isLeadListing ? '' : promoSummary(cafe.activePromotions);

  // A bookable venue leads with what only KHEL-O offers in that results
  // list (JustDial, Instagram and the café's own listing can't take a
  // booking): "Rockstar Gaming Cafe, Bowenpally — Book Online from ₹140/hr".
  // A Booking Soon listing can't be booked, so it keeps the descriptive
  // "— Snooker & Pool in Hyderabad" form.
  const place = `${name}${area ? `, ${area}` : ''}`;
  const title = cafe.isLeadListing
    ? `${place} — ${kind.label} in ${city}`
    : `${place} — Book Online${headlinePrice ? ` from ₹${headlinePrice.price}/hr` : minPrice ? ` from ₹${minPrice}/hr` : ''}`;
  // A Booking Soon listing can't be booked yet; never say it can.
  const description = `${kind.label} at ${name}, ${where}.${factLine}${offerLine} ${
    cafe.isLeadListing
      ? (waitlist?.count ?? 0) >= WAITLIST_SHOW_MIN
        ? `${waitlist!.count} players want to book it online — add your vote and get notified when it opens on KHEL-O.`
        : 'Online booking on KHEL-O is coming soon: see the location and photos, and get notified.'
      : 'See live availability and book online on KHEL-O.'
  }`;
  const image = cafe.photos && cafe.photos.length > 0 ? cafe.photos[0].url : undefined;

  return {
    title,
    description,
    alternates: {
      canonical: cafePath(cafe),
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${cafePath(cafe)}`,
      // A page-level openGraph replaces the site default wholesale, so the
      // fallback share image has to be repeated here.
      images: [{ url: image ?? '/og/khelo-share.png' }],
    },
  };
}

export default async function CafeDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const loaded = await getCafeCached(id);
  if (loaded === 'missing') notFound();
  const cafe = loaded;

  // Old /cafe/<uuid> links (shared, bookmarked, already indexed) move
  // permanently to the readable URL so search engines transfer their ranking.
  if (cafe?.slug && isCafeUuid(id)) permanentRedirect(`${cafePath(cafe)}${queryString(await searchParams)}`);

  // Café → locality → game/hardware pages → nearby cafés, so every café is
  // linked into the rest of the site (no orphan pages) and vice versa.
  const [links, waitlist, reviews] = await Promise.all([
    cafe ? getCafeLinksCached(cafe.id) : null,
    cafe?.isLeadListing ? getWaitlistCountCached(cafe.id) : null,
    // The latest written reviews go into the page's structured data, so
    // search engines and AI answer engines can read and quote them (the
    // review list on screen loads in the browser, which they often skip).
    cafe && cafe.totalReviews > 0 ? listCafeReviews(cafe.id, { limit: 10 }).catch(() => null) : null,
  ]);

  const kind = cafe ? venueKind({ name: cafe.name, tiers: cafe.tiers }) : null;
  const area = cafe ? venueArea(cafe.addressLine2) : null;
  const jsonLd = cafe && kind
    ? {
        '@context': 'https://schema.org',
        '@type': kind.schemaType,
        name: cleanName(cafe.name),
        description: cafe.description || `${kind.label} in ${area ? `${area}, ` : ''}${titleCaseCity(cafe.city)}`,
        url: `${SITE_URL}${cafePath(cafe)}`,
        ...(cafe.googleMapsUrl ? { hasMap: cafe.googleMapsUrl } : {}),
        image: cafe.photos && cafe.photos.length > 0 ? cafe.photos.map((p) => p.url) : undefined,
        telephone: cafe.phoneNumber || undefined,
        address: {
          '@type': 'PostalAddress',
          streetAddress: [cafe.addressLine1, cafe.addressLine2].filter(Boolean).join(', '),
          addressLocality: titleCaseCity(cafe.city),
          addressRegion: cafe.state,
          postalCode: cafe.pincode || undefined,
          addressCountry: 'IN',
        },
        geo: cafe.latitude != null && cafe.longitude != null
          ? { '@type': 'GeoCoordinates', latitude: cafe.latitude, longitude: cafe.longitude }
          : undefined,
        // Same hours every day — that's all the café model stores. Lets Google
        // show "Open now" and match "open late" searches.
        ...(cafe.openingTime && cafe.closingTime
          ? {
              openingHoursSpecification: {
                '@type': 'OpeningHoursSpecification',
                dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                // Google reads 00:00 to 23:59 as open all day.
                opens: isOpen24h(cafe.openingTime, cafe.closingTime) ? '00:00' : cafe.openingTime.slice(0, 5),
                closes: isOpen24h(cafe.openingTime, cafe.closingTime) ? '23:59' : cafe.closingTime.slice(0, 5),
              },
            }
          : {}),
        ...(cafe.totalReviews > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: cafe.averageRating,
                reviewCount: cafe.totalReviews,
                bestRating: 5,
                worstRating: 1,
              },
              review: (reviews?.items ?? [])
                .filter((r) => r.comment && r.comment.trim().length > 0)
                .map((r) => ({
                  '@type': 'Review',
                  author: { '@type': 'Person', name: r.gamerName },
                  datePublished: r.createdAt.slice(0, 10),
                  reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5, worstRating: 1 },
                  reviewBody: r.comment,
                })),
            }
          : {}),
        ...(cafe.tiers && cafe.tiers.length > 0
          ? {
              priceRange: cafe.isLeadListing
                ? `₹${Math.min(...cafe.tiers.map((t) => t.pricePerHour))}-₹${Math.max(...cafe.tiers.map((t) => t.pricePerHour))} per hour`
                : `₹${Math.min(...cafe.tiers.map((t) => customerPrice(t.pricePerHour)))}-₹${Math.max(...cafe.tiers.map((t) => customerPrice(t.pricePerHour)))} per hour`,
            }
          : {}),
      }
    : null;

  // Shown by Google in place of the raw URL: KHEL-O › Hyderabad › Rockstar.
  const breadcrumbJsonLd =
    cafe && links
      ? {
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'KHEL-O', item: `${SITE_URL}/` },
            { '@type': 'ListItem', position: 2, name: links.city.name, item: `${SITE_URL}${links.city.path}` },
            { '@type': 'ListItem', position: 3, name: cleanName(cafe.name), item: `${SITE_URL}${cafePath(cafe)}` },
          ],
        }
      : null;

  return (
    <>
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
        />
      )}
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <CafeDetailClient initialCafe={cafe ?? undefined} initialWaitlist={waitlist ?? undefined} />
      {links && (
        <div className="mx-auto flex max-w-4xl flex-col gap-6 border-t border-border pb-28 pt-8 mt-4">
          <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
            <Link href="/browse" className="hover:text-primary">All cities</Link> /{' '}
            <Link href={links.city.path} className="hover:text-primary">{links.city.name}</Link> / {cafe?.name}
          </nav>
          {links.nearby.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-heading text-h2 text-text-primary">Nearby places to play</h2>
              <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
                {links.nearby.map((n) => (
                  <li key={n.id}>
                    <Link href={n.path} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface">
                      <span className="font-semibold text-text-primary">{n.name}</span>
                      <span className="text-caption text-text-secondary whitespace-nowrap">
                        {n.km} km{n.minPrice != null ? ` · from ₹${n.minPrice}/hr` : ''}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <SeoLinkGroups links={links.facets} title={`More in ${links.city.name}`} />
          <Link href={links.city.path} className="text-body font-semibold text-primary-dark hover:underline">
            Gaming cafés, snooker &amp; bowling in {links.city.name} →
          </Link>
        </div>
      )}
    </>
  );
}

import { cache } from 'react';
import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { ApiError } from '@/lib/api/errors';
import { getCafe, cafePath, isCafeUuid } from '@/lib/api/cafes';
import { PLATFORMS } from '@/constants/platforms';
import Link from 'next/link';
import { getCafeLinks, getCafeWaitlistCount } from '@/lib/api/seo';
import { formatTime, titleCaseCity } from '@/lib/format';
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

  const minPrice = cafe.tiers && cafe.tiers.length > 0 ? Math.min(...cafe.tiers.map((t) => t.pricePerHour)) : null;
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
    minPrice ? `From ₹${minPrice}/hr` : null,
    cafe.openingTime && cafe.closingTime ? `open ${formatTime(cafe.openingTime)}–${formatTime(cafe.closingTime)}` : null,
    platformLabels.length > 0 ? platformLabels.join(', ') : null,
    // Reviews left on KHEL-O itself, so quoting them is ours to make.
    cafe.totalReviews > 0 && cafe.averageRating > 0
      ? `rated ${Number(cafe.averageRating).toFixed(1)}★ (${cafe.totalReviews} review${cafe.totalReviews === 1 ? '' : 's'})`
      : null,
  ].filter(Boolean).join(', ');
  const factLine = facts ? ` ${facts.charAt(0).toUpperCase()}${facts.slice(1)}.` : '';

  // A bookable venue leads with what only KHEL-O offers in that results
  // list (JustDial, Instagram and the café's own listing can't take a
  // booking): "Rockstar Gaming Cafe, Bowenpally — Book Online from ₹140/hr".
  // A Booking Soon listing can't be booked, so it keeps the descriptive
  // "— Snooker & Pool in Hyderabad" form.
  const place = `${name}${area ? `, ${area}` : ''}`;
  const title = cafe.isLeadListing
    ? `${place} — ${kind.label} in ${city}`
    : `${place} — Book Online${minPrice ? ` from ₹${minPrice}/hr` : ''}`;
  // A Booking Soon listing can't be booked yet; never say it can.
  const description = `${kind.label} at ${name}, ${where}.${factLine} ${
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
  const links = cafe ? await getCafeLinksCached(cafe.id) : null;
  const waitlist = cafe?.isLeadListing ? await getWaitlistCountCached(cafe.id) : null;

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
                opens: cafe.openingTime.slice(0, 5),
                closes: cafe.closingTime.slice(0, 5),
              },
            }
          : {}),
        ...(cafe.totalReviews > 0
          ? {
              aggregateRating: {
                '@type': 'AggregateRating',
                ratingValue: cafe.averageRating,
                reviewCount: cafe.totalReviews,
              },
            }
          : {}),
        ...(cafe.tiers && cafe.tiers.length > 0
          ? { priceRange: `₹${Math.min(...cafe.tiers.map((t) => t.pricePerHour))}-₹${Math.max(...cafe.tiers.map((t) => t.pricePerHour))} per hour` }
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
          <Link href={links.city.path} className="text-body font-semibold text-primary hover:underline">
            Gaming cafés, snooker &amp; bowling in {links.city.name} →
          </Link>
        </div>
      )}
    </>
  );
}

import { cache } from 'react';
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { getCafe, cafePath, isCafeUuid } from '@/lib/api/cafes';
import { PLATFORMS } from '@/constants/platforms';
import Link from 'next/link';
import { getCafeLinks } from '@/lib/api/seo';
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
const getCafeCached = cache(async (id: string): Promise<CafeDetail | null> => {
  try {
    const res = await getCafe(id);
    return res.cafe;
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const cafe = await getCafeCached(id);

  if (!cafe) {
    return { title: 'Café not found' };
  }

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
  ].filter(Boolean).join(', ');
  const factLine = facts ? ` ${facts.charAt(0).toUpperCase()}${facts.slice(1)}.` : '';

  const title = `${name}${area ? `, ${area}` : ''} — ${kind.label} in ${city}`;
  // A Booking Soon listing can't be booked yet; never say it can.
  const description = `${kind.label} at ${name}, ${where}.${factLine} ${
    cafe.isLeadListing
      ? 'Online booking on KHEL-O is coming soon: see the location and photos, and get notified.'
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
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default async function CafeDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const cafe = await getCafeCached(id);

  // Old /cafe/<uuid> links (shared, bookmarked, already indexed) move
  // permanently to the readable URL so search engines transfer their ranking.
  if (cafe?.slug && isCafeUuid(id)) permanentRedirect(`${cafePath(cafe)}${queryString(await searchParams)}`);

  // Café → locality → game/hardware pages → nearby cafés, so every café is
  // linked into the rest of the site (no orphan pages) and vice versa.
  const links = cafe ? await getCafeLinks(cafe.id).catch(() => null) : null;

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

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <CafeDetailClient initialCafe={cafe ?? undefined} />
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

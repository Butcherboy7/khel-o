import { cache } from 'react';
import type { Metadata } from 'next';
import { permanentRedirect } from 'next/navigation';
import { getCafe, cafePath, isCafeUuid } from '@/lib/api/cafes';
import { PLATFORMS } from '@/constants/platforms';
import Link from 'next/link';
import { getCafeLinks } from '@/lib/api/seo';
import { SeoLinkGroups } from '@/components/customer/SeoLinkGroups';
import type { CafeDetail } from '@/types';
import { CafeDetailClient } from './CafeDetailClient';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

interface PageProps {
  params: Promise<{ id: string }>;
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
  const priceLine = minPrice ? ` Starting from ₹${minPrice}/hr.` : '';
  // Human labels ("PlayStation, PC Gaming"), not raw enum values.
  const platformLabels = Array.from(new Set((cafe.tiers ?? []).map((t) => t.platform).filter(Boolean)))
    .map((p) => PLATFORMS.find((x) => x.value === p)?.label)
    .filter((label): label is string => !!label && label !== 'Other');
  const platformLine = platformLabels.length > 0 ? ` ${platformLabels.join(', ')}.` : '';

  const title = `${cafe.name} — Gaming Café in ${cafe.city}`;
  const description = `Book a gaming station at ${cafe.name} in ${cafe.city}.${priceLine}${platformLine} Check real-time availability and pay online on KHEL-O.`;
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

export default async function CafeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cafe = await getCafeCached(id);

  // Old /cafe/<uuid> links (shared, bookmarked, already indexed) move
  // permanently to the readable URL so search engines transfer their ranking.
  if (cafe?.slug && isCafeUuid(id)) permanentRedirect(cafePath(cafe));

  // Café → locality → game/hardware pages → nearby cafés, so every café is
  // linked into the rest of the site (no orphan pages) and vice versa.
  const links = cafe ? await getCafeLinks(cafe.id).catch(() => null) : null;

  const jsonLd = cafe
    ? {
        '@context': 'https://schema.org',
        '@type': 'SportsActivityLocation',
        name: cafe.name,
        description: cafe.description || `Gaming café in ${cafe.city}`,
        url: `${SITE_URL}${cafePath(cafe)}`,
        image: cafe.photos && cafe.photos.length > 0 ? cafe.photos.map((p) => p.url) : undefined,
        telephone: cafe.phoneNumber || undefined,
        address: {
          '@type': 'PostalAddress',
          streetAddress: cafe.addressLine1,
          addressLocality: cafe.city,
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
        <div className="flex flex-col gap-6 pt-8 pb-28 border-t border-border mt-8">
          <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
            <Link href="/browse" className="hover:text-primary">All cities</Link> /{' '}
            <Link href={links.city.path} className="hover:text-primary">{links.city.name}</Link> / {cafe?.name}
          </nav>
          {links.nearby.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="font-heading text-h2 text-text-primary">Nearby gaming cafés</h2>
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
            See all gaming cafés in {links.city.name} →
          </Link>
        </div>
      )}
    </>
  );
}

import { cache } from 'react';
import type { Metadata } from 'next';
import { getCafe } from '@/lib/api/cafes';
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
  const platformLine = cafe.tiers && cafe.tiers.length > 0
    ? ` ${Array.from(new Set(cafe.tiers.map((t) => t.platform).filter(Boolean))).join(', ')}.`
    : '';

  const title = `${cafe.name} — Gaming Café in ${cafe.city}`;
  const description = `Book a gaming station at ${cafe.name} in ${cafe.city}.${priceLine}${platformLine} Check real-time availability and pay online on KHEL-O.`;
  const image = cafe.photos && cafe.photos.length > 0 ? cafe.photos[0] : undefined;

  return {
    title,
    description,
    alternates: {
      canonical: `/cafe/${cafe.id}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/cafe/${cafe.id}`,
      images: image ? [{ url: image }] : undefined,
    },
  };
}

export default async function CafeDetailPage({ params }: PageProps) {
  const { id } = await params;
  const cafe = await getCafeCached(id);

  const jsonLd = cafe
    ? {
        '@context': 'https://schema.org',
        '@type': 'SportsActivityLocation',
        name: cafe.name,
        description: cafe.description || `Gaming café in ${cafe.city}`,
        url: `${SITE_URL}/cafe/${cafe.id}`,
        image: cafe.photos && cafe.photos.length > 0 ? cafe.photos : undefined,
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
    </>
  );
}

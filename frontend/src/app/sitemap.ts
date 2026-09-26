import type { MetadataRoute } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { citySlug } from '@/constants/cities';
import { activitiesFor } from '@/lib/seoActivities';
import type { CafeListItem } from '@/types';

import { getPublicEnv } from '@/lib/runtimeEnv';

// Without this, Next statically prerenders this route once at `next build`
// time — inside an isolated builder container with no network path to the
// backend at all — freezing the sitemap at just the static routes below.
export const dynamic = 'force-dynamic';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
  { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE_URL}/partner`, changeFrequency: 'monthly', priority: 0.7 },
  { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.3 },
  { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/refund-policy`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/shipping-policy`, changeFrequency: 'yearly', priority: 0.2 },
];

// Verified cafés only, capped at a sane page count so a fetch failure or a
// runaway café count can't hang sitemap generation — revisit the cap if
// the live café count ever approaches it.
const MAX_PAGES = 20;

interface CafeUrlsResult {
  cafeUrls: MetadataRoute.Sitemap;
  cityUrls: MetadataRoute.Sitemap;
}

async function getCafeUrls(): Promise<CafeUrlsResult> {
  const cafeUrls: MetadataRoute.Sitemap = [];
  const byCity = new Map<string, CafeListItem[]>();

  try {
    let page = 1;
    let totalPages = 1;

    do {
      const result = await listCafes({ page, limit: 50 });
      for (const cafe of result.items) {
        cafeUrls.push({
          url: `${SITE_URL}${cafePath(cafe)}`,
          changeFrequency: 'weekly',
          priority: 0.8,
        });
        byCity.set(cafe.city, [...(byCity.get(cafe.city) ?? []), cafe]);
      }
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages && page <= MAX_PAGES);
  } catch {
    // Backend unreachable at build/request time — ship the static routes
    // rather than failing the whole sitemap.
  }

  // City pages, plus a page per activity that at least one café there offers
  // (same rule the /cafes/<city>/<activity> route uses to 404 empty combos).
  const cityUrls: MetadataRoute.Sitemap = Array.from(byCity.entries()).flatMap(([city, cafes]) => [
    { url: `${SITE_URL}/cafes/${citySlug(city)}`, changeFrequency: 'weekly' as const, priority: 0.9 },
    ...activitiesFor(cafes).map(({ activity }) => ({
      url: `${SITE_URL}/cafes/${citySlug(city)}/${activity.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    })),
  ]);

  return { cafeUrls, cityUrls };
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { cafeUrls, cityUrls } = await getCafeUrls();
  return [...STATIC_ROUTES, ...cityUrls, ...cafeUrls];
}

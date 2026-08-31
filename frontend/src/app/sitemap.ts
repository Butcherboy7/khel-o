import type { MetadataRoute } from 'next';
import { listCafes } from '@/lib/api/cafes';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
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

async function getCafeUrls(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [];

  try {
    let page = 1;
    let totalPages = 1;

    do {
      const result = await listCafes({ page, limit: 50 });
      for (const cafe of result.items) {
        urls.push({
          url: `${SITE_URL}/cafe/${cafe.id}`,
          changeFrequency: 'weekly',
          priority: 0.8,
        });
      }
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages && page <= MAX_PAGES);
  } catch {
    // Backend unreachable at build/request time — ship the static routes
    // rather than failing the whole sitemap.
  }

  return urls;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const cafeUrls = await getCafeUrls();
  return [...STATIC_ROUTES, ...cafeUrls];
}

import type { MetadataRoute } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { getSeoPages } from '@/lib/api/seo';

import { getPublicEnv } from '@/lib/runtimeEnv';

// Without this, Next statically prerenders this route once at `next build`
// time — inside an isolated builder container with no network path to the
// backend at all — freezing the sitemap at just the static routes below.
export const dynamic = 'force-dynamic';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

const STATIC_ROUTES: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/`, changeFrequency: 'daily', priority: 1 },
  { url: `${SITE_URL}/browse`, changeFrequency: 'weekly', priority: 0.6 },
  { url: `${SITE_URL}/about`, changeFrequency: 'monthly', priority: 0.5 },
  { url: `${SITE_URL}/partner`, changeFrequency: 'monthly', priority: 0.7 },
  { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.3 },
  { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/refund-policy`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/shipping-policy`, changeFrequency: 'yearly', priority: 0.2 },
];

// Café pages come from the public list; every landing page (city, platform,
// game, GPU, price) comes from the SEO service, which only returns pages that
// pass its eligibility rules — thin and duplicate combinations never appear.
const MAX_PAGES = 20;

async function getCafeUrls(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [];
  try {
    let page = 1;
    let totalPages = 1;
    do {
      const result = await listCafes({ page, limit: 50 });
      for (const cafe of result.items) {
        urls.push({ url: `${SITE_URL}${cafePath(cafe)}`, changeFrequency: 'weekly', priority: 0.8 });
      }
      totalPages = result.totalPages;
      page += 1;
    } while (page <= totalPages && page <= MAX_PAGES);
  } catch {
    // Backend unreachable — ship the rest rather than failing the sitemap.
  }
  return urls;
}

async function getLandingUrls(): Promise<MetadataRoute.Sitemap> {
  try {
    return (await getSeoPages()).map((p) => ({
      url: `${SITE_URL}${p.path}`,
      changeFrequency: 'weekly' as const,
      priority: p.type === 'city' ? 0.9 : 0.85,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [landing, cafes] = await Promise.all([getLandingUrls(), getCafeUrls()]);
  return [...STATIC_ROUTES, ...landing, ...cafes];
}

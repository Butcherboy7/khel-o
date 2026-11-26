import type { MetadataRoute } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { getSeoPages } from '@/lib/api/seo';
import { GTA6_CITY_SLUGS } from '@/constants/gta6';
import { GTA6_INTENTS } from '@/constants/gta6Intents';
import { GUIDES } from '@/constants/guides';
import { citySlugToName } from '@/constants/cities';

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
  { url: `${SITE_URL}/gta6`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/gta6/near-me`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/gta6/cities`, changeFrequency: 'daily', priority: 0.8 },
  { url: `${SITE_URL}/gta6/india`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/community`, changeFrequency: 'weekly', priority: 0.5 },
  { url: `${SITE_URL}/challenge/valorant-5v5-xqz`, changeFrequency: 'daily', priority: 0.9 },
  { url: `${SITE_URL}/valorant/hyderabad`, changeFrequency: 'daily', priority: 0.8 },
  { url: `${SITE_URL}/challenge/valorant-5v5-xqz/rules`, changeFrequency: 'weekly', priority: 0.4 },
  { url: `${SITE_URL}/contact`, changeFrequency: 'yearly', priority: 0.3 },
  { url: `${SITE_URL}/terms`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/delete-account`, changeFrequency: 'yearly', priority: 0.1 },
  { url: `${SITE_URL}/refund-policy`, changeFrequency: 'yearly', priority: 0.2 },
  { url: `${SITE_URL}/shipping-policy`, changeFrequency: 'yearly', priority: 0.2 },
];

// Every city has a GTA 6 page (a café list where we have cafés, the launch list and "suggest a café" where we don't).
const GTA6_CITY_URLS: MetadataRoute.Sitemap = GTA6_CITY_SLUGS.map((slug) => ({
  url: `${SITE_URL}/gta6/${slug}`,
  changeFrequency: 'daily' as const,
  priority: ['hyderabad', 'bengaluru', 'mumbai', 'delhi'].includes(slug) ? 0.9 : 0.7,
}));

// Guides: lastModified is the date the article's facts were last checked (constants/guides.ts).
const GUIDE_URLS: MetadataRoute.Sitemap = [
  { url: `${SITE_URL}/guides`, lastModified: new Date('2026-11-24'), changeFrequency: 'weekly', priority: 0.7 },
  ...GUIDES.map((g) => ({ url: `${SITE_URL}/guides/${g.slug}`, lastModified: new Date(g.updated), changeFrequency: 'monthly' as const, priority: 0.7 })),
];

// GTA 6 by what people search for ("free", "with friends", "at night"…).
const GTA6_INTENT_URLS: MetadataRoute.Sitemap = GTA6_INTENTS.map((i) => ({
  url: `${SITE_URL}/gta6/${i.slug}`,
  changeFrequency: 'daily' as const,
  priority: 0.8,
}));

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
    // A café whose city isn't a supported city (a locality typed as the city)
    // gets a landing page the frontend can't open; never advertise one.
    return (await getSeoPages())
      .filter((p) => citySlugToName(p.path.split('/')[2] ?? '') != null)
      .map((p) => ({
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
  return [...STATIC_ROUTES, ...GTA6_CITY_URLS, ...GTA6_INTENT_URLS, ...GUIDE_URLS, ...landing, ...cafes];
}

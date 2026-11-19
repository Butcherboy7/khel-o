import { Suspense } from 'react';
import type { Metadata } from 'next';
import { listCafes, listActivities, cafePath } from '@/lib/api/cafes';
import { ExploreClient } from '@/components/customer/ExploreClient';
import { CampaignWelcome } from '@/components/customer/CampaignWelcome';
import { MyChallengeCard } from '@/components/customer/MyChallengeCard';
import { HomeSections } from '@/components/customer/HomeSections';
import { PopularPages } from '@/components/customer/PopularPages';
import { getSeoPages } from '@/lib/api/seo';
import HomeLoading from './loading';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

// Rendered per request. Prerendered at build time, the page had no café data
// (the builder can't reach the backend) and ExploreClient's useSearchParams
// bailed out to client rendering, so crawlers got a skeleton with no heading.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { absolute: 'KHEL-O: Book Gaming Cafés, Snooker & Bowling in Hyderabad' },
  description:
    'Find gaming cafés, snooker clubs and bowling alleys in Hyderabad. Compare prices and timings, see live availability and book online on KHEL-O.',
  alternates: {
    canonical: '/',
  },
};

// Public route (see (customer)/layout.tsx isPublicPath) — fetched server-side
// so the raw HTML a search/AI crawler receives already contains real café
// names, cities and prices instead of an empty shell that only fills in
// after client-side JavaScript runs. Failure here (backend unreachable) must
// not take the whole homepage down — ExploreClient re-fetches client-side
// regardless and shows its own loading/error states.
async function getInitialCafes() {
  try {
    return await listCafes({ limit: 30 });
  } catch {
    return undefined;
  }
}

// The activity chips row ("All · PC Gaming · PlayStation…") sits above the
// café grid. Fetched only in the browser, it popped in after load and pushed
// every card down (most of the homepage's layout shift).
async function getInitialActivities() {
  try {
    return await listActivities();
  } catch {
    return undefined;
  }
}

export default async function ExplorePage() {
  const [initialCafes, initialActivities, landingPages] = await Promise.all([
    getInitialCafes(),
    getInitialActivities(),
    getSeoPages().catch(() => []),
  ]);

  const itemListJsonLd = initialCafes && initialCafes.items.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: initialCafes.items.map((cafe, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}${cafePath(cafe)}`,
          name: cafe.name,
        })),
      }
    : null;

  return (
    <>
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      {/* The fallback mirrors the explore layout (header, chips, café grid),
          so on a slow load the café area is what appears first. The
          secondary sections are passed in as children and render below the
          grid inside ExploreClient, so they can never jump ahead of it. */}
      <Suspense fallback={null}>
        <CampaignWelcome />
      </Suspense>
      {/* Signed-in players in an upcoming challenge: their day, place and QR. */}
      <MyChallengeCard />
      <Suspense fallback={<HomeLoading />}>
        <ExploreClient initialCafes={initialCafes} initialActivities={initialActivities}>
          <HomeSections />
          <PopularPages pages={landingPages} />
        </ExploreClient>
      </Suspense>
    </>
  );
}

import { Suspense, type ReactNode } from 'react';
import { listCafes, listActivities, cafePath } from '@/lib/api/cafes';
import { ExploreClient } from '@/components/customer/ExploreClient';
import { CampaignWelcome } from '@/components/customer/CampaignWelcome';
import { MyChallengeCard } from '@/components/customer/MyChallengeCard';
import { HomeSections } from '@/components/customer/HomeSections';
import { PopularPages } from '@/components/customer/PopularPages';
import { getSeoPages } from '@/lib/api/seo';
import HomeLoading from '@/app/(customer)/(home)/loading';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

// Fetched server-side so the raw HTML a search/AI crawler receives already
// contains real café names, cities and prices instead of an empty shell.
// Failure here (backend unreachable) must not take the page down:
// ExploreClient re-fetches client-side and shows its own states.
async function getInitialCafes() {
  try {
    return await listCafes({ limit: 30 });
  } catch {
    return undefined;
  }
}

// The activity chips row sits above the café grid. Fetched only in the
// browser, it popped in after load and pushed every card down.
async function getInitialActivities() {
  try {
    return await listActivities();
  } catch {
    return undefined;
  }
}

interface HomeScreenProps {
  /** Shown right under the search bar (the GTA 6 block). */
  top?: ReactNode;
  /** True when `top` holds the page's visible h1. */
  hideHeading?: boolean;
  /** Extra page content below the home sections (a search page's answer + FAQ). */
  after?: ReactNode;
}

/**
 * The KHEL-O home screen: search, tabs, café grid, then the home sections.
 * Used by "/" and by every GTA 6 search page, so a visitor from Google lands
 * on the real app, not a separate text page.
 */
export async function HomeScreen({ top, hideHeading = false, after }: HomeScreenProps) {
  const [initialCafes, initialActivities, landingPages] = await Promise.all([
    getInitialCafes(),
    getInitialActivities(),
    getSeoPages().catch(() => []),
  ]);

  const itemListJsonLd =
    initialCafes && initialCafes.items.length > 0
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
      {itemListJsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />}
      {/* The fallback mirrors the explore layout (header, chips, café grid),
          so on a slow load the café area is what appears first. */}
      <Suspense fallback={null}>
        <CampaignWelcome />
      </Suspense>
      {/* Signed-in players in an upcoming challenge: their day, place and QR. */}
      <MyChallengeCard />
      <Suspense fallback={<HomeLoading />}>
        <ExploreClient initialCafes={initialCafes} initialActivities={initialActivities} top={top} hideHeading={hideHeading}>
          <HomeSections />
          {after}
          <PopularPages pages={landingPages} />
        </ExploreClient>
      </Suspense>
    </>
  );
}

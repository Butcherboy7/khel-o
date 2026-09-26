import { Suspense } from 'react';
import type { Metadata } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { ExploreClient } from '@/components/customer/ExploreClient';
import { HomeSections } from '@/components/customer/HomeSections';
import { SkeletonCafeGrid } from '@/components/ui/Skeleton';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

export const metadata: Metadata = {
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

export default async function ExplorePage() {
  const initialCafes = await getInitialCafes();

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
      <Suspense fallback={<ExploreFallback />}>
        <ExploreClient initialCafes={initialCafes}>
          <HomeSections />
        </ExploreClient>
      </Suspense>
    </>
  );
}

function ExploreFallback() {
  return (
    <div className="flex flex-col gap-4 max-w-wide mx-auto" aria-busy="true">
      <div className="flex flex-col gap-2.5">
        <div className="h-8 w-64 max-w-full rounded-lg bg-border/60 animate-pulse" />
        <div className="h-12 w-full rounded-full bg-border/60 animate-pulse" />
        <div className="h-9 w-72 max-w-full rounded-full bg-border/60 animate-pulse" />
      </div>
      <SkeletonCafeGrid count={6} />
    </div>
  );
}

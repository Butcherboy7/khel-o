import type { ReactNode } from 'react';
import { listCafes } from '@/lib/api/cafes';
import { getSeoPages, type SeoIndexEntry } from '@/lib/api/seo';
import type { CafeListItem } from '@/types';
import { ExploreHub } from '@/components/customer/ExploreHub';

/** Every café (paged) and every landing page, for the Explore tab. */
export async function loadExplore(): Promise<{ pages: SeoIndexEntry[]; cafes: CafeListItem[]; cities: string[] }> {
  const [pages, cafes] = await Promise.all([
    getSeoPages().catch(() => [] as SeoIndexEntry[]),
    (async () => {
      const all: CafeListItem[] = [];
      try {
        for (let page = 1; page <= 20; page++) {
          const res = await listCafes({ page, limit: 50 });
          all.push(...res.items);
          if (page >= res.totalPages) break;
        }
      } catch {
        // Partial list beats no page.
      }
      return all;
    })(),
  ]);
  const cities = pages
    .filter((p) => p.type === 'city')
    .sort((a, b) => b.cafeCount - a.cafeCount || a.city.localeCompare(b.city))
    .map((p) => p.city);
  return { pages, cafes, cities };
}

/**
 * The Explore tab: an optional block on top (the GTA 6 cafés), then the hub
 * (happening now, browse by game, cafés), then anything the page adds.
 */
export function ExploreScreen({
  top,
  cafes,
  cities,
  children,
}: {
  top?: ReactNode;
  cafes: CafeListItem[];
  cities: string[];
  children?: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col gap-8 py-6">
      {top}
      <ExploreHub cafes={cafes} cities={cities} />
      {children}
    </div>
  );
}

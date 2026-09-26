import Link from 'next/link';
import type { Metadata } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { getSeoPages, FACET_GROUP_LABELS, type SeoIndexEntry } from '@/lib/api/seo';
import type { CafeListItem } from '@/types';

// HTML sitemap: one crawlable page linking every indexable landing page and
// every café, so nothing is an orphan even if no other page links to it.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Browse All Gaming Cafés by City, Game & Hardware',
  description:
    'Every gaming café on KHEL-O, grouped by city, with pages by platform, game, graphics card and price. Book online.',
  alternates: { canonical: '/browse' },
};

async function load() {
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
  return { pages, cafes };
}

export default async function BrowsePage() {
  const { pages, cafes } = await load();

  const cities = pages
    .filter((p) => p.type === 'city')
    .sort((a, b) => b.cafeCount - a.cafeCount || a.city.localeCompare(b.city));

  return (
    <div className="max-w-5xl mx-auto w-full flex flex-col gap-8 py-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-heading text-h1 text-text-primary">Browse all gaming cafés</h1>
        <p className="text-body text-text-secondary">
          {cafes.length} venue{cafes.length === 1 ? '' : 's'} across {cities.length} cit{cities.length === 1 ? 'y' : 'ies'}.
        </p>
      </header>

      {cities.map((cityPage) => {
        const facetPages = pages.filter((p) => p.type !== 'city' && p.city === cityPage.city);
        const cityCafes = cafes.filter((c) => c.city.trim().toLowerCase() === cityPage.city.toLowerCase());
        return (
          <section key={cityPage.path} className="flex flex-col gap-3 border-t border-border pt-5">
            <h2 className="font-heading text-h2 text-text-primary">
              <Link href={cityPage.path} className="hover:text-primary">
                Gaming cafés in {cityPage.city}
              </Link>{' '}
              <span className="text-body font-normal text-text-secondary">({cityPage.cafeCount})</span>
            </h2>

            {(['activity', 'game', 'gpu', 'price'] as const).map((type) => {
              const items = facetPages.filter((p) => p.type === type);
              if (items.length === 0) return null;
              return (
                <div key={type} className="flex flex-col gap-1">
                  <span className="text-overline uppercase tracking-wider text-text-secondary">{FACET_GROUP_LABELS[type]}</span>
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body">
                    {items.map((p) => (
                      <li key={p.path}>
                        <Link href={p.path} className="text-primary hover:underline">
                          {p.title.replace(` in ${cityPage.city}`, '')}
                        </Link>{' '}
                        <span className="text-caption text-text-secondary">({p.cafeCount})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}

            {cityCafes.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-overline uppercase tracking-wider text-text-secondary">Venues</span>
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-body">
                  {cityCafes.map((c) => (
                    <li key={c.id}>
                      <Link href={cafePath(c)} className="text-text-primary hover:text-primary">
                        {c.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

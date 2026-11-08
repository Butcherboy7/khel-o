import Link from 'next/link';
import type { Metadata } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { getSeoPages, FACET_GROUP_LABELS, type SeoIndexEntry } from '@/lib/api/seo';
import type { CafeListItem } from '@/types';
import { DropSpotlight } from '@/components/customer/HomeTabs';

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
        <h1 className="font-heading text-h1 text-text-primary">Explore gaming cafés</h1>
        <p className="text-body text-text-secondary">
          {cafes.length} venue{cafes.length === 1 ? '' : 's'} across {cities.length} cit{cities.length === 1 ? 'y' : 'ies'}.
        </p>
      </header>

      <DropSpotlight />

      <section className="flex flex-col gap-3" aria-label="Book a café">
        <h2 className="font-heading text-h2 text-text-primary">Book a café now</h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {cafes.map((c) => (
            <li key={c.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
              <Link href={cafePath(c)} className="min-w-0 flex-1">
                <span className="block truncate font-heading text-body-emphasis font-bold text-text-primary">{c.name}</span>
                <span className="block truncate text-caption text-text-secondary">{c.city}</span>
              </Link>
              {c.isLeadListing ? (
                <Link href={cafePath(c)} className="flex h-11 flex-shrink-0 items-center rounded-xl border border-border px-4 text-body font-semibold text-text-secondary">
                  Booking soon
                </Link>
              ) : (
                <Link
                  href={`/bookings/new?cafeId=${c.id}`}
                  className="flex h-11 flex-shrink-0 items-center rounded-xl bg-primary px-4 text-body font-bold text-white"
                >
                  Book now
                </Link>
              )}
            </li>
          ))}
        </ul>
      </section>

      <h2 className="font-heading text-h2 text-text-primary">Find by city, game or price</h2>

      {cities.map((cityPage) => {
        const facetPages = pages.filter((p) => p.type !== 'city' && p.city === cityPage.city);
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

          </section>
        );
      })}
    </div>
  );
}

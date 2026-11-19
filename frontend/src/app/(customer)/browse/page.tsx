import Link from 'next/link';
import type { Metadata } from 'next';
import { cafePath } from '@/lib/api/cafes';
import { FACET_GROUP_LABELS } from '@/lib/api/seo';
import { ExploreScreen, loadExplore } from '@/components/customer/ExploreScreen';
import { Gta6Block } from '@/components/gta6/Gta6Block';
import { getGta6Cafes } from '@/lib/gta6Live';

// HTML sitemap: one crawlable page linking every indexable landing page and
// every café, so nothing is an orphan even if no other page links to it.

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Browse All Gaming Cafés by City, Game & Hardware',
  description:
    'Every gaming café on KHEL-O, grouped by city, with pages by platform, game, graphics card and price. Book online.',
  alternates: { canonical: '/browse' },
};

export default async function BrowsePage() {
  const [{ pages, cafes }, gta6] = await Promise.all([loadExplore(), getGta6Cafes()]);

  const cities = pages
    .filter((p) => p.type === 'city')
    .sort((a, b) => b.cafeCount - a.cafeCount || a.city.localeCompare(b.city));

  return (
    <ExploreScreen
      cafes={cafes}
      cities={cities.map((c) => c.city)}
      top={
        <>
          <h1 className="sr-only">Explore gaming cafés, drops, challenges and the community on KHEL-O</h1>
          {/* While GTA 6 cafés are live, Explore opens with them. */}
          {gta6.length > 0 && <Gta6Block cafes={gta6} heading="GTA 6 is out. Play it at a café near you." source="explore" />}
        </>
      }
    >

      <p className="text-body text-text-secondary">
        {cafes.length} venue{cafes.length === 1 ? '' : 's'} across {cities.length} cit{cities.length === 1 ? 'y' : 'ies'}.
      </p>

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
    </ExploreScreen>
  );
}

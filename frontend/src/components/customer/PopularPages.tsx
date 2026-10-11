import Link from 'next/link';
import type { SeoIndexEntry } from '@/lib/api/seo';
import { citySlugToName } from '@/constants/cities';

/**
 * Server-rendered links from the homepage to every indexable landing page,
 * grouped by city, with the page's own title as the link text. Crawlers find
 * the city, activity and area pages from the strongest page on the site.
 */
export function PopularPages({ pages }: { pages: SeoIndexEntry[] }) {
  const usable = pages.filter((p) => citySlugToName(p.path.split('/')[2] ?? '') != null);
  const cities = Array.from(new Set(usable.map((p) => p.city)));
  if (cities.length === 0) return null;

  // Busiest city first: that is where most people searching are.
  const size = (city: string) => usable.find((p) => p.type === 'city' && p.city === city)?.cafeCount ?? 0;
  cities.sort((a, b) => size(b) - size(a));

  return (
    <section aria-labelledby="popular-pages" className="flex flex-col gap-4">
      <h2 id="popular-pages" className="font-heading text-h2 text-text-primary">Popular searches</h2>
      {cities.map((city) => {
        const items = usable
          .filter((p) => p.city === city)
          .sort((a, b) => (a.type === 'city' ? -1 : b.type === 'city' ? 1 : b.cafeCount - a.cafeCount));
        return (
          <nav key={city} aria-label={`Popular in ${city}`} className="flex flex-wrap gap-2">
            {items.map((p) => (
              <Link
                key={p.path}
                href={p.path}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-caption font-semibold text-text-primary transition-colors hover:border-primary hover:text-primary"
              >
                {p.title}
              </Link>
            ))}
          </nav>
        );
      })}
    </section>
  );
}

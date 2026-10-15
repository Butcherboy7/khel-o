import Link from 'next/link';
import { getSeoPages, type SeoIndexEntry } from '@/lib/api/seo';

/**
 * Server-rendered links from the homepage to every indexable city and
 * activity page. The homepage is the site's strongest page; without these
 * the city pages were reachable only from a café page's breadcrumb, so
 * almost none of that strength reached them.
 */
export async function ExploreByCityLinks() {
  let pages: SeoIndexEntry[] = [];
  try {
    pages = await getSeoPages();
  } catch {
    return null;
  }
  const cities = pages.filter((p) => p.type === 'city');
  if (cities.length === 0) return null;

  return (
    <section aria-label="Explore by city" className="mx-auto mt-10 flex w-full max-w-wide flex-col gap-5 border-t border-border pt-8 pb-28 md:pb-8">
      <h2 className="font-heading text-h3 text-text-primary">Explore by city</h2>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {cities.map((city) => {
          const facets = pages.filter((p) => p.type === 'activity' && p.city === city.city).slice(0, 8);
          return (
            <nav key={city.path} aria-label={city.title} className="flex flex-col gap-2">
              <Link href={city.path} className="font-heading text-body-emphasis font-bold text-text-primary hover:text-primary">
                {city.title} <span className="font-normal text-text-secondary">({city.cafeCount})</span>
              </Link>
              {facets.length > 0 && (
                <ul className="flex flex-wrap gap-2">
                  {facets.map((f) => (
                    <li key={f.path}>
                      <Link
                        href={f.path}
                        className="inline-block rounded-full border border-border bg-card px-3 py-1.5 text-caption font-semibold text-text-primary transition-colors hover:border-primary hover:text-primary"
                      >
                        {f.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </nav>
          );
        })}
      </div>
    </section>
  );
}

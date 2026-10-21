import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { getSeoPage } from '@/lib/api/seo';
import { CafeCard } from '@/components/customer/CafeCard';
import { SeoLinkGroups } from '@/components/customer/SeoLinkGroups';
import { formatTime, customerPrice, shownPriceRange } from '@/lib/format';
import { cleanName } from '@/lib/venueKind';
import { getPublicEnv } from '@/lib/runtimeEnv';

/** The server's stats, with the price range taken from the cards on this page
 *  (deals and the ₹1 drop included) so the summary matches what's listed. */
function withShownPrices<T extends { minPrice: number | null; maxPrice: number | null }>(
  stats: T,
  cafes: Parameters<typeof shownPriceRange>[0],
): T {
  const range = shownPriceRange(cafes);
  return { ...stats, minPrice: range.min, maxPrice: range.max };
}

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

// The segment is named [activity] for URL stability, but it carries any
// facet the SEO service knows: platform/activity, game, GPU or price.
interface PageProps {
  params: Promise<{ city: string; activity: string }>;
}

// Area headings already name the place ("… in Kompally"), so the city follows a comma.
const pageHeading = (facet: { type: string; heading: string }, city: string) =>
  facet.type === 'area' ? `${facet.heading}, ${city}` : `${facet.heading} in ${city}`;

// Shared by generateMetadata and the page body — one pair of calls per request.
const resolve = cache(async (citySlug: string, facetSlug: string) => {
  try {
    const page = await getSeoPage(citySlug, facetSlug);
    if (!page.facet) return null;
    const all = (await listCafes({ city: page.city.name, limit: 50 })).items;
    const ids = new Set(page.cafeIds);
    return { page, facet: page.facet, cafes: all.filter((c) => ids.has(c.id)) };
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city, activity } = await params;
  const data = await resolve(city, activity);
  if (!data) return { title: 'Not found', robots: { index: false } };

  const { page, facet, cafes } = data;
  const stats = withShownPrices(page.stats, cafes);
  const bookable = cafes.filter((c) => !c.isLeadListing).length;
  const title = `${pageHeading(facet, page.city.name)}: Prices & Timings`;
  const description = `${stats.cafeCount} place${stats.cafeCount === 1 ? '' : 's'}: ${cafes
    .slice(0, 3)
    .map((c) => cleanName(c.name))
    .join(', ')}${cafes.length > 3 ? ' and more' : ''}.${stats.minPrice != null ? ` From ₹${stats.minPrice}/hr.` : ''} ${
    bookable > 0 ? 'Compare timings and book online on KHEL-O.' : 'Compare locations and timings on KHEL-O; online booking is coming soon.'
  }`;

  return {
    title,
    description,
    alternates: { canonical: page.canonical },
    // Thin (1 café) or duplicate-of-city pages still serve users but stay
    // out of the index; `follow` keeps link equity flowing to the cafés.
    robots: page.index ? undefined : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}${page.canonical}`,
      images: [{ url: '/og/khelo-share.png', width: 1200, height: 630 }],
    },
  };
}

export default async function FacetPage({ params }: PageProps) {
  const { city: citySlug, activity: facetSlug } = await params;
  const data = await resolve(citySlug, facetSlug);
  if (!data) notFound();

  const { page, facet, cafes } = data;
  const stats = withShownPrices(page.stats, cafes);
  const city = page.city.name;
  const heading = pageHeading(facet, city);
  const live = cafes.filter((c) => !c.isLeadListing).map((c) => cleanName(c.name));

  const faqItems = [
    {
      question:
        facet.type === 'area' ? `Where can I play in ${facet.label}?` : `Where can I find ${facet.label} in ${city}?`,
      answer: `${cafes
        .map((c) => cleanName(c.name))
        .slice(0, 5)
        .join(', ')}${cafes.length > 5 ? ' and more' : ''}. Each one is listed on this page with its prices and hours.`,
    },
    stats.minPrice != null && {
      question: `How much does it cost per hour in ${city}?`,
      answer:
        stats.maxPrice != null && stats.maxPrice !== stats.minPrice
          ? `Starting prices at these venues range from ₹${stats.minPrice} to ₹${stats.maxPrice} per hour, depending on the venue and setup.`
          : `Prices start from ₹${stats.minPrice} per hour.`,
    },
    stats.openLate > 0 && {
      question: `Are any open late at night?`,
      answer: `${stats.openLate} of these venue${stats.openLate === 1 ? ' is' : 's are'} open until 11 PM or later. Each venue page shows its exact hours.`,
    },
    {
      question: `Can I book online?`,
      // Booking Soon listings can't be booked; say which ones can.
      answer:
        live.length === cafes.length
          ? `Yes. Pick a venue, choose a time and pay online on KHEL-O. You get a QR pass to show at the desk.`
          : live.length > 0
            ? `Yes, at ${live.join(', ')}: pick a time, pay online and show the QR pass at the desk. The others are coming to KHEL-O soon.`
            : `Not yet. These venues are listed with their location and hours; online booking opens as each one joins KHEL-O.`,
    },
  ].filter((x): x is { question: string; answer: string } => Boolean(x));

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: heading,
      itemListElement: cafes.map((cafe, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}${cafePath(cafe)}`,
        name: cafe.name,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KHEL-O', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: city, item: `${SITE_URL}${page.city.path}` },
        { '@type': 'ListItem', position: 3, name: facet.label, item: `${SITE_URL}${page.city.path}/${facet.slug}` },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-5xl mx-auto w-full flex flex-col gap-6 py-6">
        <header className="flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
            <Link href="/browse" className="hover:text-primary">All cities</Link> /{' '}
            <Link href={page.city.path} className="hover:text-primary">{city}</Link> / {facet.label}
          </nav>
          <h1 className="font-heading text-h1 text-text-primary text-balance">
            {heading}
          </h1>
          <p className="text-body text-text-secondary">
            {stats.cafeCount} place{stats.cafeCount === 1 ? '' : 's'}
            {stats.minPrice != null ? `, from ₹${stats.minPrice}/hr` : ''}
            {live.length === cafes.length
              ? ', all bookable online.'
              : live.length > 0
                ? `; ${live.length} bookable online now.`
                : '; online booking coming soon.'}
          </p>
        </header>

        {/* At-a-glance facts computed from these cafés — what makes this page
            more than the city page with a word swapped. */}
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { term: 'Venues', value: String(stats.cafeCount) },
            {
              term: 'Price range',
              value:
                stats.minPrice == null
                  ? '—'
                  : stats.maxPrice != null && stats.maxPrice !== stats.minPrice
                    ? `₹${stats.minPrice}–${stats.maxPrice}/hr`
                    : `₹${stats.minPrice}/hr`,
            },
            { term: 'Open till 11 PM+', value: String(stats.openLate) },
            // Graphics cards only mean something on PC pages; elsewhere, say what can be booked.
            stats.gpus.length > 0
              ? { term: 'Graphics cards', value: stats.gpus.slice(0, 2).join(', ') }
              : { term: 'Bookable online', value: `${live.length} of ${stats.cafeCount}` },
          ].map((f) => (
            <div key={f.term} className="rounded-2xl border border-border bg-card p-3">
              <dt className="text-overline uppercase tracking-wider text-text-secondary">{f.term}</dt>
              <dd className="font-heading text-body-emphasis text-text-primary">{f.value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cafes.map((cafe, i) => (
            <CafeCard key={cafe.id} cafe={cafe} priority={i === 0} />
          ))}
        </div>

        {cafes.length > 1 && (
          <section className="flex flex-col gap-2">
            <h2 className="font-heading text-h2 text-text-primary">Compare at a glance</h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-body">
                <thead className="bg-surface text-caption text-text-secondary">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold">Venue</th>
                    <th className="px-3 py-2 text-right font-semibold">From</th>
                    <th className="px-3 py-2 text-right font-semibold">Hours</th>
                    <th className="px-3 py-2 text-right font-semibold">Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {cafes.map((c) => (
                    <tr key={c.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link href={cafePath(c)} className="font-semibold text-text-primary hover:text-primary">
                          {cleanName(c.name)}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-data tabular-nums">
                        {c.startingPrice != null ? `₹${c.isLeadListing ? c.startingPrice : customerPrice(c.startingPrice)}/hr` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-caption text-text-secondary whitespace-nowrap">
                        {c.openingTime && c.closingTime ? `${formatTime(c.openingTime)}–${formatTime(c.closingTime)}` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-data tabular-nums">
                        {c.totalReviews > 0 ? `${c.averageRating.toFixed(1)} (${c.totalReviews})` : 'New'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {stats.games.length > 0 && facet.type !== 'game' && (
          <p className="text-body text-text-secondary">
            <span className="font-semibold text-text-primary">Games listed here: </span>
            {stats.games.join(', ')}.
          </p>
        )}

        <SeoLinkGroups links={page.related} title={`More in ${city}`} />

        <section className="flex flex-col gap-4 pt-2">
          <h2 className="font-heading text-h2 text-text-primary">Frequently asked questions</h2>
          <div className="flex flex-col gap-2">
            {faqItems.map((item) => (
              <details
                key={item.question}
                className="group rounded-2xl bg-card border border-border/80 p-4 open:shadow-card"
              >
                <summary className="cursor-pointer list-none font-heading text-body-emphasis text-text-primary flex items-center justify-between gap-3">
                  <span>{item.question}</span>
                  <span className="text-text-secondary transition-transform group-open:rotate-45 flex-shrink-0">+</span>
                </summary>
                <p className="text-body text-text-secondary mt-2">{item.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

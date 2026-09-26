import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { getSeoPage } from '@/lib/api/seo';
import { CafeCard } from '@/components/customer/CafeCard';
import { SeoLinkGroups } from '@/components/customer/SeoLinkGroups';
import { formatTime } from '@/lib/format';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

// The segment is named [activity] for URL stability, but it carries any
// facet the SEO service knows: platform/activity, game, GPU or price.
interface PageProps {
  params: Promise<{ city: string; activity: string }>;
}

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

  const { page, facet } = data;
  const { stats } = page;
  const title = `${facet.heading} in ${page.city.name} — Book Online`;
  const description = `${stats.cafeCount} place${stats.cafeCount === 1 ? '' : 's'} in ${page.city.name}${
    stats.minPrice != null ? ` from ₹${stats.minPrice}/hr` : ''
  }${stats.games.length > 0 ? `, with ${stats.games.slice(0, 3).join(', ')}` : ''}. Live availability, instant online booking on KHEL-O.`;

  return {
    title,
    description,
    alternates: { canonical: page.canonical },
    // Thin (1 café) or duplicate-of-city pages still serve users but stay
    // out of the index; `follow` keeps link equity flowing to the cafés.
    robots: page.index ? undefined : { index: false, follow: true },
    openGraph: { title, description, url: `${SITE_URL}${page.canonical}` },
  };
}

export default async function FacetPage({ params }: PageProps) {
  const { city: citySlug, activity: facetSlug } = await params;
  const data = await resolve(citySlug, facetSlug);
  if (!data) notFound();

  const { page, facet, cafes } = data;
  const { stats } = page;
  const city = page.city.name;

  const faqItems = [
    {
      question: `Where can I find ${facet.label} in ${city}?`,
      answer: `${cafes
        .map((c) => c.name)
        .slice(0, 5)
        .join(', ')}${cafes.length > 5 ? ' and more' : ''}. All are listed on this page with live availability.`,
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
      answer: `Yes. Pick a venue, choose a time and pay online on KHEL-O. You get a QR pass to show at the desk.`,
    },
  ].filter((x): x is { question: string; answer: string } => Boolean(x));

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${facet.heading} in ${city}`,
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
            {facet.heading} in {city}
          </h1>
          <p className="text-body text-text-secondary">
            {stats.cafeCount} place{stats.cafeCount === 1 ? '' : 's'} to book online
            {stats.minPrice != null ? `, from ₹${stats.minPrice}/hr` : ''}.
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
            { term: 'Graphics cards', value: stats.gpus.length > 0 ? stats.gpus.slice(0, 2).join(', ') : '—' },
          ].map((f) => (
            <div key={f.term} className="rounded-2xl border border-border bg-card p-3">
              <dt className="text-overline uppercase tracking-wider text-text-secondary">{f.term}</dt>
              <dd className="font-heading text-body-emphasis text-text-primary">{f.value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cafes.map((cafe) => (
            <CafeCard key={cafe.id} cafe={cafe} />
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
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right font-data tabular-nums">
                        {c.startingPrice != null ? `₹${c.startingPrice}/hr` : '—'}
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

import Link from 'next/link';
import { CustomerShell } from '@/components/layout/CustomerShell';
import { ExploreScreen, loadExplore } from '@/components/customer/ExploreScreen';
import { Gta6Block } from '@/components/gta6/Gta6Block';
import { FreePlayCard } from '@/components/gta6/FreePlayCard';
import { InviteCard } from '@/components/customer/InviteCard';
import { GTA6_INTENTS, type Gta6Sort } from '@/constants/gta6Intents';
import { GTA6_PLACES, GTA6_RELEASE, GTA6_TOP_CITY_SLUGS } from '@/constants/gta6';
import { getPublicEnv } from '@/lib/runtimeEnv';
import type { Gta6Cafe } from '@/lib/gta6Live';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

export interface Gta6SearchPageProps {
  path: string;
  cafes: Gta6Cafe[];
  h1: string;
  line?: string;
  sort?: Gta6Sort;
  place?: string | null;
  placeCities?: string[];
  /** Name for the breadcrumb ("Near me", "Delhi NCR", "With friends"). */
  crumb: string;
  /** The page's own answer, under the home sections. */
  answerTitle: string;
  answer: string[];
  faq: { question: string; answer: string }[];
  source: string;
  /** Show the earn-free-play card (it is the answer on /gta6/free). */
  freePlay?: boolean;
}

/**
 * A GTA 6 search page: the KHEL-O Explore tab with the GTA 6 cafés on top
 * (the visible h1) on the Explore tab, and this page's own answer, FAQ and GTA 6 links lower
 * down, so each URL stays a distinct answer for Google.
 */
export async function Gta6SearchPage(p: Gta6SearchPageProps) {
  const { cafes: allCafes, cities } = await loadExplore();
  const url = `${SITE_URL}${p.path}`;
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': url,
      url,
      name: p.h1,
      inLanguage: 'en-IN',
      dateModified: new Date().toISOString().slice(0, 10),
      about: { '@type': 'VideoGame', name: 'Grand Theft Auto VI', gamePlatform: ['PlayStation 5', 'Xbox Series X|S'], datePublished: GTA6_RELEASE.iso },
      isPartOf: { '@type': 'WebSite', name: 'KHEL-O', url: SITE_URL },
    },
    p.cafes.length > 0 && {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'PS5 cafés to play GTA 6',
      itemListElement: p.cafes.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        item: {
          '@type': 'EntertainmentBusiness',
          name: c.name,
          url: `${SITE_URL}${c.cafeHref}`,
          address: { '@type': 'PostalAddress', addressLocality: c.area ?? c.city, addressRegion: c.city, addressCountry: 'IN' },
          priceRange: `₹${c.price}/hr`,
          ...(c.photo ? { image: c.photo } : {}),
          ...(c.opens && c.closes
            ? {
                openingHoursSpecification: {
                  '@type': 'OpeningHoursSpecification',
                  dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
                  opens: c.opens,
                  closes: c.opens === c.closes ? '23:59' : c.closes,
                },
              }
            : {}),
          // Answer engines read this as "book it here": the link goes straight to booking.
          potentialAction: {
            '@type': 'ReserveAction',
            name: `Book GTA 6 at ${c.name}`,
            target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}${c.href}` },
          },
        },
      })),
    },
    p.faq.length > 0 && {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: p.faq.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KHEL-O', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'GTA 6', item: `${SITE_URL}/gta6` },
        { '@type': 'ListItem', position: 3, name: p.crumb, item: url },
      ],
    },
  ].filter(Boolean);

  const intentLinks = GTA6_INTENTS.filter((i) => `/gta6/${i.slug}` !== p.path);
  const cityLinks = GTA6_TOP_CITY_SLUGS.filter((s) => `/gta6/${s}` !== p.path);

  const after = (
    <div className="flex flex-col gap-8 border-t border-border pt-8">
      <section aria-labelledby="gta6-answer-h" className="flex max-w-[68ch] flex-col gap-3">
        <h2 id="gta6-answer-h" className="font-heading text-h2 text-text-primary text-balance">{p.answerTitle}</h2>
        {p.answer.map((t) => (
          <p key={t.slice(0, 32)} className="text-body text-text-secondary">{t}</p>
        ))}
      </section>

      {p.freePlay && <FreePlayCard utmCampaign={p.source} />}

      <InviteCard where={`gta6_${p.source}`} className="max-w-xl" />

      {p.faq.length > 0 && (
        <section aria-labelledby="gta6-faq-h" className="flex flex-col gap-2">
          <h2 id="gta6-faq-h" className="font-heading text-h2 text-text-primary">Questions</h2>
          <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
            {p.faq.map((q) => (
              <details key={q.question} className="group px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex min-h-[40px] cursor-pointer list-none items-center justify-between gap-3 text-body font-semibold text-text-primary">
                  <h3 className="text-body font-semibold">{q.question}</h3>
                  <span aria-hidden="true" className="text-h3 text-text-secondary transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="pb-1 pt-1 text-body text-text-secondary">{q.answer}</p>
              </details>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="gta6-more-h" className="flex flex-col gap-3">
        <h2 id="gta6-more-h" className="font-heading text-h2 text-text-primary">More about playing GTA 6</h2>
        <nav aria-label="GTA 6 pages" className="flex flex-wrap gap-2">
          {p.path !== '/gta6/near-me' && <Pill href="/gta6/near-me">GTA 6 near me</Pill>}
          {intentLinks.map((i) => (
            <Pill key={i.slug} href={`/gta6/${i.slug}`}>{i.h1}</Pill>
          ))}
        </nav>
        <nav aria-label="GTA 6 by city" className="flex flex-wrap gap-2">
          {cityLinks.map((s) => (
            <Pill key={s} href={`/gta6/${s}`}>GTA 6 in {GTA6_PLACES[s].name}</Pill>
          ))}
          <Pill href="/gta6/cities">All cities</Pill>
        </nav>
      </section>
    </div>
  );

  return (
    <CustomerShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ExploreScreen
        cafes={allCafes}
        cities={cities}
        top={
          <Gta6Block
            cafes={p.cafes}
            heading={p.h1}
            headingAs="h1"
            line={p.line}
            place={p.place ?? null}
            placeCities={p.placeCities}
            source={p.source}
            sort={p.sort}
          />
        }
      >
        {after}
      </ExploreScreen>
    </CustomerShell>
  );
}

function Pill({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-border bg-card px-3 py-1.5 text-caption font-semibold text-text-primary transition-colors hover:border-primary hover:text-primary"
    >
      {children}
    </Link>
  );
}

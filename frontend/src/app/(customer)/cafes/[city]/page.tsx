import { cache } from 'react';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { citySlugToName } from '@/constants/cities';
import Link from 'next/link';
import { CafeCard } from '@/components/customer/CafeCard';
import { SeoLinkGroups } from '@/components/customer/SeoLinkGroups';
import { getSeoPage } from '@/lib/api/seo';
import { formatTime, customerPrice, shownPriceRange } from '@/lib/format';
import { cleanName, listVenueKind, venueArea } from '@/lib/venueKind';
import type { CafeListItem } from '@/types';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

interface PageProps {
  params: Promise<{ city: string }>;
}

// cache(): generateMetadata and the page share one call per request (it
// was fetched twice).
const getCityCafes = cache(async (city: string) => {
  try {
    return await listCafes({ city, limit: 50 });
  } catch {
    return null;
  }
});

/** Every number and name on this page comes from these listings — nothing typed in by hand. */
function summarize(cafes: CafeListItem[]) {
  const rows = cafes.map((c) => ({
    cafe: c,
    name: cleanName(c.name),
    area: venueArea(c.addressLine2),
    kind: listVenueKind(c),
  }));
  const gaming = rows.filter((r) => r.kind.key === 'gaming' || r.kind.key === 'gaming-cue');
  const cue = rows.filter((r) => r.kind.key === 'cue' || r.kind.key === 'gaming-cue');
  const bowling = rows.filter((r) => r.kind.key === 'bowling');
  const bookable = rows.filter((r) => !r.cafe.isLeadListing);
  // The same "from" price the cards below show, so the summary never quotes ₹140 over a ₹99 card.
  const all = shownPriceRange(cafes);
  const gamingRange = shownPriceRange(gaming.map((r) => r.cafe));
  // Open till 11 PM or later, or past midnight.
  const lateClose = (t: string | null | undefined) => !!t && (t >= '23:00' || t < '05:00');
  const late = rows.filter((r) => lateClose(r.cafe.closingTime));
  return {
    rows,
    gaming,
    cue,
    bowling,
    bookable,
    late,
    minPrice: all.min,
    gamingMin: gamingRange.min,
    gamingMax: gamingRange.max,
  };
}

type Summary = ReturnType<typeof summarize>;

/** "Gaming Cafés, Snooker & Bowling" — only what this city actually has. */
function headline(s: Summary): string {
  const parts = ['Gaming Cafés', s.cue.length > 0 && 'Snooker', s.bowling.length > 0 && 'Bowling'].filter(
    (p): p is string => Boolean(p)
  );
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} & ${parts[parts.length - 1]}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const nameWithArea = (r: { name: string; area: string | null }) => (r.area ? `${r.name} (${r.area})` : r.name);
const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

function mix(s: Summary): string {
  return list(
    [
      s.gaming.length > 0 && plural(s.gaming.length, 'gaming café', 'gaming cafés'),
      s.cue.length > 0 && plural(s.cue.length, 'snooker & pool club', 'snooker & pool clubs'),
      s.bowling.length > 0 && plural(s.bowling.length, 'bowling alley', 'bowling alleys'),
    ].filter((p): p is string => Boolean(p))
  );
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: slug } = await params;
  const city = citySlugToName(slug);
  if (!city) return { title: 'City not found' };

  const cafes = (await getCityCafes(city))?.items ?? [];
  const s = summarize(cafes);
  const title = `${headline(s)} in ${city}: Prices & Timings`;
  const description = cafes.length > 0
    ? `${plural(cafes.length, 'place', 'places')} to play in ${city}: ${mix(s)}.${
        s.minPrice != null ? ` Prices from ₹${s.minPrice}/hr.` : ''
      } Compare areas and timings, then book online on KHEL-O.`
    : `Find gaming cafés in ${city} on KHEL-O. Check real-time availability and book online.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/cafes/${slug}`,
    },
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/cafes/${slug}`,
      images: [{ url: '/og/khelo-share.png', width: 1200, height: 630 }],
    },
  };
}

// Answers built from the listings below, so each one stays true as venues
// join, change hours or go live.
function buildFaqItems(city: string, s: Summary) {
  const bookableNames = s.bookable.map((r) => r.name);
  const items: { question: string; answer: string }[] = [];

  if (s.gamingMin != null) {
    items.push({
      question: `How much does a gaming café cost in ${city}?`,
      answer:
        s.gamingMax != null && s.gamingMax !== s.gamingMin
          ? `Gaming cafés on KHEL-O in ${city} start from ₹${s.gamingMin} to ₹${s.gamingMax} per hour, depending on the café and the setup. Each café's page shows its full prices.`
          : `Gaming cafés on KHEL-O in ${city} start from ₹${s.gamingMin} per hour. Each café's page shows its full prices.`,
    });
  }
  if (s.cue.length > 0) {
    const live = s.cue.filter((r) => !r.cafe.isLeadListing);
    items.push({
      question: `Where can I play snooker or pool in ${city}?`,
      answer: `KHEL-O lists ${list(s.cue.map(nameWithArea))}.${
        live.length > 0
          ? ` ${list(live.map((r) => r.name))} ${live.length === 1 ? 'takes' : 'take'} online bookings now.`
          : ' Online booking for these is coming soon.'
      }`,
    });
  }
  if (s.bowling.length > 0) {
    items.push({
      question: `Where can I go bowling in ${city}?`,
      answer: `KHEL-O lists ${list(s.bowling.map(nameWithArea))}.${
        s.bowling.some((r) => !r.cafe.isLeadListing)
          ? ' You can book a lane online.'
          : ' Online booking is coming soon; the page shows the location and hours.'
      }`,
    });
  }
  if (s.late.length > 0) {
    items.push({
      question: `Which places are open late in ${city}?`,
      answer: `${list(
        s.late.map((r) => `${r.name} (till ${formatTime(r.cafe.closingTime as string)})`)
      )}. Hours can change on holidays, so check the venue's page before you go.`,
    });
  }
  items.push({
    question: `Can I book online in ${city}?`,
    answer:
      bookableNames.length > 0
        ? `Yes, at ${list(bookableNames)}. Pick a time, pay online and show the QR pass at the desk. Venues marked "Booking soon" are listed so you can see where they are and get notified when booking opens.`
        : `Not yet. These venues are listed so you can see where they are and their hours; booking opens as each one joins KHEL-O.`,
  });
  if (bookableNames.length > 0) {
    items.push({
      question: `Do I need to book in advance?`,
      answer: `No. You can book right up to your session time if a slot is still free. Booking ahead just keeps your slot at busy hours, like Friday nights and weekends.`,
    });
  }
  return items;
}

export default async function CityCafesPage({ params }: PageProps) {
  const { city: slug } = await params;
  const city = citySlugToName(slug);
  if (!city) notFound();

  // Fetched side by side rather than one after the other.
  const [result, seo] = await Promise.all([getCityCafes(city), getSeoPage(slug).catch(() => null)]);
  const cafes = result?.items ?? [];

  // No indexable value in a page listing zero cafés — 404 instead of
  // shipping a thin/empty page for crawlers to devalue the domain on.
  if (cafes.length === 0) notFound();

  const s = summarize(cafes);
  const faqItems = buildFaqItems(city, s);
  // `seo`: links to this city's indexable landing pages (activities, areas, games…).
  const asOf = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date());

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${headline(s)} in ${city}`,
      itemListElement: cafes.map((cafe, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        url: `${SITE_URL}${cafePath(cafe)}`,
        name: cleanName(cafe.name),
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
        { '@type': 'ListItem', position: 2, name: city, item: `${SITE_URL}/cafes/${slug}` },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-5xl mx-auto w-full flex flex-col gap-6 py-6">
        <header className="flex flex-col gap-2">
          <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
            <Link href="/browse" className="hover:text-primary">All cities</Link> / {city}
          </nav>
          <h1 className="font-heading text-h1 text-text-primary text-balance">
            {headline(s)} in {city}
          </h1>
          {/* The direct answer first: what there is, what it costs, what you can book. */}
          <p className="text-body text-text-secondary max-w-3xl">
            KHEL-O lists {plural(cafes.length, 'place', 'places')} to play in {city}: {mix(s)}.{' '}
            {s.bookable.length > 0
              ? `${plural(s.bookable.length, 'takes', 'take')} online bookings today${
                  s.bookable.length < cafes.length ? '; the rest are coming soon' : ''
                }.`
              : 'Online booking is coming soon.'}
            {s.minPrice != null ? ` Prices start from ₹${s.minPrice}/hr.` : ''}
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cafes.map((cafe) => (
            <CafeCard key={cafe.id} cafe={cafe} />
          ))}
        </div>

        {cafes.length > 1 && (
          <section className="flex flex-col gap-2" aria-labelledby="compare">
            <h2 id="compare" className="font-heading text-h2 text-text-primary">
              {headline(s)} in {city} at a glance
            </h2>
            <div className="overflow-x-auto rounded-xl border border-border">
              {/* A minimum width keeps names on one or two lines; the box scrolls sideways on phones. */}
              <table className="w-full min-w-[680px] text-body">
                <thead className="bg-surface text-caption text-text-secondary">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Venue</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Area</th>
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Type</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">From</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Hours</th>
                    <th scope="col" className="px-3 py-2 text-right font-semibold">Booking</th>
                  </tr>
                </thead>
                <tbody>
                  {s.rows.map((r) => (
                    <tr key={r.cafe.id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <Link href={cafePath(r.cafe)} className="font-semibold text-text-primary hover:text-primary">
                          {r.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-caption text-text-secondary whitespace-nowrap">{r.area ?? '—'}</td>
                      <td className="px-3 py-2 text-caption text-text-secondary whitespace-nowrap">{r.kind.label}</td>
                      <td className="px-3 py-2 text-right font-data tabular-nums whitespace-nowrap">
                        {r.cafe.startingPrice != null ? `₹${r.cafe.isLeadListing ? r.cafe.startingPrice : customerPrice(r.cafe.startingPrice)}/hr` : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-caption text-text-secondary whitespace-nowrap">
                        {r.cafe.openingTime && r.cafe.closingTime
                          ? `${formatTime(r.cafe.openingTime)}–${formatTime(r.cafe.closingTime)}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-right text-caption whitespace-nowrap">
                        {r.cafe.isLeadListing ? (
                          <span className="text-text-secondary">Coming soon</span>
                        ) : (
                          <span className="font-semibold text-primary">Book now</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-caption text-text-secondary">From venue listings on KHEL-O, as of {asOf}.</p>
          </section>
        )}

        {seo && <SeoLinkGroups links={seo.related} title={`Explore ${city}`} />}

        <section className="flex flex-col gap-4 pt-4">
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

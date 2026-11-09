import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { GTA6_PLACES, GTA6_RELEASE, PREORDERED_CAFE_IDS } from '@/constants/gta6';
import { shownPriceRange } from '@/lib/format';
import { cleanName, venueArea } from '@/lib/venueKind';
import { getPublicEnv } from '@/lib/runtimeEnv';
import type { CafeListItem } from '@/types';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

interface PageProps {
  params: Promise<{ city: string }>;
}

interface Row {
  cafe: CafeListItem;
  name: string;
  area: string | null;
  city: string;
  preordered: boolean;
  bookable: boolean;
  from: number | null;
}

/** Every café, price and count on this page comes from the live listings, never typed in by hand. */
const getRows = cache(async (slug: string): Promise<Row[]> => {
  const place = GTA6_PLACES[slug];
  if (!place) return [];
  const rows: Row[] = [];
  for (const city of place.cities) {
    try {
      const res = await listCafes({ city, activity: 'console', limit: 50 });
      for (const cafe of res.items) {
        if (!cafe.platforms?.includes('playstation')) continue;
        rows.push({
          cafe,
          name: cleanName(cafe.name),
          area: venueArea(cafe.addressLine2),
          city,
          preordered: PREORDERED_CAFE_IDS.has(cafe.id),
          bookable: !cafe.isLeadListing,
          from: shownPriceRange([cafe]).min,
        });
      }
    } catch {
      // A city that cannot be loaded is left out rather than failing the page.
    }
  }
  // Pre-ordered first, then the ones you can book today, then by price.
  return rows.sort(
    (a, b) =>
      Number(b.preordered) - Number(a.preordered) ||
      Number(b.bookable) - Number(a.bookable) ||
      (a.from ?? 1e9) - (b.from ?? 1e9),
  );
});

const list = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function facts(rows: Row[]) {
  const pre = rows.filter((r) => r.preordered);
  const live = rows.filter((r) => r.bookable);
  const prices = rows.map((r) => r.from).filter((p): p is number => p != null);
  return { pre, live, min: prices.length ? Math.min(...prices) : null };
}

function faq(placeName: string, rows: Row[]) {
  const f = facts(rows);
  const where = placeName === 'India' ? 'in India' : `in ${placeName}`;
  const items: { question: string; answer: string }[] = [
    {
      question: `Where can I play GTA 6 ${where}?`,
      answer:
        rows.length > 0
          ? `GTA 6 is console-only at launch, so the way to play it without owning a PS5 is a PS5 gaming café. KHEL-O lists ${plural(rows.length, 'PS5 gaming café', 'PS5 gaming cafés')} ${where}: ${list(rows.slice(0, 6).map((r) => r.name))}. ${
              f.pre.length > 0
                ? `${list(f.pre.map((r) => r.name))} ${f.pre.length === 1 ? 'has' : 'have'} told KHEL-O they pre-ordered it. `
                : ''
            }Book a slot on KHEL-O.`
          : `GTA 6 is console-only at launch, so you need a PS5 or a PS5 gaming café. KHEL-O has no PS5 café listed ${where} yet; join the GTA 6 launch list and we will tell you when one opens.`,
    },
    {
      question: 'When is GTA 6 releasing?',
      answer: `GTA 6 releases on ${GTA6_RELEASE.label} on PS5 and Xbox Series X|S. It is not on PC at launch.`,
    },
    {
      question: 'Can I play GTA 6 on PC?',
      answer: 'Not at launch. GTA 6 is announced for PS5 and Xbox Series X|S only, so a gaming PC café will not have it on day one. A PS5 café will.',
    },
  ];
  if (f.min != null) {
    items.push({
      question: `How much does it cost to play GTA 6 at a café ${where}?`,
      answer: `PS5 cafés on KHEL-O ${where} start from ₹${f.min} per hour. Each café's page shows its own prices, and prices can change at launch week.`,
    });
  }
  items.push(
    {
      question: 'Do I need to book in advance?',
      answer:
        'Launch week will be busy. Booking a slot on KHEL-O keeps your console for the hour you picked, and you pay online and show a QR pass at the desk.',
    },
    {
      question: 'Will the café really have GTA 6 on day one?',
      answer:
        'Only cafés marked "Pre-ordered" have told us they pre-ordered it. Every café decides its own launch-week hours, so check the café page before you travel.',
    },
  );
  return items;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: slug } = await params;
  const place = GTA6_PLACES[slug];
  if (!place) return { title: 'Not found' };
  const rows = await getRows(slug);
  const f = facts(rows);
  const where = slug === 'india' ? 'India' : place.name;
  const title = `Where to Play GTA 6 in ${where}: PS5 Cafés & Booking`;
  const description =
    rows.length > 0
      ? `GTA 6 releases ${GTA6_RELEASE.label} on PS5 and Xbox. ${plural(rows.length, 'PS5 gaming café', 'PS5 gaming cafés')} in ${where} on KHEL-O${
          f.min != null ? `, from ₹${f.min}/hr` : ''
        }. Compare cafés and book your launch-week slot.`
      : `GTA 6 releases ${GTA6_RELEASE.label} on PS5 and Xbox. Join the KHEL-O GTA 6 launch list for ${where}.`;
  const url = `${SITE_URL}/gta6/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: `/gta6/${slug}`, languages: { 'en-IN': url } },
    // A page with no café to show is thin: keep it out of search until it has one.
    robots: rows.length > 0 ? { index: true, follow: true } : { index: false, follow: true },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      locale: 'en_IN',
      images: [{ url: '/og/khelo-share.png', width: 1200, height: 630, alt: `GTA 6 at KHEL-O PS5 cafés in ${where}` }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['/og/khelo-share.png'] },
  };
}

export default async function Gta6PlacePage({ params }: PageProps) {
  const { city: slug } = await params;
  const place = GTA6_PLACES[slug];
  if (!place) notFound();
  const rows = await getRows(slug);
  const f = facts(rows);
  const where = slug === 'india' ? 'India' : place.name;
  const items = faq(where, rows);
  const updated = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date());
  const iso = new Date().toISOString().slice(0, 10);
  const url = `${SITE_URL}/gta6/${slug}`;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': url,
      url,
      name: `Where to play GTA 6 in ${where}`,
      inLanguage: 'en-IN',
      dateModified: iso,
      about: { '@type': 'VideoGame', name: 'Grand Theft Auto VI', gamePlatform: ['PlayStation 5', 'Xbox Series X|S'], datePublished: GTA6_RELEASE.iso },
      isPartOf: { '@type': 'WebSite', name: 'KHEL-O', url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'KHEL-O', url: SITE_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `PS5 cafés to play GTA 6 in ${where}`,
      itemListElement: rows.map((r, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}${cafePath(r.cafe)}`,
        name: r.name,
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: items.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KHEL-O', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'GTA 6', item: `${SITE_URL}/gta6` },
        { '@type': 'ListItem', position: 3, name: where, item: url },
      ],
    },
  ];

  const others = Object.entries(GTA6_PLACES).filter(([s]) => s !== slug);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-text-primary">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <header className="flex flex-col gap-3">
        <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
          <Link href="/" className="underline-offset-2 hover:underline">KHEL-O</Link> /{' '}
          <Link href="/gta6" className="underline-offset-2 hover:underline">GTA 6</Link> / {where}
        </nav>
        <h1 className="font-heading text-h1 font-bold text-balance">Where to play GTA 6 in {where}</h1>
        {/* The direct answer first: what to do, where, for how much. */}
        <p className="text-body-lg text-text-primary">
          GTA 6 releases on {GTA6_RELEASE.label} on PS5 and Xbox only, not PC. If you do not own a console, play it at a PS5 gaming café.{' '}
          {rows.length > 0 ? (
            <>
              KHEL-O lists <b>{plural(rows.length, 'PS5 gaming café', 'PS5 gaming cafés')}</b> in {where}
              {f.min != null && <>, from <b>₹{f.min} an hour</b></>}.{' '}
              {f.pre.length > 0 && <>{list(f.pre.map((r) => r.name))} {f.pre.length === 1 ? 'has' : 'have'} pre-ordered it. </>}
              Book your launch-week slot on KHEL-O.
            </>
          ) : (
            <>KHEL-O has no PS5 café in {where} yet. Join the launch list and we will tell you the moment one opens.</>
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href={`/gta6?utm_source=seo&utm_medium=organic&utm_campaign=gta6-${slug}`} className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-white">
            Reserve a launch-week seat
          </Link>
          {rows.length > 0 && (
            <a href="#cafes" className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-5 font-semibold">
              See the cafés
            </a>
          )}
        </div>
        <p className="text-caption text-text-secondary">Updated {updated}</p>
      </header>

      {rows.length > 0 && (
        <section id="cafes" aria-labelledby="cafes-h" className="flex flex-col gap-3">
          <h2 id="cafes-h" className="font-heading text-h2 font-bold">PS5 cafés in {where}</h2>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.cafe.id}>
                <Link href={cafePath(r.cafe)} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4">
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="font-semibold">{r.name}</span>
                    <span className="text-caption text-text-secondary">
                      {[r.area, slug === 'india' ? r.city : null].filter(Boolean).join(', ') || r.city} · PS5
                      {!r.bookable && ' · Booking soon'}
                    </span>
                    {r.preordered && <span className="w-fit rounded-full bg-primary/10 px-2 py-0.5 text-caption font-semibold text-primary">Pre-ordered GTA 6</span>}
                  </span>
                  <span className="shrink-0 text-right text-caption text-text-secondary">
                    {r.from != null ? <><b className="text-body text-text-primary">₹{r.from}</b>/hr</> : null}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="how-h" className="flex flex-col gap-3">
        <h2 id="how-h" className="font-heading text-h2 font-bold">How to play GTA 6 without a PS5</h2>
        <ol className="list-decimal space-y-2 pl-5 text-body text-text-secondary">
          <li>Pick a PS5 café in {where} from the list above.</li>
          <li>Choose a time on its KHEL-O page and pay online.</li>
          <li>Show the QR pass at the desk and play.</li>
        </ol>
      </section>

      <section aria-labelledby="faq-h" className="flex flex-col gap-3">
        <h2 id="faq-h" className="font-heading text-h2 font-bold">GTA 6 in {where}: questions</h2>
        <div className="flex flex-col gap-4">
          {items.map((q) => (
            <div key={q.question}>
              <h3 className="font-semibold">{q.question}</h3>
              <p className="mt-1 text-body text-text-secondary">{q.answer}</p>
            </div>
          ))}
        </div>
      </section>

      <nav aria-label="More GTA 6 pages" className="flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-4 text-body">
        <Link href="/gta6" className="text-primary underline underline-offset-2">GTA 6 launch list</Link>
        {others.map(([s, p]) => (
          <Link key={s} href={`/gta6/${s}`} className="text-primary underline underline-offset-2">GTA 6 in {p.name}</Link>
        ))}
        {slug !== 'india' && <Link href={`/cafes/${slug}`} className="text-primary underline underline-offset-2">All gaming cafés in {where}</Link>}
      </nav>
    </main>
  );
}

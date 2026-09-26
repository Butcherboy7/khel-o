import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { citySlugToName } from '@/constants/cities';
import Link from 'next/link';
import { CafeCard } from '@/components/customer/CafeCard';
import { activitiesFor } from '@/lib/seoActivities';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

interface PageProps {
  params: Promise<{ city: string }>;
}

async function getCityCafes(city: string) {
  try {
    return await listCafes({ city, limit: 50 });
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: slug } = await params;
  const city = citySlugToName(slug);
  if (!city) return { title: 'City not found' };

  const result = await getCityCafes(city);
  const count = result?.items.length ?? 0;
  const prices = (result?.items ?? [])
    .map((c) => c.startingPrice)
    .filter((p): p is number => p != null);
  const priceLine = prices.length > 0 ? ` Starting from ₹${Math.min(...prices)}/hr.` : '';

  const title = `Gaming Cafés in ${city} — Book Online`;
  const description = count > 0
    ? `Browse ${count} gaming café${count === 1 ? '' : 's'} in ${city}.${priceLine} Check real-time seat availability and pay online on KHEL-O.`
    : `Find gaming cafés in ${city} on KHEL-O. Check real-time seat availability and pay online.`;

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
    },
  };
}

// FAQ copy is generic-but-honest per city (see homepage FAQ_ITEMS precedent)
// — no invented café counts or claims beyond what the fetched list already
// shows on the page.
function buildFaqItems(city: string, minPrice: number | null) {
  const priceAnswer = minPrice != null
    ? `Prices in ${city} start from ₹${minPrice}/hr and vary by café and hardware tier — check each café's page for its full pricing.`
    : `Pricing varies by café and hardware tier in ${city} — check each café's page for details.`;

  return [
    {
      question: `How much does a gaming café cost in ${city}?`,
      answer: priceAnswer,
    },
    {
      question: `Can I book a gaming PC or PS5 in ${city} online?`,
      answer: `Yes — browse cafés in ${city} below, check real-time seat availability, and pay online through KHEL-O. You'll get a QR pass to check in at the café.`,
    },
    {
      question: `Do I need to book in advance for a gaming café in ${city}?`,
      answer: `No, you can book right up to your session time if a station is still available. Booking ahead just guarantees your slot at busy hours.`,
    },
  ] as const;
}

export default async function CityCafesPage({ params }: PageProps) {
  const { city: slug } = await params;
  const city = citySlugToName(slug);
  if (!city) notFound();

  const result = await getCityCafes(city);
  const cafes = result?.items ?? [];

  // No indexable value in a page listing zero cafés — 404 instead of
  // shipping a thin/empty page for crawlers to devalue the domain on.
  if (cafes.length === 0) notFound();

  const prices = cafes.map((c) => c.startingPrice).filter((p): p is number => p != null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const faqItems = buildFaqItems(city, minPrice);
  const activities = activitiesFor(cafes);

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    itemListElement: cafes.map((cafe, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      url: `${SITE_URL}${cafePath(cafe)}`,
      name: cafe.name,
    })),
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <div className="max-w-5xl mx-auto w-full flex flex-col gap-6 py-6">
        <header className="flex flex-col gap-1">
          <h1 className="font-heading text-h1 text-text-primary">Gaming Cafés in {city}</h1>
          <p className="text-body text-text-secondary">
            {cafes.length} café{cafes.length === 1 ? '' : 's'} available to book online in {city}.
          </p>
        </header>

        {activities.length > 0 && (
          <nav aria-label={`Browse ${city} by activity`} className="flex flex-wrap gap-2">
            {activities.map(({ activity, cafes: matched }) => (
              <Link
                key={activity.slug}
                href={`/cafes/${slug}/${activity.slug}`}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-caption font-semibold text-text-primary hover:border-primary hover:text-primary transition-colors"
              >
                {activity.label} <span className="text-text-secondary">({matched.length})</span>
              </Link>
            ))}
          </nav>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {cafes.map((cafe) => (
            <CafeCard key={cafe.id} cafe={cafe} />
          ))}
        </div>

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

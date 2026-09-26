import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { citySlugToName } from '@/constants/cities';
import { CafeCard } from '@/components/customer/CafeCard';
import { activitiesFor } from '@/lib/seoActivities';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

interface PageProps {
  params: Promise<{ city: string; activity: string }>;
}

// Shared by generateMetadata and the page body — one backend call per request.
const resolve = cache(async (citySlug: string, activitySlug: string) => {
  const city = citySlugToName(citySlug);
  if (!city) return null;
  let items;
  try {
    items = (await listCafes({ city, limit: 50 })).items;
  } catch {
    return null;
  }
  const entry = activitiesFor(items).find((e) => e.activity.slug === activitySlug);
  if (!entry) return null;
  const prices = entry.cafes.map((c) => c.startingPrice).filter((p): p is number => p != null);
  return { city, ...entry, minPrice: prices.length > 0 ? Math.min(...prices) : null };
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { city: citySlug, activity: activitySlug } = await params;
  const data = await resolve(citySlug, activitySlug);
  if (!data) return { title: 'Not found' };

  const { city, activity, cafes, minPrice } = data;
  const title = `${activity.heading} in ${city} — Book Online`;
  const description = `${cafes.length} place${cafes.length === 1 ? '' : 's'} for ${activity.label} in ${city}${
    minPrice != null ? `, from ₹${minPrice}/hr` : ''
  }. See real-time availability and book instantly on KHEL-O.`;
  const path = `/cafes/${citySlug}/${activitySlug}`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: `${SITE_URL}${path}` },
  };
}

export default async function ActivityCityPage({ params }: PageProps) {
  const { city: citySlug, activity: activitySlug } = await params;
  const data = await resolve(citySlug, activitySlug);
  // Only real, non-empty combinations exist — no thin pages for crawlers.
  if (!data) notFound();

  const { city, activity, cafes, minPrice } = data;

  const faqItems = [
    {
      question: `Where can I play ${activity.label} in ${city}?`,
      answer: `${cafes
        .map((c) => c.name)
        .slice(0, 5)
        .join(', ')}${cafes.length > 5 ? ' and more' : ''} offer ${activity.label} in ${city}. All are listed above with live availability.`,
    },
    {
      question: `How much does ${activity.label} cost per hour in ${city}?`,
      answer:
        minPrice != null
          ? `Prices start from ₹${minPrice} per hour and vary by venue and setup. Each venue's page shows its full pricing.`
          : `Pricing varies by venue. Each venue's page shows its full pricing.`,
    },
    {
      question: `Can I book ${activity.label} in ${city} online?`,
      answer: `Yes. Pick a venue, choose a time and pay online on KHEL-O. You get a QR pass to show at the desk.`,
    },
  ];

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: `${activity.heading} in ${city}`,
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
        { '@type': 'ListItem', position: 2, name: city, item: `${SITE_URL}/cafes/${citySlug}` },
        { '@type': 'ListItem', position: 3, name: activity.label, item: `${SITE_URL}/cafes/${citySlug}/${activitySlug}` },
      ],
    },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="max-w-5xl mx-auto w-full flex flex-col gap-6 py-6">
        <header className="flex flex-col gap-1">
          <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
            <Link href={`/cafes/${citySlug}`} className="hover:text-primary">
              {city}
            </Link>{' '}
            / {activity.label}
          </nav>
          <h1 className="font-heading text-h1 text-text-primary text-balance">
            {activity.heading} in {city}
          </h1>
          <p className="text-body text-text-secondary">
            {cafes.length} place{cafes.length === 1 ? '' : 's'} to book online
            {minPrice != null ? `, from ₹${minPrice}/hr` : ''}.
          </p>
        </header>

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

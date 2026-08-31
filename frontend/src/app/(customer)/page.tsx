import { Suspense } from 'react';
import type { Metadata } from 'next';
import { listCafes } from '@/lib/api/cafes';
import { ExploreClient } from '@/components/customer/ExploreClient';

import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

export const metadata: Metadata = {
  alternates: {
    canonical: '/',
  },
};

// Public route (see (customer)/layout.tsx isPublicPath) — fetched server-side
// so the raw HTML a search/AI crawler receives already contains real café
// names, cities and prices instead of an empty shell that only fills in
// after client-side JavaScript runs. Failure here (backend unreachable) must
// not take the whole homepage down — ExploreClient re-fetches client-side
// regardless and shows its own loading/error states.
async function getInitialCafes() {
  try {
    return await listCafes({ limit: 30 });
  } catch {
    return undefined;
  }
}

// Plain, honest answers only — no invented city counts, guarantees, or
// aggregate stats. See docs/lovable/owner-onboarding-experience-prompt.md
// Part B for why unverifiable numbers stay out of user-facing copy.
const FAQ_ITEMS = [
  {
    question: 'What is KHEL-O?',
    answer:
      'KHEL-O is a booking platform for gaming cafés in India. Search for a café near you, check real-time station availability, book a time slot, and pay online.',
  },
  {
    question: 'Do I need to book in advance?',
    answer:
      'No — you can book right up to your session time as long as a station is still available. Booking ahead just guarantees your slot at busy hours.',
  },
  {
    question: 'How do I pay?',
    answer:
      'You pay online when you book, through Razorpay. Your booking gives you a QR pass — show it at the café counter to check in.',
  },
  {
    question: 'Can I cancel a booking?',
    answer:
      'Yes. Cancelling up to 2 hours before your session start time gets you a full refund automatically to your original payment method. Cancellations within 2 hours of the session, or no-shows, are not eligible for a refund.',
  },
  {
    question: 'Is KHEL-O available in my city?',
    answer:
      'KHEL-O is expanding city by city. Use the city selector on the homepage to see which gaming cafés are currently listed near you.',
  },
  {
    question: 'I own a gaming café — can I list it?',
    answer:
      'Yes, listing is free. Visit /partner to see what is needed and start your café setup.',
  },
] as const;

export default async function ExplorePage() {
  const initialCafes = await getInitialCafes();

  const itemListJsonLd = initialCafes && initialCafes.items.length > 0
    ? {
        '@context': 'https://schema.org',
        '@type': 'ItemList',
        itemListElement: initialCafes.items.map((cafe, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${SITE_URL}/cafe/${cafe.id}`,
          name: cafe.name,
        })),
      }
    : null;

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map((item) => ({
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
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <Suspense fallback={null}>
        <ExploreClient initialCafes={initialCafes} />
      </Suspense>

      {/* Plain <details>/<summary> — no client JS needed, so the Q&A text is
          in the raw HTML for crawlers and answer-engine bots to read and cite
          directly, matching the FAQPage JSON-LD above. */}
      <section className="max-w-5xl mx-auto w-full flex flex-col gap-4 pb-8">
        <h2 className="font-heading text-h2 text-text-primary">Frequently asked questions</h2>
        <div className="flex flex-col gap-2">
          {FAQ_ITEMS.map((item) => (
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
    </>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { GTA6_PLACES, GTA6_TOP_CITY_SLUGS, GTA6_RELEASE } from '@/constants/gta6';
import { SuggestCafeForm } from '@/components/gta6/SuggestCafeForm';
import { FreePlayCard } from '@/components/gta6/FreePlayCard';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');
const URL_ = `${SITE_URL}/gta6/near-me`;

const TITLE = 'GTA 6 Near Me: Find a PS5 Café & Pre-Book a Slot';
const DESCRIPTION = `GTA 6 releases ${GTA6_RELEASE.label} on PS5 and Xbox. No console? Find a PS5 gaming café near you in India, see prices, and pre-book your launch-week slot on KHEL-O.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/gta6/near-me', languages: { 'en-IN': URL_ } },
  openGraph: { title: TITLE, description: DESCRIPTION, url: URL_, type: 'website', locale: 'en_IN', images: [{ url: '/og/khelo-share.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/og/khelo-share.png'] },
};

const FAQ = [
  {
    question: 'How do I find a café to play GTA 6 near me?',
    answer: 'Open the KHEL-O café chooser, which lists cafés taking GTA 6 seats and puts the nearest first. Pick one, choose a time, and pay online. You show a QR pass at the desk.',
  },
  {
    question: 'Can I pre-book GTA 6 at a gaming café?',
    answer: 'Yes. Where a café has opened launch-week seats on KHEL-O you reserve a slot in advance with a small booking fee and pay the rest when you play. Where none is open yet, join the launch list and we tell you first.',
  },
  {
    question: 'Can I play GTA 6 for free at a café?',
    answer: 'You can earn free play time: join the KHEL-O WhatsApp community and play in our next tournament, and participants get free GTA 6 time as a reward. Otherwise cafés charge per hour for their PS5 setups, and KHEL-O shows each price before you pay.',
  },
  {
    question: 'Which consoles will GTA 6 run on?',
    answer: `GTA 6 releases on ${GTA6_RELEASE.label} for PS5 and Xbox Series X|S. It is not announced for PC, so look for a PS5 café.`,
  },
];

export default function Gta6NearMePage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      '@id': URL_,
      url: URL_,
      name: TITLE,
      inLanguage: 'en-IN',
      about: { '@type': 'VideoGame', name: 'Grand Theft Auto VI', gamePlatform: ['PlayStation 5', 'Xbox Series X|S'], datePublished: GTA6_RELEASE.iso },
      isPartOf: { '@type': 'WebSite', name: 'KHEL-O', url: SITE_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: FAQ.map((q) => ({ '@type': 'Question', name: q.question, acceptedAnswer: { '@type': 'Answer', text: q.answer } })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KHEL-O', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'GTA 6', item: `${SITE_URL}/gta6` },
        { '@type': 'ListItem', position: 3, name: 'Near me', item: URL_ },
      ],
    },
  ];
  const places = GTA6_TOP_CITY_SLUGS.map((s) => [s, GTA6_PLACES[s]] as const);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-text-primary">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-h1 font-bold text-balance">GTA 6 near me: play it at a PS5 café</h1>
        <p className="text-body-lg">
          GTA 6 releases on {GTA6_RELEASE.label} on PS5 and Xbox only. Don’t have a console? Pick a PS5 gaming café near you on KHEL-O, pre-book a slot, and walk in with a QR pass.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/drops?game=gta6&utm_source=seo&utm_medium=organic&utm_campaign=gta6-near-me" className="btn-depth inline-flex h-12 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-white">
            Find the nearest café
          </Link>
          <Link href="/gta6?utm_source=seo&utm_medium=organic&utm_campaign=gta6-near-me" className="inline-flex h-12 items-center justify-center rounded-xl border border-border px-5 font-semibold">
            Join the launch list
          </Link>
        </div>
      </header>

      <section aria-labelledby="where-h" className="flex flex-col gap-3">
        <h2 id="where-h" className="font-heading text-h2 font-bold">Pick your city</h2>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {places.map(([slug, p]) => (
            <li key={slug}>
              <Link href={`/gta6/${slug}`} className="flex h-12 items-center rounded-xl border border-border bg-card px-4 font-semibold">
                {p.name}
              </Link>
            </li>
          ))}
          <li>
            <Link href="/gta6/cities" className="flex h-12 items-center rounded-xl border border-border px-4 font-semibold text-text-secondary">
              All cities
            </Link>
          </li>
        </ul>
      </section>

      <FreePlayCard utmCampaign="gta6-near-me" />

      <section id="suggest" aria-labelledby="suggest-h" className="flex flex-col gap-3">
        <h2 id="suggest-h" className="font-heading text-h2 font-bold">Your café isn’t listed?</h2>
        <SuggestCafeForm source="gta6-near-me" />
      </section>

      <section aria-labelledby="faq-h" className="flex flex-col gap-3">
        <h2 id="faq-h" className="font-heading text-h2 font-bold">Questions</h2>
        <div className="flex flex-col gap-4">
          {FAQ.map((q) => (
            <div key={q.question}>
              <h3 className="font-semibold">{q.question}</h3>
              <p className="mt-1 text-body text-text-secondary">{q.answer}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

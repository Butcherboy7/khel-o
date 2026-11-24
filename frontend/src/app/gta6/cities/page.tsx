import Link from 'next/link';
import type { Metadata } from 'next';
import { GTA6_CITY_SLUGS, GTA6_PLACES, GTA6_RELEASE } from '@/constants/gta6';
import { SuggestCafeForm } from '@/components/gta6/SuggestCafeForm';
import { FreePlayCard } from '@/components/gta6/FreePlayCard';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');
const TITLE = 'Play GTA 6 in Your City: PS5 Cafés Across India';
const DESCRIPTION = `GTA 6 came out on ${GTA6_RELEASE.label} on PS5 and Xbox. Pick your city to find PS5 gaming cafés on KHEL-O, pre-book a slot, or ask us to bring your local café on.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: '/gta6/cities' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/gta6/cities`, type: 'website', locale: 'en_IN', images: [{ url: '/og/khelo-share.png', width: 1200, height: 630 }] },
};

export default function Gta6CitiesPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'GTA 6 pages by city',
    itemListElement: GTA6_CITY_SLUGS.map((slug, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: `GTA 6 in ${GTA6_PLACES[slug].name}`,
      url: `${SITE_URL}/gta6/${slug}`,
    })),
  };
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8 text-text-primary">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <header className="flex flex-col gap-3">
        <h1 className="font-heading text-h1 font-bold text-balance">GTA 6 in your city</h1>
        <p className="text-body-lg">
          GTA 6 came out on {GTA6_RELEASE.label} on PS5 and Xbox, not PC. Pick your city to see PS5 cafés you can book on KHEL-O. If your city has none yet, you can still join the launch list and tell us which café to bring on.
        </p>
      </header>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {GTA6_CITY_SLUGS.map((slug) => (
          <li key={slug}>
            <Link href={`/gta6/${slug}`} className="flex min-h-12 items-center rounded-xl border border-border bg-card px-4 py-2 font-semibold">
              {GTA6_PLACES[slug].name}
            </Link>
          </li>
        ))}
      </ul>

      <FreePlayCard utmCampaign="gta6-cities" />

      <section id="suggest" aria-labelledby="suggest-h" className="flex flex-col gap-3">
        <h2 id="suggest-h" className="font-heading text-h2 font-bold">City or café not here?</h2>
        <SuggestCafeForm source="gta6-cities" />
      </section>
    </main>
  );
}

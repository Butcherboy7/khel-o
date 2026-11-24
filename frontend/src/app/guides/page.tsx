import type { Metadata } from 'next';
import Link from 'next/link';
import { CustomerShell } from '@/components/layout/CustomerShell';
import { GUIDES } from '@/constants/guides';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

const TITLE = 'GTA 6 Guides: Where and How to Play Without a PS5';
const DESCRIPTION =
  'Plain answers on playing GTA 6 without owning a PS5: where to play in Hyderabad, what it costs, PS5 rental, PC vs PS5, and how to find a gaming café near you.';

export const metadata: Metadata = {
  title: { absolute: `${TITLE} | KHEL-O` },
  description: DESCRIPTION,
  alternates: { canonical: '/guides', languages: { 'en-IN': `${SITE_URL}/guides` } },
  openGraph: { title: TITLE, description: DESCRIPTION, url: `${SITE_URL}/guides`, type: 'website', locale: 'en_IN', images: [{ url: '/og/khelo-share.png', width: 1200, height: 630 }] },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: ['/og/khelo-share.png'] },
};

export default function GuidesIndexPage() {
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: TITLE,
      url: `${SITE_URL}/guides`,
      inLanguage: 'en-IN',
      isPartOf: { '@type': 'WebSite', name: 'KHEL-O', url: SITE_URL },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KHEL-O', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/guides` },
      ],
    },
  ];
  return (
    <CustomerShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-12 pt-6">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-h1 text-balance text-text-primary">GTA 6 guides</h1>
          <p className="max-w-[68ch] text-body text-text-secondary">
            Straight answers on playing GTA 6 when you do not own a PS5 or Xbox. GTA 6 is out on PS5 and Xbox Series X|S, and
            these guides cover where to play and what it costs. Looking for a café now? Go to{' '}
            <Link href="/gta6/near-me" className="font-semibold text-primary underline-offset-2 hover:underline">GTA 6 near me</Link>.
          </p>
        </header>
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="flex flex-col gap-1 px-4 py-4 transition-colors hover:bg-primary/5">
                <h2 className="font-heading text-h3 font-bold text-text-primary text-balance">{g.title}</h2>
                <p className="text-body text-text-secondary">{g.description}</p>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </CustomerShell>
  );
}

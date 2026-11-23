import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { CustomerShell } from '@/components/layout/CustomerShell';
import { ContactBlock } from '@/components/gta6/ContactBlock';
import { GUIDES, GUIDE_BY_SLUG, withGuidePrice } from '@/constants/guides';
import { getGta6Cafes } from '@/lib/gta6Live';
import { getPublicEnv } from '@/lib/runtimeEnv';

const SITE_URL = getPublicEnv('NEXT_PUBLIC_APP_URL', 'https://khel-o.online');

// The lowest café price is read live, so the figure in each guide is today's.
export const dynamic = 'force-dynamic';

type PageProps = { params: Promise<{ slug: string }> };

async function minPrice(): Promise<number | null> {
  const cafes = await getGta6Cafes();
  return cafes.length ? Math.min(...cafes.map((c) => c.price)) : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const g = GUIDE_BY_SLUG[slug];
  if (!g) return { title: 'Not found' };
  const min = await minPrice();
  const description = withGuidePrice(g.description, min);
  const url = `${SITE_URL}/guides/${slug}`;
  return {
    title: { absolute: `${g.title} | KHEL-O` },
    description,
    alternates: { canonical: `/guides/${slug}`, languages: { 'en-IN': url } },
    robots: { index: true, follow: true },
    openGraph: { title: g.title, description, url, type: 'article', locale: 'en_IN', publishedTime: g.published, modifiedTime: g.updated, images: [{ url: '/og/khelo-share.png', width: 1200, height: 630 }] },
    twitter: { card: 'summary_large_image', title: g.title, description, images: ['/og/khelo-share.png'] },
  };
}

const fmt = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(`${iso}T00:00:00+05:30`));

export default async function GuidePage({ params }: PageProps) {
  const { slug } = await params;
  const g = GUIDE_BY_SLUG[slug];
  if (!g) notFound();
  const min = await minPrice();
  const url = `${SITE_URL}/guides/${slug}`;
  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      '@id': `${url}#article`,
      headline: g.title,
      description: withGuidePrice(g.description, min),
      inLanguage: 'en-IN',
      datePublished: g.published,
      dateModified: g.updated,
      mainEntityOfPage: url,
      author: { '@type': 'Organization', name: 'KHEL-O', url: SITE_URL },
      publisher: { '@type': 'Organization', name: 'KHEL-O', url: SITE_URL, logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/khelo-logo-512.png` } },
      about: { '@type': 'VideoGame', name: 'Grand Theft Auto VI', gamePlatform: ['PlayStation 5', 'Xbox Series X|S'], datePublished: '2026-11-19' },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'KHEL-O', item: `${SITE_URL}/` },
        { '@type': 'ListItem', position: 2, name: 'Guides', item: `${SITE_URL}/guides` },
        { '@type': 'ListItem', position: 3, name: g.title, item: url },
      ],
    },
  ];
  const others = GUIDES.filter((x) => x.slug !== slug).slice(0, 4);
  return (
    <CustomerShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pb-12 pt-6">
        <article className="flex flex-col gap-6">
          <header className="flex flex-col gap-3">
            <nav aria-label="Breadcrumb" className="text-caption text-text-secondary">
              <Link href="/guides" className="underline-offset-2 hover:text-primary hover:underline">Guides</Link>
            </nav>
            <h1 className="font-heading text-h1 text-balance text-text-primary">{g.title}</h1>
            <p className="text-caption text-text-secondary">
              By KHEL-O. Updated <time dateTime={g.updated}>{fmt(g.updated)}</time>.
            </p>
            <p className="max-w-[68ch] text-body font-semibold text-text-primary">{withGuidePrice(g.answer, min)}</p>
          </header>

          {g.sections.map((s) => (
            <section key={s.h2} className="flex max-w-[68ch] flex-col gap-2">
              <h2 className="font-heading text-h2 text-balance text-text-primary">{s.h2}</h2>
              {s.p.map((t) => (
                <p key={t.slice(0, 40)} className="text-body text-text-secondary">{withGuidePrice(t, min)}</p>
              ))}
            </section>
          ))}

          <Link href={g.cta.href} className="btn-depth inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 font-semibold text-white sm:w-fit">
            {g.cta.label}
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </article>

        <ContactBlock where="" source={`guide-${slug}`} />

        <section aria-labelledby="more-guides-h" className="flex flex-col gap-3">
          <h2 id="more-guides-h" className="font-heading text-h2 text-text-primary">More GTA 6 guides</h2>
          <ul className="flex flex-col gap-2">
            {others.map((o) => (
              <li key={o.slug}>
                <Link href={`/guides/${o.slug}`} className="text-body font-semibold text-primary underline-offset-2 hover:underline">{o.title}</Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </CustomerShell>
  );
}

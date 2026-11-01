import { cache } from 'react';
import type { Metadata } from 'next';
import { getDrop, type Drop } from '@/lib/api/drops';
import { rupees } from '@/lib/drops';
import { DropClient } from './DropClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Public: no sign-in needed to look. A draft or wrong link comes back null and
// the page retries from the browser (where the café's own sign-in can see it).
const load = cache(async (slug: string): Promise<Drop | null> => {
  try {
    return await getDrop(slug);
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) return { title: 'Drop', robots: { index: false } };
  const description = `${d.game} at ${d.cafe.name}, ${d.cafe.city}. ${rupees(d.pricePerHour)} an hour. ${d.seatsLeft} of ${d.seatsTotal} seats left. Pay ${rupees(d.deposit)} now to hold a seat.`;
  return {
    title: `${d.title} · ${d.cafe.name}`,
    description,
    alternates: { canonical: `/drops/${d.slug}` },
    openGraph: { title: `${d.title} · ${d.cafe.name}`, description, url: `/drops/${d.slug}`, type: 'website' },
    twitter: { card: 'summary_large_image', title: d.title, description },
  };
}

export default async function DropPage({ params }: PageProps) {
  const { slug } = await params;
  return <DropClient slug={slug} initial={await load(slug)} />;
}

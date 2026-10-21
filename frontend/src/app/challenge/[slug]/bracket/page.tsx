import { cache } from 'react';
import type { Metadata } from 'next';
import { getChallenge, type Challenge } from '@/lib/api/challenges';
import { BracketClient } from './BracketClient';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const load = cache(async (slug: string): Promise<Challenge | null> => {
  try {
    return await getChallenge(slug);
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const ch = await load(slug);
  if (!ch) return { title: 'Bracket', robots: { index: false } };
  const finished = ch.status === 'finished';
  return {
    title: `${finished ? 'Results' : 'Live bracket'} · ${ch.title}`,
    description: `${finished ? 'The results of' : 'Follow'} ${ch.title} at ${ch.cafe.name}.`,
    alternates: { canonical: `/challenge/${ch.slug}/bracket` },
  };
}

/** The live bracket for phones, and ?projector=1 for the big screen. */
export default async function ChallengeBracketPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const projector = (await searchParams)?.projector === '1';
  return <BracketClient slug={slug} projector={projector} />;
}

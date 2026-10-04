import { cache } from 'react';
import type { Metadata } from 'next';
import { getTournament, type TournamentDetail } from '@/lib/api/tournaments';
import { feeLabel, fmtWhen } from '@/lib/tournament';
import { TournamentDetailClient } from './TournamentDetailClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const getCached = cache(async (slug: string): Promise<TournamentDetail | null> => {
  try {
    return await getTournament(slug);
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const t = await getCached(slug);
  if (!t) return { title: 'Tournament not found' };
  const prize = t.prizes[0] ? ` Prize: ${t.prizes[0].prize}.` : '';
  const description = `${t.game.name} at ${t.cafe?.name ?? 'a KHEL-O café'}, ${fmtWhen(t.startsAt)}. ${feeLabel(t)}.${prize} ${t.spotsLeft} spots left.`;
  return {
    title: `${t.title} · ${t.game.short} tournament`,
    description,
    openGraph: { title: t.title, description, type: 'website' },
    alternates: { canonical: `/tournaments/${t.slug}` },
  };
}

export default async function TournamentPage({ params }: PageProps) {
  const { slug } = await params;
  const initial = await getCached(slug);
  return <TournamentDetailClient slug={slug} initial={initial} />;
}

import { cache } from 'react';
import type { Metadata } from 'next';
import { getChallenge, type Challenge } from '@/lib/api/challenges';
import { challengeDay, challengeTimeRange } from '@/lib/challenge';
import { ChallengeClient } from './ChallengeClient';

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Loaded once per request for both the metadata and the page. A draft (or a
// wrong link) comes back as null: the page then retries from the browser,
// where an admin's sign-in lets them preview a draft.
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
  if (!ch) return { title: 'Challenge', robots: { index: false } };
  const when = `${challengeDay(ch.startsAt)}, ${challengeTimeRange(ch.startsAt, ch.endsAt)}`;
  const description = `Free sign-up. ${ch.game} at ${ch.cafe.name}, ${ch.cafe.city}. ${when}. ${ch.capacity} spots, then a waitlist. ${ch.minAge}+.`;
  return {
    title: ch.title,
    description,
    alternates: { canonical: `/challenge/${ch.slug}` },
    openGraph: { title: `${ch.title} · ${ch.cafe.name}`, description, url: `/challenge/${ch.slug}`, type: 'website' },
    twitter: { card: 'summary_large_image', title: ch.title, description },
  };
}

export default async function ChallengePage({ params }: PageProps) {
  const { slug } = await params;
  return <ChallengeClient slug={slug} initial={await load(slug)} />;
}

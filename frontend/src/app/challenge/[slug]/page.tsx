import { cache } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getChallenge, type Challenge } from '@/lib/api/challenges';
import { challengeDay, challengeTimeRange, introCookie } from '@/lib/challenge';
import { ChallengeClient } from './ChallengeClient';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
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
  const description = `Free sign-up. ${ch.game} at ${ch.cafe.name}, ${ch.cafe.city}. ${when}. ${ch.capacity >= 100 ? 'Everyone who signs up plays.' : `${ch.capacity} player spots, then a reserve list.`} Anyone can come to watch.`;
  return {
    title: ch.title,
    description,
    alternates: { canonical: `/challenge/${ch.slug}` },
    openGraph: { title: `${ch.title} · ${ch.cafe.name}`, description, url: `/challenge/${ch.slug}`, type: 'website' },
    twitter: { card: 'summary_large_image', title: ch.title, description },
  };
}

export default async function ChallengePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const query = await searchParams;
  // The short intro is for people arriving from an ad, reel or shared link,
  // once per device. Decided here so it is in the first paint.
  const fromOutside = Boolean(query.utm_source || query.fbclid);
  const seen = (await cookies()).has(introCookie(slug));
  return <ChallengeClient slug={slug} initial={await load(slug)} showIntro={fromOutside && !seen} />;
}

import { cache } from 'react';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { getChallenge, type Challenge } from '@/lib/api/challenges';
import { challengeDay, challengeTimeRange, introCookie } from '@/lib/challenge';
import { ChallengeClient } from './ChallengeClient';
import { teamChallengeConfig } from '@/challenges';
import { TeamLanding } from '@/components/challenge/team/TeamLanding';

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

const SHARE_IMAGE = '/challenges/valorant-3v3-xqz/poster-og.jpg';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const ch = await load(slug);
  const team = teamChallengeConfig(slug);
  if (team) {
    // Search words people use: Valorant 5v5, Hyderabad, Gachibowli, team of 5, gaming cafe. Never "tournament".
    const description = `Valorant 5v5 in Hyderabad, played in person at ${team.venue.name}, Gachibowli on Sat 5 Dec. We provide the gaming PCs (RTX 5060 Ti, Ryzen 5 9600X, 540Hz), bring only your phone and Riot ID. Teams of 5, knockout bracket, ₹250 per person, rewards worth ₹5,000. Solo players welcome.`;
    return {
      title: `Valorant 5v5 Challenge in Hyderabad · ${team.venue.shortName} Gachibowli, Sat 5 Dec`,
      // "tournament" lives only in these hidden keywords: people search it, the page itself says challenge.
      keywords: ['Valorant 5v5 Hyderabad', 'Valorant Hyderabad', 'Valorant Gachibowli', 'Valorant event Hyderabad', 'Valorant LAN Hyderabad', 'Valorant tournament Hyderabad', 'Valorant competition Hyderabad', 'Valorant near me', 'gaming cafe Hyderabad', 'Valorant team challenge', 'XQZ Hyderabad', 'XQZ Gaming Cafe Gachibowli'],
      description,
      alternates: { canonical: `/challenge/${slug}` },
      openGraph: { title: team.title, description, url: `/challenge/${slug}`, type: 'website', images: [{ url: SHARE_IMAGE, width: 1200, height: 630, alt: team.title }] },
      twitter: { card: 'summary_large_image', title: team.title, description, images: [SHARE_IMAGE] },
    };
  }
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
  const team = teamChallengeConfig(slug);
  if (team) {
    const initial = await load(slug);
    const t = (initial as { team?: { priceTeam?: number } } | null)?.team;
    // Event details for search results (date, place, price). Plain words: a challenge, never a tournament.
    const event = {
      '@context': 'https://schema.org',
      '@type': 'Event',
      name: team.title,
      description: team.subtitle,
      startDate: initial?.startsAt ?? team.dates.firstMatch,
      endDate: initial?.endsAt ?? undefined,
      eventStatus: 'https://schema.org/EventScheduled',
      eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
      image: [`https://khel-o.com/challenges/valorant-3v3-xqz/poster-og.jpg`, `https://khel-o.com/challenges/valorant-3v3-xqz/poster-share-1080x1440.jpg`],
      keywords: 'Valorant 5v5 Hyderabad, Valorant event Hyderabad, Valorant LAN Hyderabad, Valorant Gachibowli, gaming cafe Hyderabad',
      about: { '@type': 'VideoGame', name: 'Valorant' },
      isAccessibleForFree: false,
      inLanguage: 'en-IN',
      location: {
        '@type': 'Place',
        name: team.venue.name,
        address: { '@type': 'PostalAddress', streetAddress: team.venue.address, addressLocality: team.venue.city, addressRegion: 'Telangana', postalCode: '500032', addressCountry: 'IN' },
      },
      organizer: { '@type': 'Organization', name: 'KHEL-O', url: 'https://khel-o.com' },
      offers: t?.priceTeam ? {
        '@type': 'Offer', price: t.priceTeam, priceCurrency: 'INR', availability: 'https://schema.org/InStock',
        url: `https://khel-o.com/challenge/${slug}`, validThrough: team.dates.registrationCloses,
      } : undefined,
    };
    // The same questions the page shows, so answer engines can quote them.
    const faqLd = {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: team.faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
    };
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(event).replace(/</g, '\\u003c') }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqLd).replace(/</g, '\\u003c') }} />
        <TeamLanding cfg={team} initial={initial} />
      </>
    );
  }
  const query = await searchParams;
  // The short intro is for people arriving from an ad, reel or shared link,
  // once per device. Decided here so it is in the first paint.
  const fromOutside = Boolean(query.utm_source || query.fbclid);
  const seen = (await cookies()).has(introCookie(slug));
  return <ChallengeClient slug={slug} initial={await load(slug)} showIntro={fromOutside && !seen} />;
}

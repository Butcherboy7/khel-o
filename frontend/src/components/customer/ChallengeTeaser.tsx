'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Swords } from 'lucide-react';
import { getChallenge, getMyActiveChallenges } from '@/lib/api/challenges';
import { trackAction } from '@/lib/api/analyticsEvents';
import { FEATURED_CHALLENGE_SLUG, challengeDay, challengeTimeRange, isUpcoming } from '@/lib/challenge';
import { useAuthStore } from '@/store/authStore';

/** Home screen: the upcoming challenge, for everyone who hasn't signed up yet.
 *  Players already in it see their own card (MyChallengeCard) instead.
 *  Hides itself when the challenge is over, cancelled or missing. */
export function ChallengeTeaser() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data: ch } = useQuery({
    queryKey: ['challenges', FEATURED_CHALLENGE_SLUG],
    queryFn: () => getChallenge(FEATURED_CHALLENGE_SLUG),
    staleTime: 60_000,
    retry: false,
  });
  const { data: mine } = useQuery({
    queryKey: ['challenges', 'mine', 'active'],
    queryFn: getMyActiveChallenges,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  if (!ch || !isUpcoming(ch)) return null;
  if (mine?.some((c) => c.slug === ch.slug)) return null;

  const full = ch.spotsLeft === 0;
  const spots = ch.status !== 'open'
    ? 'Player sign-ups closed'
    : full
    ? `All ${ch.capacity} player spots taken · waitlist open`
    : `${ch.spotsLeft} of ${ch.capacity} player spots left`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-3">
      <Link
        href={`/challenge/${ch.slug}`}
        onClick={() => trackAction('challenge_teaser_click', { challenge: ch.slug, where: 'home' })}
        className="group flex items-center gap-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] p-3 text-[#F4F1EC] shadow-sm transition-colors hover:border-[#E8675D]"
      >
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#D0463C] text-white">
          <Swords className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-bold uppercase tracking-[0.08em] text-[#E8675D]">Free challenge · {ch.game}</span>
          <span className="block truncate font-heading text-body-emphasis font-bold">{ch.title}</span>
          <span className="block text-caption text-[#A3A6B1]">
            {challengeDay(ch.startsAt)}, {challengeTimeRange(ch.startsAt, ch.endsAt)} · {ch.cafe.name}
          </span>
          <span className="block text-caption font-semibold text-[#F2C94C]">{spots}</span>
          <span className="block text-caption text-[#DADCE3]">
            Anyone can come to watch{ch.visitorOffer ? ` · ${ch.visitorOffer}` : ''}
          </span>
        </span>
        <ChevronRight className="h-5 w-5 flex-shrink-0 text-[#A3A6B1] transition-transform group-hover:translate-x-0.5" aria-hidden />
      </Link>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Megaphone, MessageCircle, MessagesSquare, Swords, Users } from 'lucide-react';
import { getChallenge } from '@/lib/api/challenges';
import { trackAction } from '@/lib/api/analyticsEvents';
import { COMMUNITY_URL, FEATURED_CHALLENGE_SLUG, challengeDay, challengeTimeRange, isUpcoming } from '@/lib/challenge';

const SPACES = [
  {
    icon: Megaphone,
    name: 'Announcements',
    what: 'Official KHEL-O news only: new challenges, new cafés, results. Quiet, a few posts a week.',
  },
  {
    icon: MessagesSquare,
    name: 'Lobby',
    what: 'The chat. Say hi, find people to play with, polls, gaming talk.',
  },
  {
    icon: Swords,
    name: 'Challengers',
    what: 'Every challenge: how to sign up, rules, updates on the day and results.',
  },
];

/** /community: the landing page for the WhatsApp Community ad and links.
 *  Joining the community is its own step; challenge sign-up stays on the
 *  challenge page so the two are never confused. */
export function CommunityClient() {
  const [tapped, setTapped] = useState(false);
  const { data: ch } = useQuery({
    queryKey: ['challenges', FEATURED_CHALLENGE_SLUG],
    queryFn: () => getChallenge(FEATURED_CHALLENGE_SLUG),
    staleTime: 60_000,
    retry: false,
  });
  const upcoming = ch && isUpcoming(ch) ? ch : null;

  const join = (where: string) => {
    trackAction('community_join_tap', { where });
    setTapped(true);
  };

  return (
    <main className="min-h-screen bg-[#0F0D0E] text-[#F4F1EC]">
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-8">
        <Link href="/" className="text-sm font-bold tracking-wide text-[#E8675D]">KHEL-O</Link>

        {upcoming ? (
          <>
            <h1 className="mt-6 font-heading text-[2rem] font-bold leading-tight">
              Your Tekken bracket<br />is posted here.
            </h1>
            <p className="mt-3 text-[#C9CBD3]">
              {upcoming.title} is {challengeDay(upcoming.startsAt)} at {upcoming.cafe.name}. Match order, check-in time and results go out
              only in this WhatsApp community. Free to join, leave any time.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-6 font-heading text-[2rem] font-bold leading-tight">
              Hyderabad gamers,<br />one group chat.
            </h1>
            <p className="mt-3 text-[#C9CBD3]">
              Challenges at real cafés, café news before anyone else, and people to play with. Free on WhatsApp. Leave any time.
            </p>
          </>
        )}

        <a
          href={COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => join('hero')}
          className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] text-base font-bold text-[#0B1F12] hover:bg-[#2EE073]"
        >
          <MessageCircle className="h-5 w-5" aria-hidden />
          Join on WhatsApp
        </a>

        {tapped && (
          <div className="mt-4 rounded-2xl border border-[#3B6B4A] bg-[#13221A] p-4 text-sm" role="status">
            <p className="font-semibold text-[#7FE0A0]">One more step in WhatsApp</p>
            <p className="mt-1 text-[#DADCE3]">
              After joining, open the community and tap <b>Lobby</b> and <b>Challengers</b> to join them too. Announcements comes with it.
            </p>
            <a
              href={COMMUNITY_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block font-semibold text-[#7FE0A0] underline"
            >
              WhatsApp didn&apos;t open? Try again
            </a>
          </div>
        )}

        {upcoming && (
          <>
            <h2 className="mt-8 text-xs font-bold uppercase tracking-[0.1em] text-[#A3A6B1]">What lands in your chat</h2>
            <ol className="mt-3 space-y-2">
              {[
                ['Saturday night', 'The bracket: who plays who, and in what order.'],
                ['Sunday, 2:30 PM', 'Check-in opens. Show your QR at the door.'],
                ['After the last match', 'Results, photos, and the next challenge.'],
              ].map(([when, what]) => (
                <li key={when} className="flex gap-3 rounded-2xl border border-[#262932] bg-[#16181E] p-3.5">
                  <span className="w-28 flex-shrink-0 text-sm font-semibold text-[#F2C94C]">{when}</span>
                  <span className="text-sm text-[#DADCE3]">{what}</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-[#A3A6B1]">
              WhatsApp shows new members only what is posted after they join. The pinned welcome message at the top has everything you need.
            </p>
          </>
        )}

        <h2 className="mt-10 text-xs font-bold uppercase tracking-[0.1em] text-[#A3A6B1]">What&apos;s inside</h2>
        <ul className="mt-3 space-y-3">
          {SPACES.map(({ icon: Icon, name, what }) => (
            <li key={name} className="flex gap-3 rounded-2xl border border-[#262932] bg-[#16181E] p-4">
              <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#E8675D]" aria-hidden />
              <span>
                <span className="block font-semibold">{name}</span>
                <span className="block text-sm text-[#A3A6B1]">{what}</span>
              </span>
            </li>
          ))}
        </ul>

        {upcoming && (
          <>
            <h2 className="mt-10 text-xs font-bold uppercase tracking-[0.1em] text-[#A3A6B1]">Happening next</h2>
            <div className="mt-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] p-4">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#E8675D]">Free challenge · {upcoming.game}</p>
              <p className="mt-1 font-heading text-lg font-bold">{upcoming.title}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-[#A3A6B1]">
                <CalendarDays className="h-4 w-4 flex-shrink-0" aria-hidden />
                {challengeDay(upcoming.startsAt)}, {challengeTimeRange(upcoming.startsAt, upcoming.endsAt)} · {upcoming.cafe.name}
              </p>
              <p className="mt-3 text-sm text-[#DADCE3]">
                {upcoming.capacity} player spots, then a waitlist. Signing up to play is separate from joining the community.
              </p>
              <p className="mt-1 flex items-start gap-1.5 text-sm text-[#DADCE3]">
                <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7FE0A0]" aria-hidden />
                <span>Anyone can come to watch{upcoming.visitorOffer ? `. ${upcoming.visitorOffer}.` : '.'}</span>
              </p>
              <Link
                href={`/challenge/${upcoming.slug}`}
                onClick={() => trackAction('challenge_teaser_click', { challenge: upcoming.slug, where: 'community' })}
                className="mt-4 flex h-11 items-center justify-center gap-1.5 rounded-xl bg-[#D0463C] font-semibold text-white hover:bg-[#E8675D]"
              >
                See the challenge <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </>
        )}

        <h2 className="mt-10 text-xs font-bold uppercase tracking-[0.1em] text-[#A3A6B1]">Good to know</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[#C9CBD3]">
          <li>People in the groups you join can see your number, like any WhatsApp group.</li>
          <li>Mute what you don&apos;t want. Announcements stays quiet.</li>
          <li>Be decent: no spam, no selling, no abuse. Admins remove people who break this.</li>
        </ul>

        <a
          href={COMMUNITY_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => join('bottom')}
          className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#25D366] text-sm font-bold text-[#7FE0A0] hover:bg-[#13221A]"
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          Already in? Open the community
        </a>
      </div>
    </main>
  );
}

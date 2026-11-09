'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Trophy } from 'lucide-react';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { CommunityInviteCard } from '@/components/customer/CommunityInvite';
import { getBracket, type Challenge } from '@/lib/api/challenges';
import { trackAction } from '@/lib/api/analyticsEvents';
import { challengeDay } from '@/lib/challenge';

/** Real photos from Tekken #01 at AdamsDen (1 Nov 2026), in /public/community. */
const PHOTOS = ['full-house', 'locked-in', 'couch', 'prize', 'headset', 'the-crowd', 'hands', 'sofa'];

/** The page a finished challenge lands on: not a promo for something that is over,
 *  but what happened, who won, and the way into the next one. Numbers come from the bracket. */
export function FinishedRecap({ ch }: { ch: Challenge }) {
  const { data: bracket } = useQuery({ queryKey: ['challenge-bracket', ch.slug], queryFn: () => getBracket(ch.slug), staleTime: 60_000 });
  const places = (bracket?.standings || []).filter((s) => s.place <= 3).sort((a, b) => a.place - b.place);
  const matches = bracket ? bracket.rounds.reduce((n, r) => n + r.matches.filter((m) => !m.bye).length, 0) + (bracket.thirdPlace && !bracket.thirdPlace.bye ? 1 : 0) : null;
  const champ = places.find((p) => p.place === 1);
  const second = places.find((p) => p.place === 2);
  const third = places.find((p) => p.place === 3);

  return (
    <div className="flex flex-col gap-5" data-testid="finished-recap">
      <style>{`
        @keyframes recap-spin { from { transform: translateY(-6px) rotateX(-7deg) rotateY(0deg); } to { transform: translateY(-6px) rotateX(-7deg) rotateY(360deg); } }
        .recap-ring { animation: recap-spin 28s linear infinite; transform-style: preserve-3d; }
        @media (prefers-reduced-motion: reduce) { .recap-ring { animation: none; } }
      `}</style>

      <div className="relative -mx-4 -mt-2 h-[250px] overflow-hidden" style={{ perspective: 800, background: 'radial-gradient(circle at 50% 45%, #3a1620, #0A0809 70%)' }} aria-hidden>
        <div className="recap-ring absolute left-1/2 top-1/2 h-0 w-0">
          {PHOTOS.map((n, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- small static photos from /public
            <img
              key={n}
              src={`/community/${n}.webp`}
              alt=""
              // Eager: inside the 3D ring, iPhone browsers never start a lazy load, so only the white frames showed.
              loading="eager"
              decoding="async"
              className="absolute left-[-56px] top-[-71px] h-[142px] w-[112px] rounded-[10px] border-[3px] border-[#F4EFE7] object-cover"
              style={{ transform: `rotateY(${(360 / PHOTOS.length) * i}deg) translateZ(150px)`, backfaceVisibility: 'hidden' }}
            />
          ))}
        </div>
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#0A0809] to-transparent" />
      </div>

      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8675D]">
          {ch.title} · {ch.cafe.name} · {challengeDay(ch.startsAt)}
        </p>
        <h1 className={`${fightFont.className} mt-1 text-[40px] font-bold uppercase italic leading-[0.95]`}>
          You missed it.
          <span className="block text-[#E8675D]">#02 is coming, and the group hears first.</span>
        </h1>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          [ch.confirmed, 'players'],
          [matches ?? '–', 'matches'],
          [champ ? 1 : '–', 'champion'],
        ].map(([n, label]) => (
          <div key={String(label)} className="rounded-xl border border-[#2c2c2c] px-1 py-2.5">
            <b className={`${fightFont.className} block text-[28px] italic leading-none text-[#F6C25B]`}>{n}</b>
            <small className="text-[11px] text-[#A9A39A]">{label}</small>
          </div>
        ))}
      </div>

      {champ && (
        <div className="flex h-[84px] items-end gap-1.5" aria-label="The podium">
          {[
            { p: second, h: '74%', cls: 'bg-[#43464f]', label: '2nd' },
            { p: champ, h: '100%', cls: 'bg-gradient-to-b from-[#F6C25B] to-[#8A5A00] text-[#231A05]', label: '1st' },
            { p: third, h: '58%', cls: 'bg-[#5c3e2f]', label: '3rd' },
          ].map((s) => (
            <div key={s.label} style={{ height: s.h }} className={`flex-1 rounded-t-[10px] px-1 pt-1.5 text-center text-[11px] font-extrabold ${s.cls}`}>
              {s.label === '1st' && <Trophy className="mx-auto mb-0.5 h-3.5 w-3.5" aria-hidden />}
              <span className="line-clamp-1">{s.p?.name ?? '–'}</span>
              <small className="block font-medium opacity-80">{s.label}</small>
            </div>
          ))}
        </div>
      )}

      <CommunityInviteCard where="challenge_finished" />
      <Link
        href="/community"
        onClick={() => trackAction('community_page_tap', { where: 'challenge_finished_notify' })}
        className="inline-flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl bg-[#D0463C] px-4 font-bold text-white hover:bg-[#B23A31]"
      >
        Tell me about #02 <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
      <Link href={`/challenge/${ch.slug}/bracket`} className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#262932] px-4 text-sm font-semibold hover:border-[#3A3E4A]">
        See every match
      </Link>
      <Link href="/community" className="text-center text-sm font-semibold text-[#A3A6B1] underline">
        All the photos from the night
      </Link>
    </div>
  );
}

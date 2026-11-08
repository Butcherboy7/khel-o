'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BarChart3, Check, CheckCheck, MessageCircle, Pin, Trophy } from 'lucide-react';
import { FightStage, fightFont } from '@/components/challenge/ChallengeHero';
import { Celebration } from '@/components/challenge/Celebration';
import { getBracket, getChallenge } from '@/lib/api/challenges';
import { trackAction } from '@/lib/api/analyticsEvents';
import { markJoined } from '@/lib/api/community';
import { useAuthStore } from '@/store/authStore';
import { CommunityHub } from './CommunityHub';
import { COMMUNITY_URL, FEATURED_CHALLENGE_SLUG, challengeDay, isUpcoming, openToAll } from '@/lib/challenge';

/** The event the photos are from. Its bracket gives the real numbers and the podium. */
const RECAP_SLUG = 'tekken-01';

/** Real photos from Tekken #01 at AdamsDen (1 Nov 2026), in /public/community. */
const MOMENTS: { src: string; w: number; h: number; label: string }[] = [
  { src: 'full-house', w: 900, h: 457, label: 'Full house' },
  { src: 'locked-in', w: 900, h: 600, label: 'Focus mode' },
  { src: 'couch', w: 900, h: 600, label: 'Trash talk' },
  { src: 'pit-lane', w: 416, h: 900, label: 'Pit stop' },
  { src: 'prize', w: 900, h: 600, label: 'Prize time' },
  { src: 'headset', w: 900, h: 600, label: 'Locked in' },
  { src: 'the-crowd', w: 900, h: 600, label: 'The crowd' },
  { src: 'hands', w: 900, h: 600, label: 'Hands don’t lie' },
  { src: 'sofa', w: 900, h: 600, label: 'The squad' },
];

/** Plain words: what you get, in the order it happens. */
const GETS = [
  'The date of #02, before anyone else',
  'A vote on which game we play next',
  'The time, the place and your match',
  'Results and photos after',
];

/** What the chat looks like. Illustrative: the kind of posts the group gets. */
const CHAT = [
  { pin: true, text: 'Tekken #01 results and photos are up. What a Sunday.' },
  { poll: true, text: 'Poll: which game for #02?' },
  { text: 'The #02 date drops here first. Turn notifications on.' },
];

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** True once the element has scrolled into view. `ready`: the element is on
 *  the page (it may appear only after data loads). */
function useSeen<T extends Element>(ready: boolean) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!ready || !el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, [ready]);
  return [ref, seen] as const;
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <span className="inline-block h-5" aria-hidden />;
  const ms = Math.max(0, new Date(to).getTime() - now);
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor(ms / 3_600_000) % 24;
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  return (
    <span className="tabular-nums text-[#F2C94C]" role="timer" aria-label="Time until the event starts">
      {d}d {String(h).padStart(2, '0')}h {String(m).padStart(2, '0')}m {String(s).padStart(2, '0')}s
    </span>
  );
}

/** One polaroid on the moments wall. Height is fixed, width follows the photo. */
function Polaroid({ m, n }: { m: (typeof MOMENTS)[number]; n: number }) {
  const tilt = [-2.2, 1.6, -0.8, 2.4, -1.6, 0.9][n % 6];
  return (
    <figure
      className="flex-shrink-0 rounded-[4px] bg-[#F4F1EC] p-2 pb-0 shadow-[0_14px_30px_rgba(0,0,0,0.45)]"
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {n % 3 === 0 && <span aria-hidden className="absolute -top-2 left-1/2 h-4 w-14 -translate-x-1/2 -rotate-3 bg-[#F2C94C]/80" />}
      {/* eslint-disable-next-line @next/next/no-img-element -- pre-sized webp in /public, no optimiser needed */}
      <img
        src={`/community/${m.src}.webp`}
        alt={m.label}
        loading="lazy"
        width={m.w}
        height={m.h}
        className="block h-36 w-auto object-cover md:h-56"
        style={{ aspectRatio: `${m.w} / ${m.h}` }}
      />
      <figcaption className={`${fightFont.className} py-1.5 text-center text-lg font-bold uppercase tracking-wider text-[#17151A]`}>{m.label}</figcaption>
    </figure>
  );
}

function MomentsWall() {
  const rowA = MOMENTS.filter((_, n) => n % 2 === 0);
  const rowB = MOMENTS.filter((_, n) => n % 2 === 1);
  // Each row is drawn twice so the loop never shows a gap.
  const row = (items: typeof MOMENTS, rev: boolean, speed: string) => (
    <div className="cm-wall-wrap overflow-hidden py-2.5">
      <div className={`cm-wall ${rev ? 'rev' : ''}`} style={{ ['--cm-speed' as string]: speed }}>
        {[...items, ...items].map((m, n) => (
          <div key={`${m.src}-${n}`} className="relative" aria-hidden={n >= items.length}>
            <Polaroid m={m} n={n} />
          </div>
        ))}
      </div>
    </div>
  );
  return (
    // Full screen width, past the text column, with the edges fading out.
    <div className="relative left-1/2 w-screen -translate-x-1/2 [mask-image:linear-gradient(90deg,transparent,#000_6%,#000_94%,transparent)]">
      {row(rowA, false, '46s')}
      {row(rowB, true, '54s')}
    </div>
  );
}

function ChatDemo() {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(CHAT.length);
      return;
    }
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => timers.push(setTimeout(() => !cancelled && fn(), ms));
    const play = () => {
      setShown(0);
      CHAT.forEach((_, i) => {
        later(() => setTyping(true), 700 + i * 2200);
        later(() => {
          setTyping(false);
          setShown(i + 1);
        }, 1600 + i * 2200);
      });
      later(play, 1600 + CHAT.length * 2200 + 3500);
    };
    play();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="cm-float mx-auto w-full max-w-[300px]">
      <div className="rounded-[28px] border border-[#3A2F44] bg-[#120E16] p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]">
        <div className="overflow-hidden rounded-[22px] bg-[#0B141A]">
          <div className="flex items-center gap-2.5 bg-[#1F2C34] px-3.5 py-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#D0463C] text-xs font-bold text-white">K</span>
            <span className="text-sm font-semibold text-[#E9EDEF]">KHEL-O group</span>
          </div>
          <div className="flex min-h-[250px] flex-col justify-end gap-2 px-3 py-3">
            {CHAT.slice(0, shown).map((m, i) => (
              <div key={i} className="cm-bubble max-w-[92%] self-start rounded-2xl rounded-tl-sm bg-[#202C33] px-3 py-2 text-[13px] leading-snug text-[#E9EDEF]">
                {m.pin && (
                  <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#F2C94C]">
                    <Pin className="h-3 w-3" aria-hidden /> Pinned
                  </span>
                )}
                {m.poll && (
                  <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#7FE0A0]">
                    <BarChart3 className="h-3 w-3" aria-hidden /> Poll
                  </span>
                )}
                {m.text}
                {m.poll && (
                  <span className="mt-1.5 flex flex-col gap-1">
                    {['Tekken 8: the rematch', 'A new game', 'You tell us'].map((o) => (
                      <span key={o} className="flex items-center gap-2 rounded-lg border border-[#2A3942] px-2 py-1.5 text-[12px]">
                        <span className="h-3 w-3 rounded-full border border-[#8696A0]" /> {o}
                      </span>
                    ))}
                  </span>
                )}
                <span className="mt-0.5 flex justify-end">
                  <CheckCheck className="h-3 w-3 text-[#53BDEB]" aria-hidden />
                </span>
              </div>
            ))}
            {typing && (
              <div className="cm-bubble flex w-14 items-center justify-center gap-1 self-start rounded-2xl rounded-tl-sm bg-[#202C33] py-3" aria-hidden>
                <span className="cm-dot" /> <span className="cm-dot" style={{ animationDelay: '.15s' }} /> <span className="cm-dot" style={{ animationDelay: '.3s' }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function JoinButton({ where, onJoin, big = true, btnRef }: { where: string; onJoin: (w: string) => void; big?: boolean; btnRef?: React.Ref<HTMLAnchorElement> }) {
  return (
    <a
      ref={btnRef}
      href={COMMUNITY_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => onJoin(where)}
      className={`cm-join ${fightFont.className} relative flex ${big ? 'h-16 text-[26px]' : 'h-14 text-2xl'} w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-[#25D366] font-bold uppercase tracking-wider text-[#06210F] transition-transform active:scale-[0.98]`}
    >
      <span className="cm-shine" aria-hidden />
      <MessageCircle className="relative h-6 w-6" aria-hidden />
      <span className="relative">Join the group</span>
    </a>
  );
}

/** /community: the landing page for the WhatsApp Community ad and links.
 *  One job: get a tap on Join. After an event it leads with the real photos
 *  and results, so people see what they missed. */
export function CommunityClient() {
  const qc = useQueryClient();
  const [tapped, setTapped] = useState(false);
  const [stickyOn, setStickyOn] = useState(false);
  const heroBtn = useRef<HTMLAnchorElement>(null);
  const { data: ch } = useQuery({
    queryKey: ['challenges', FEATURED_CHALLENGE_SLUG],
    queryFn: () => getChallenge(FEATURED_CHALLENGE_SLUG),
    staleTime: 60_000,
    retry: false,
  });
  const { data: recap } = useQuery({
    queryKey: ['challenges', RECAP_SLUG, 'bracket'],
    queryFn: () => getBracket(RECAP_SLUG),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const upcoming = ch && isUpcoming(ch) ? ch : null;
  const finished = recap?.challenge.status === 'finished' ? recap : null;
  const players = finished?.rounds[0]?.matches.reduce((n, m) => n + (m.a ? 1 : 0) + (m.b ? 1 : 0), 0) ?? 0;
  const played = finished
    ? [...finished.rounds.flatMap((r) => r.matches), ...(finished.thirdPlace ? [finished.thirdPlace] : [])].filter((m) => m.winner && !m.bye).length
    : 0;
  const champ = finished?.standings.find((s) => s.place === 1);
  const [crownRef, crownSeen] = useSeen<HTMLElement>(Boolean(champ));

  useEffect(() => {
    const el = heroBtn.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStickyOn(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const join = (where: string) => {
    trackAction('community_join_tap', { where });
    setTapped(true);
    // Logged in: remember the tap, which unlocks the members-only code.
    if (isAuthenticated) markJoined().then(() => qc.invalidateQueries({ queryKey: ['community-week'] })).catch(() => undefined);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0A0809] text-[#F4F1EC]">
      {/* 1. The album is the first thing you see */}
      <section className="relative isolate overflow-hidden pb-6">
        <FightStage />
        <div className="relative mx-auto w-full max-w-4xl px-4 pt-5 md:px-8">
          <Link
            href="/"
            aria-label="Back to the KHEL-O home page"
            className="inline-flex h-11 w-fit items-center gap-1.5 rounded-full border border-white/20 bg-black/60 pl-3 pr-4 text-sm font-semibold text-[#F4F1EC] backdrop-blur hover:bg-black/80"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Home
          </Link>
          {upcoming ? (
            <>
              <p className="cm-rise mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[#E8675D]">Next up</p>
              <h1 className={`${fightFont.className} cm-rise mt-1 text-[2.8rem] font-bold uppercase leading-[0.92] md:text-6xl`}>
                Free event <span className="text-[#E8675D]">{challengeDay(upcoming.startsAt).split(',')[0]}.</span>
              </h1>
            </>
          ) : (
            <>
              <p className="cm-rise mt-4 text-xs font-bold uppercase tracking-[0.2em] text-[#E8675D]">Tekken 8 · #01 · AdamsDen · 1 Nov</p>
              <h1 className={`${fightFont.className} cm-rise mt-1 text-[2.8rem] font-bold uppercase leading-[0.92] md:text-6xl`}>
                Sunday at <span className="text-[#E8675D]">AdamsDen.</span>
              </h1>
              <p className="cm-rise mt-2 max-w-md text-[15px] text-[#C9C4CF]" style={{ ['--cm-delay' as string]: '100ms' }}>
                A full house of Hyderabad gamers. <b className="text-[#F4F1EC]">#02 is coming, and the group hears first.</b>
              </p>
            </>
          )}
        </div>

        <div className="relative mt-3">
          <MomentsWall />
        </div>

        <div className="relative mx-auto mt-3 w-full max-w-md px-4 md:px-8">
          <div className="cm-rise" style={{ ['--cm-delay' as string]: '240ms' }}>
            <JoinButton where="hero" onJoin={join} btnRef={heroBtn} />
            <p className="mt-2 text-center text-sm text-[#C9C4CF]">
              Free · one tap · leave any time
              {upcoming && (
                <>
                  {' · starts in '}
                  <Countdown to={upcoming.startsAt} />
                </>
              )}
            </p>
            {tapped && (
              <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#3B6B4A] bg-[#13221A]/90 px-3 py-2.5 text-sm" role="status">
                <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7FE0A0]" aria-hidden />
                <span>
                  In WhatsApp, tap <b>Join</b>. Then open <b>Challengers</b> for the event updates.{' '}
                  <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#7FE0A0] underline">
                    Didn&apos;t open? Try again
                  </a>
                </span>
              </p>
            )}
            {tapped && (
              <div className="mt-3 rounded-xl border border-[#262932] bg-[#16181E] p-3" role="region" aria-label="What to do next">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#F2C94C]">Next, two quick things</p>
                <div className="mt-2 grid gap-2">
                  <a
                    href="#hub-week"
                    onClick={() => trackAction('community_next_step', { step: 'vote' })}
                    className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg bg-[#0E0F13] px-3 text-sm font-semibold hover:bg-[#1A1C21]"
                  >
                    Vote for #02 and get the members code <ArrowRight className="h-4 w-4 flex-none" aria-hidden />
                  </a>
                  <Link
                    href="/?tab=drops"
                    onClick={() => trackAction('community_next_step', { step: 'drops' })}
                    className="flex min-h-[44px] items-center justify-between gap-2 rounded-lg bg-[#0E0F13] px-3 text-sm font-semibold hover:bg-[#1A1C21]"
                  >
                    Reserve a GTA 6 seat <ArrowRight className="h-4 w-4 flex-none" aria-hidden />
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl px-4 md:px-8">
        {/* 2. Real numbers, from the bracket */}
        {finished && players > 0 && (
          <dl className="grid grid-cols-4 gap-2 border-y border-[#262932] py-4 text-center">
            {[
              [String(players), 'fighters'],
              [String(played), 'matches'],
              ['1', 'champion'],
              ['₹0', 'entry'],
            ].map(([n, l]) => (
              <div key={l}>
                <dt className="sr-only">{l}</dt>
                <dd className={`${fightFont.className} text-4xl font-bold leading-none text-[#F2C94C] md:text-5xl`}>{n}</dd>
                <dd className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#A39DAB]">{l}</dd>
              </div>
            ))}
          </dl>
        )}

        {/* 3. This week + Help build KHEL-O: the reasons to come back */}
        <CommunityHub tapped={tapped} />

        {/* 4. The crown */}
        {champ && finished && (
          <section ref={crownRef} className="relative mt-8 overflow-hidden rounded-3xl border border-[#6B5A2A] bg-gradient-to-br from-[#2A2210] via-[#16120E] to-[#0E0F13] p-5 md:p-7">
            {crownSeen && <Celebration id="community-crown-tekken-01" />}
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-champ-shine bg-gradient-to-r from-transparent via-[#FFE29A]/20 to-transparent" />
            <div className="relative grid items-center gap-5 md:grid-cols-[0.9fr_1.1fr]">
              {finished.challenge.championPhotoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- the champion photo from our S3, any size
                <img
                  src={finished.challenge.championPhotoUrl}
                  alt={`${champ.name}, the champion of Tekken #01`}
                  loading="lazy"
                  className="aspect-[4/5] w-full rounded-2xl border-4 border-[#F2C27A] object-cover md:aspect-[4/5]"
                />
              )}
              <div>
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-[#F2C27A]">
                  <Trophy className="h-4 w-4" aria-hidden /> Champion · Tekken #01
                </p>
                <h2 className={`${fightFont.className} mt-1 text-[3.2rem] font-bold uppercase leading-[0.9] md:text-6xl`}>{champ.name}</h2>
                <div className="mt-4 flex flex-col gap-2">
                  {finished.standings
                    .filter((s) => s.place > 1)
                    .map((s) => (
                      <p key={s.place} className="flex items-center gap-3 rounded-xl border border-[#262932] bg-[#16181E] px-3 py-2">
                        <span className={`${fightFont.className} w-10 text-2xl font-bold`} style={{ color: s.place === 2 ? '#C9CBD3' : '#D79A6B' }}>
                          {s.place === 2 ? '2ND' : '3RD'}
                        </span>
                        <span className="font-semibold">{s.name}</span>
                      </p>
                    ))}
                </div>
                <p className="mt-4 text-[15px] text-[#DADCE3]">
                  The crown is up for grabs at <b className="text-[#F4F1EC]">#02</b>. Think you can take it?
                </p>
              </div>
            </div>
          </section>
        )}

        {/* 5. #02: decided in the group */}
        <section className="mt-12 grid items-center gap-8 md:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E8675D]">#02</p>
            <h2 className={`${fightFont.className} mt-1 text-[2.6rem] font-bold uppercase leading-[0.92] md:text-6xl`}>
              Don&apos;t miss <span className="text-[#F2C94C]">#02.</span>
            </h2>
            <p className="mt-3 max-w-md text-[15px] text-[#C9C4CF]">
              The group votes on the next game, and the date drops there first. Everyone else finds out later.
            </p>
            <ul className="mt-5 max-w-md space-y-2">
              {GETS.map((g) => (
                <li key={g} className="flex items-start gap-2.5 text-[15px] text-[#DADCE3]">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7FE0A0]" aria-hidden />
                  {g}
                </li>
              ))}
            </ul>
            <div className="mt-6 max-w-md">
              <JoinButton where="bottom" onJoin={join} />
            </div>
          </div>
          <ChatDemo />
        </section>

        <div className="pb-28 pt-10">
          {upcoming && (
            <div className="flex flex-col gap-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[15px] text-[#DADCE3]">
                <b className="text-[#F4F1EC]">Want to play, not just watch?</b> {openToAll(upcoming.capacity) ? 'Free to play' : `${upcoming.capacity} free spots`} at {upcoming.cafe.name}. Takes a minute.
              </p>
              <Link
                href={`/challenge/${upcoming.slug}?join=1`}
                onClick={() => trackAction('challenge_teaser_click', { challenge: upcoming.slug, where: 'community' })}
                className="flex h-12 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#D0463C] px-5 font-semibold text-white hover:bg-[#E8675D]"
              >
                Sign up to play <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          )}
          <p className="mt-4 text-center text-xs text-[#8C8592]">
            Others in the group can see your WhatsApp number. Be decent: no spam, no selling, no abuse.
          </p>
        </div>
      </div>

      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-[#262932] bg-[#0A0809]/95 px-4 py-3 backdrop-blur transition-transform duration-300 ${stickyOn ? 'translate-y-0' : 'translate-y-full'}`}
        aria-hidden={!stickyOn}
      >
        <div className="mx-auto max-w-md">
          <a
            href={COMMUNITY_URL}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={stickyOn ? 0 : -1}
            onClick={() => join('sticky')}
            className={`${fightFont.className} flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] text-2xl font-bold uppercase tracking-wider text-[#06210F]`}
          >
            <MessageCircle className="h-5 w-5" aria-hidden /> Join the group
          </a>
        </div>
      </div>
    </main>
  );
}

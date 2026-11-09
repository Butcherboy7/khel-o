'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, BarChart3, Camera, ChevronDown, Check, CheckCheck, Copy, Pin, RotateCcw, Trophy, X } from 'lucide-react';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { Celebration } from '@/components/challenge/Celebration';
import { getBracket, getChallenge } from '@/lib/api/challenges';
import { trackAction } from '@/lib/api/analyticsEvents';
import { recordJoin } from '@/lib/communityJoin';
import { COMMUNITY_URL, FEATURED_CHALLENGE_SLUG, isUpcoming, openToAll, whatsappShare } from '@/lib/challenge';
import { communityScoreboard, type ScoreItem } from '@/lib/communityConfig';
import { createShare } from '@/lib/share';

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

const TILTS = [-2, 2, -2, 3, -1, 2, -3, 2, -2];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduced;
}

/** Where the visitor came from: ?src= on the link (the ad uses ig_squad_ad), or "share" for a friend's link. */
function visitSource(): string | undefined {
  const q = new URLSearchParams(window.location.search);
  return q.get('src') || (q.get('utm_source') === 'share' ? 'share' : undefined);
}

/** Real photos from Tekken #01 as stickers on two lanes drifting in opposite directions. The group photo leads.
 *  Height comes from the space left on the screen, so the strip shrinks on short phones and nothing else moves. */
function StickerStrip() {
  const laneA = MOMENTS.filter((_, n) => n % 2 === 0);
  const laneB = MOMENTS.filter((_, n) => n % 2 === 1);
  const lane = (items: typeof MOMENTS, cls: 'a' | 'b', offset: number) => (
    <div className="cm2-lane flex min-h-0 flex-1 items-center overflow-hidden">
      <div className={`cm2-trk ${cls}`}>
        {[...items, ...items].map((m, n) => (
          // eslint-disable-next-line @next/next/no-img-element -- pre-sized webp in /public, no optimiser needed
          <img
            key={`${m.src}-${n}`}
            src={`/community/${m.src}.webp`}
            alt={n < items.length ? m.label : ''}
            aria-hidden={n >= items.length}
            width={m.w}
            height={m.h}
            // Not lazy: on iPhone a lazy sticker has no width until it loads, so it never
            // counts as on screen and never loads, leaving only its white border.
            loading="eager"
            fetchPriority={cls === 'a' && n === 0 ? 'high' : undefined}
            className="cm2-stk"
            style={{ aspectRatio: `${m.w} / ${m.h}`, ['--r' as string]: `${TILTS[(n + offset) % TILTS.length]}deg` }}
          />
        ))}
      </div>
    </div>
  );
  return (
    <div className="cm2-strip -mx-3.5 flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
      {lane(laneA, 'a', 0)}
      {lane(laneB, 'b', 3)}
    </div>
  );
}

/** The scoreboard: one big line slides up to the next every 1.5s. With reduced motion every line shows, one per line. */
function Scoreboard({ items, reduced }: { items: ScoreItem[]; reduced: boolean }) {
  const n = items.length;
  const [i, setI] = useState(0);
  const [snap, setSnap] = useState(false);
  const still = reduced || n < 2;

  useEffect(() => {
    if (still) return;
    const t = setInterval(() => setI((v) => v + 1), 1500);
    return () => clearInterval(t);
  }, [still]);
  // After the clone of the first line slides in, jump back to the real first line with no animation.
  useEffect(() => {
    if (still || i !== n) return;
    const t = setTimeout(() => {
      setSnap(true);
      setI(0);
    }, 540);
    return () => clearTimeout(t);
  }, [i, n, still]);
  useEffect(() => {
    if (!snap) return;
    const t = setTimeout(() => setSnap(false), 40);
    return () => clearTimeout(t);
  }, [snap]);

  const row = (it: ScoreItem, key: string) => (
    <div key={key} className="cm2-rl">
      <span className="cm2-dot" aria-hidden />
      <span>
        {it.a}
        <em>{it.k}</em>
        {it.b}
      </span>
    </div>
  );
  return (
    <div className="flex-none border-y border-[#2C2833] py-1">
      <span className="sr-only">{items.map((it) => `${it.a}${it.k}${it.b}`).join(' ')}</span>
      <div className={still ? '' : 'cm2-roll'} aria-hidden>
        {still ? (
          items.map((it, k) => row(it, `s${k}`))
        ) : (
          <div className={`cm2-rt${snap ? ' snap' : ''}`} style={{ transform: `translateY(${-i * 30}px)` }}>
            {[...items, items[0]].map((it, k) => row(it, `r${k}`))}
          </div>
        )}
      </div>
    </div>
  );
}

/** /community: one job, a tap on Join. The first screen is exactly one screen at any phone height.
 *  Snapshots from #01 (results, the crown, the group chat) sit below it for anyone who scrolls. */
export function RecapClient() {
  const [tapped, setTapped] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [copy, setCopy] = useState<'idle' | 'done' | 'failed'>('idle');
  const reduced = useReducedMotion();
  const items = useMemo(() => communityScoreboard(), []);
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
    trackAction('community_view', { src: visitSource() });
  }, []);
  useEffect(() => {
    const on = () => setPinned(window.scrollY > 40);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);

  const join = (where: string) => {
    recordJoin(where);
    setTapped(true);
  };
  const sendToSquad = () => {
    const src = visitSource();
    const link = createShare({ path: '/community', context: 'community', campaign: 'community' }, 'whatsapp');
    trackAction('community_share_tap', { src, sid: new URL(link).searchParams.get('sid') });
    window.open(whatsappShare(`Found Hyderabad's gaming community. Free challenges and teammates. Join here: ${link}`), '_blank', 'noopener');
  };
  const copyInvite = async () => {
    trackAction('community_copy_tap', { src: visitSource() });
    try {
      await navigator.clipboard.writeText(COMMUNITY_URL);
      setCopy('done');
    } catch {
      setCopy('failed');
    }
    setTimeout(() => setCopy('idle'), 1800);
  };
  const toSnapshots = () => {
    trackAction('community_snapshots_tap', { src: visitSource() });
    document.getElementById('snapshots')?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const joinClass = `${fightFont.className} flex h-14 w-full items-center justify-center whitespace-nowrap rounded-2xl bg-[#25D366] text-[26px] font-bold uppercase tracking-[0.04em] text-[#06210F] transition-[transform,background-color] hover:bg-[#2EE073] active:scale-[0.98] focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white`;

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0A0809] text-[#F4F1EC]">
      {/* 1. One screen: what it is, proof it is real, what you get, one button */}
      <section
        className="cm2-hero relative mx-auto flex w-full max-w-md flex-col gap-2 overflow-hidden px-3.5 pb-3 pt-3"
        style={{ background: 'radial-gradient(120% 55% at 85% 0, rgba(232,103,93,.28), transparent 62%), #0A0809' }}
      >
        <div className="flex-none">
          <div className="mb-2 flex items-center justify-between gap-3">
            <Link
              href="/community"
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-white/25 bg-black/40 px-3.5 text-sm font-bold text-[#F4EFE7] transition-colors hover:border-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Community
            </Link>
            <Link href="/" aria-label="KHEL-O home">
              {/* eslint-disable-next-line @next/next/no-img-element -- tiny pixel-art wordmark, must not be smoothed */}
              <img src="/community/wordmark.png" alt="KHEL-O" width={120} height={20} className="h-5 w-auto [image-rendering:pixelated]" />
            </Link>
          </div>
          <p className="text-[12.5px] font-extrabold text-[#F2C94C]">#02 is coming. The group hears first.</p>
          <h1 className={`${fightFont.className} text-balance text-[2.25rem] font-bold uppercase leading-[0.95]`}>Hyderabad&apos;s gaming community</h1>
        </div>
        <StickerStrip />
        <p className="-mt-0.5 flex-none text-[11.5px] font-bold text-[#D9D4DF]">From our last challenge, #01.</p>
        <Scoreboard items={items} reduced={reduced} />
        <div className="flex-none">
          <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" onClick={() => join('community')} className={joinClass}>
            Join the community
          </a>
          <p className="mt-1.5 text-center text-xs text-[#CFCAD6]">Free. One tap away.</p>
        </div>
        <button
          type="button"
          onClick={toSnapshots}
          className="-mt-0.5 flex flex-none flex-col items-center text-[#F2C94C] focus-visible:rounded-lg focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Camera className="h-[18px] w-[18px]" aria-hidden />
          <ChevronDown className="cm2-chev -mt-0.5 h-[18px] w-[18px]" strokeWidth={2.4} aria-hidden />
          <span className="text-[10.5px] font-bold tracking-[0.02em] text-[#CFCAD6]">Snapshots from #01</span>
        </button>
      </section>

      {/* 2. Only if someone scrolls: snapshots from #01 */}
      <section id="snapshots" className="mx-auto w-full max-w-md scroll-mt-0 px-4 pb-28 pt-8 md:max-w-4xl md:px-8">
        <h2 className={`${fightFont.className} text-[2.6rem] font-bold uppercase leading-[0.95] md:text-6xl`}>Snapshots from #01</h2>
        {finished && players > 0 && (
          <p className={`${fightFont.className} mt-2 text-[1.6rem] font-bold uppercase leading-none text-[#E9E5EE] md:text-4xl`}>
            {players} fighters. {played} matches. <span className="text-[#F2C94C]">1 champion.</span>
          </p>
        )}

        {champ && finished && (
          <section ref={crownRef} className="relative mt-6 overflow-hidden rounded-3xl border border-[#6B5A2A] bg-gradient-to-br from-[#2A2210] via-[#16120E] to-[#0E0F13] p-5 md:p-7">
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
                <h3 className={`${fightFont.className} mt-1 text-[3.2rem] font-bold uppercase leading-[0.9] md:text-6xl`}>{champ.name}</h3>
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

        <div className="mt-8">
          <ChatDemo />
          <p className="mt-3 text-center text-xs text-[#8C8592]">Example of what the group posts.</p>
        </div>

        {upcoming && (
          <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] p-4 sm:flex-row sm:items-center sm:justify-between">
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
        <p className="mt-6 text-center text-xs text-[#8C8592]">Others in the group can see your WhatsApp number. Be decent: no spam, no selling, no abuse.</p>
      </section>

      {/* Join bar, pinned once someone scrolls past the first screen */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-[#0A0809] from-45% to-transparent px-3.5 pb-3.5 pt-6 transition-transform duration-300 ${pinned && !tapped ? 'translate-y-0' : 'translate-y-[110%]'}`}
        aria-hidden={!(pinned && !tapped)}
        inert={!(pinned && !tapped)}
      >
        <div className="mx-auto max-w-md">
          <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" onClick={() => join('community_pinned')} className={joinClass}>
            Join the community
          </a>
        </div>
      </div>

      {/* After the tap: bring your squad */}
      <div
        role="region"
        aria-label="Bring your squad"
        aria-hidden={!tapped}
        inert={!tapped}
        className={`fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-[22px] border-t border-[#3B6B4A] bg-[#101A14] px-4 pb-4 pt-2.5 shadow-[0_-14px_30px_rgba(0,0,0,0.5)] transition-transform duration-[400ms] ease-[cubic-bezier(.2,.8,.2,1)] ${tapped ? 'translate-y-0' : 'translate-y-[105%]'}`}
      >
        <div className="mx-auto mb-2.5 h-1 w-10 rounded bg-[#3B4A40]" aria-hidden />
        <button
          type="button"
          onClick={() => setTapped(false)}
          aria-label="Close"
          className="absolute right-2.5 top-2.5 flex h-9 w-9 items-center justify-center rounded-full text-[#9DB0A3] hover:bg-white/10"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <h2 className={`${fightFont.className} mb-2 pr-8 text-balance text-[26px] font-bold uppercase leading-none`}>Tap Join in WhatsApp. Then bring your squad.</h2>
        <p className="mb-2.5 rounded-xl rounded-br-sm bg-[#DCF8C6] px-3 py-2 text-xs text-[#17231A] [word-break:break-word]">
          Found Hyderabad&apos;s gaming community. Free challenges and teammates. Join here: <u>khel-o.com/community?…</u>
        </p>
        <button type="button" onClick={sendToSquad} className={joinClass}>
          Send to my squad
        </button>
        <div className="mt-2.5 flex items-center justify-between gap-2">
          <a
            href={COMMUNITY_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackAction('community_retry_tap', { src: visitSource() })}
            className="inline-flex min-h-[40px] items-center gap-1.5 text-[12.5px] font-bold text-[#7FE0A0] underline underline-offset-[3px]"
          >
            <RotateCcw className="h-4 w-4" aria-hidden /> WhatsApp didn&apos;t open? Tap here
          </a>
          <button
            type="button"
            onClick={copyInvite}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-[#3B6B4A] px-3 text-[12.5px] font-bold text-[#7FE0A0]"
          >
            <Copy className="h-4 w-4" aria-hidden /> {copy === 'done' ? 'Copied' : copy === 'failed' ? 'Press and hold to copy' : 'Copy link'}
          </button>
        </div>
      </div>
    </main>
  );
}

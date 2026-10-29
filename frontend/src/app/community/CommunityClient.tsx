'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, CheckCheck, MessageCircle, Pin } from 'lucide-react';
import { FightStage, fightFont } from '@/components/challenge/ChallengeHero';
import { getChallenge } from '@/lib/api/challenges';
import { trackAction } from '@/lib/api/analyticsEvents';
import { COMMUNITY_URL, FEATURED_CHALLENGE_SLUG, challengeDay, isUpcoming, openToAll } from '@/lib/challenge';

/** Plain words: what you get, in the order it happens. */
const GETS = [
  'The time and place of the event',
  'Your match: who you play, and when',
  'Results, photos and the next free event',
];

/** What the chat looks like. Illustrative: the kind of posts the group gets. */
const CHAT = [
  { pin: true, text: 'Welcome! Free Tekken event, 3 PM. Everything is pinned here.' },
  { text: 'Your match time is posted. Check the list.' },
  { text: 'Results and photos are up. Next event soon.' },
];

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      later(play, 1600 + CHAT.length * 2200 + 3000);
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
          <div className="flex min-h-[210px] flex-col justify-end gap-2 px-3 py-3">
            {CHAT.slice(0, shown).map((m, i) => (
              <div key={i} className="cm-bubble max-w-[90%] self-start rounded-2xl rounded-tl-sm bg-[#202C33] px-3 py-2 text-[13px] leading-snug text-[#E9EDEF]">
                {m.pin && (
                  <span className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#F2C94C]">
                    <Pin className="h-3 w-3" aria-hidden /> Pinned
                  </span>
                )}
                {m.text}
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

/** /community: the landing page for the WhatsApp Community ad and links.
 *  One job: get a tap on Join. Signing up to play stays on the challenge page. */
export function CommunityClient() {
  const [tapped, setTapped] = useState(false);
  const [stickyOn, setStickyOn] = useState(false);
  const heroBtn = useRef<HTMLAnchorElement>(null);
  const { data: ch } = useQuery({
    queryKey: ['challenges', FEATURED_CHALLENGE_SLUG],
    queryFn: () => getChallenge(FEATURED_CHALLENGE_SLUG),
    staleTime: 60_000,
    retry: false,
  });
  const upcoming = ch && isUpcoming(ch) ? ch : null;

  useEffect(() => {
    const el = heroBtn.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setStickyOn(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const join = (where: string) => {
    trackAction('community_join_tap', { where });
    setTapped(true);
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0A0809] text-[#F4F1EC]">
      <section className="relative isolate">
        <FightStage />
        <div className="relative mx-auto grid w-full max-w-4xl items-center gap-8 px-4 pb-10 pt-5 md:grid-cols-[1.15fr_0.85fr] md:gap-10 md:pb-16 md:pt-10">
          <div>
            <Link
              href="/"
              aria-label="Back to the KHEL-O home page"
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/20 bg-black/60 pl-3 pr-4 text-sm font-semibold text-[#F4F1EC] backdrop-blur hover:bg-black/80"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden /> Home
            </Link>

            {upcoming ? (
              <>
                <h1 className={`${fightFont.className} cm-rise mt-5 text-[2.9rem] font-bold uppercase leading-[0.95] md:text-[4.2rem]`}>
                  Free Tekken event <span className="text-[#E8675D]">{challengeDay(upcoming.startsAt).split(',')[0]}.</span>
                </h1>
                <p className="cm-rise mt-3 max-w-md text-base text-[#C9CBD3]" style={{ ['--cm-delay' as string]: '120ms' }}>
                  Tekken is a fighting video game. Join our WhatsApp group and we&apos;ll send you the time, the place and your match. Anyone can come and watch.
                </p>
              </>
            ) : (
              <>
                <h1 className={`${fightFont.className} cm-rise mt-5 text-[2.9rem] font-bold uppercase leading-[0.95] md:text-[4.2rem]`}>
                  Gamers in Hyderabad, <span className="text-[#E8675D]">one group.</span>
                </h1>
                <p className="cm-rise mt-3 max-w-md text-base text-[#C9CBD3]" style={{ ['--cm-delay' as string]: '120ms' }}>
                  Free events at real gaming cafés, and people to play with. Join on WhatsApp. Leave any time.
                </p>
              </>
            )}

            <div className="cm-rise mt-5 max-w-md" style={{ ['--cm-delay' as string]: '240ms' }}>
              <a
                ref={heroBtn}
                href={COMMUNITY_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => join('hero')}
                className={`cm-join ${fightFont.className} relative flex h-16 w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-[#25D366] text-[26px] font-bold uppercase tracking-wider text-[#06210F] transition-transform active:scale-[0.98]`}
              >
                <span className="cm-shine" aria-hidden />
                <MessageCircle className="relative h-6 w-6" aria-hidden />
                <span className="relative">Join the group</span>
              </a>
              <p className="mt-2 text-center text-sm text-[#A39DAB]">
                Free · one tap · leave any time
                {upcoming && (
                  <>
                    {' · starts in '}
                    <Countdown to={upcoming.startsAt} />
                  </>
                )}
              </p>

              {tapped && (
                <p className="mt-3 flex items-start gap-2 rounded-xl border border-[#3B6B4A] bg-[#13221A] px-3 py-2.5 text-sm" role="status">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7FE0A0]" aria-hidden />
                  <span>
                    In WhatsApp, tap <b>Join</b>. Then open <b>Challengers</b> for the Tekken updates.{' '}
                    <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#7FE0A0] underline">
                      Didn&apos;t open? Try again
                    </a>
                  </span>
                </p>
              )}
            </div>

            <ul className="cm-rise mt-6 max-w-md space-y-2" style={{ ['--cm-delay' as string]: '360ms' }}>
              {GETS.map((g) => (
                <li key={g} className="flex items-start gap-2.5 text-[15px] text-[#DADCE3]">
                  <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7FE0A0]" aria-hidden />
                  {g}
                </li>
              ))}
            </ul>
          </div>

          <div className="cm-rise hidden sm:block" style={{ ['--cm-delay' as string]: '300ms' }}>
            <ChatDemo />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-4xl px-4 pb-24">
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

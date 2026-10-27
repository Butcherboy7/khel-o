'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarDays, Check, CheckCheck, Megaphone, MessageCircle, MessagesSquare, Pin, Swords, Users } from 'lucide-react';
import { FightStage, fightFont } from '@/components/challenge/ChallengeHero';
import { getChallenge } from '@/lib/api/challenges';
import { trackAction } from '@/lib/api/analyticsEvents';
import { COMMUNITY_URL, FEATURED_CHALLENGE_SLUG, challengeDay, challengeTimeRange, isUpcoming } from '@/lib/challenge';

const SPACES = [
  { icon: Megaphone, name: 'Announcements', what: 'Official KHEL-O news only: new challenges, new cafés, results. Quiet, a few posts a week.' },
  { icon: MessagesSquare, name: 'Lobby', what: 'The chat. Say hi, find people to play with, polls, gaming talk.' },
  { icon: Swords, name: 'Challengers', what: 'Every challenge: how to sign up, rules, updates on the day and results.' },
];

const STEPS = [
  ['Saturday night', 'The bracket drops: who plays who, and in what order.'],
  ['Sunday, 2:30 PM', 'Check-in opens at the café. Show your QR at the door.'],
  ['After the last match', 'Results, photos, and the next challenge.'],
];

/** What the chat will look like. Illustrative: these are the kinds of posts the group gets. */
const CHAT = [
  { pin: true, text: 'Welcome to Tekken Challenge #01. Everything you need is pinned here.' },
  { text: 'Bracket is LIVE. Find your match 👀' },
  { text: 'Check-in is open at the café ✅ QR ready?' },
  { text: '🏆 Results are in. Next challenge drops soon.' },
];

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Fades and lifts into view once. Content stays visible if scripts never run. */
function Reveal({ children, delay = 0, className = '' }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'ssr' | 'armed' | 'shown'>('ssr');
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      setState('shown');
      return;
    }
    setState('armed');
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setState('shown');
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`${state === 'armed' ? 'cm-hidden' : state === 'shown' ? 'cm-in' : ''} ${className}`}
      style={{ ['--cm-delay' as string]: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

function Countdown({ to }: { to: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return <div className="h-[74px]" aria-hidden />;
  const ms = Math.max(0, new Date(to).getTime() - now);
  const parts = [
    ['days', Math.floor(ms / 86_400_000)],
    ['hrs', Math.floor(ms / 3_600_000) % 24],
    ['min', Math.floor(ms / 60_000) % 60],
    ['sec', Math.floor(ms / 1000) % 60],
  ] as const;
  return (
    <div className={`${fightFont.className} flex items-stretch gap-2`} role="timer" aria-label="Time until the first fight">
      {parts.map(([label, v]) => (
        <div key={label} className="flex w-[68px] flex-col items-center border border-[#3A1F22] bg-black/50 py-1.5 chs-chamfer">
          <span className="text-[34px] font-bold leading-none tabular-nums text-[#F2C94C]">{String(v).padStart(2, '0')}</span>
          <span className="text-[13px] uppercase tracking-[0.12em] text-[#A39DAB]">{label}</span>
        </div>
      ))}
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
        later(() => setTyping(true), 900 + i * 2400);
        later(() => {
          setTyping(false);
          setShown(i + 1);
        }, 1900 + i * 2400);
      });
      later(play, 1900 + CHAT.length * 2400 + 3200);
    };
    play();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div className="cm-float relative mx-auto w-full max-w-[330px]">
      <div className="rounded-[34px] border border-[#3A2F44] bg-[#120E16] p-2 shadow-[0_30px_80px_rgba(208,70,60,0.28)]">
        <div className="overflow-hidden rounded-[26px] bg-[#0B141A]">
          <div className="flex items-center gap-3 bg-[#1F2C34] px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#D0463C]">
              <Swords className="h-4 w-4 text-white" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-[#E9EDEF]">KHEL-O · Challengers</span>
              <span className="block text-[11px] text-[#8696A0]">Announcements and updates</span>
            </span>
          </div>
          <div className="flex min-h-[300px] flex-col justify-end gap-2 px-3 py-4">
            {CHAT.slice(0, shown).map((m, i) => (
              <div key={i} className="cm-bubble max-w-[88%] self-start rounded-2xl rounded-tl-sm bg-[#202C33] px-3 py-2 text-[13px] leading-snug text-[#E9EDEF]">
                {m.pin && (
                  <span className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-[#F2C94C]">
                    <Pin className="h-3 w-3" aria-hidden /> Pinned
                  </span>
                )}
                {m.text}
                <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-[#8696A0]">
                  KHEL-O <CheckCheck className="h-3 w-3 text-[#53BDEB]" aria-hidden />
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
      <p className="mt-3 text-center text-xs text-[#8C8592]">A look at what the group gets. Real posts start when you join.</p>
    </div>
  );
}

/** /community: the landing page for the WhatsApp Community ad and links.
 *  Joining the community is its own step; challenge sign-up stays on the
 *  challenge page so the two are never confused. */
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

  const joinButton = (where: string, ref?: React.Ref<HTMLAnchorElement>, className = '') => (
    <a
      ref={ref}
      href={COMMUNITY_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => join(where)}
      className={`cm-join ${fightFont.className} group relative flex h-16 w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-[#25D366] text-[26px] font-bold uppercase tracking-wider text-[#06210F] transition-transform active:scale-[0.98] ${className}`}
    >
      <span className="cm-shine" aria-hidden />
      <MessageCircle className="relative h-6 w-6" aria-hidden />
      <span className="relative">Join on WhatsApp</span>
    </a>
  );

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#0A0809] text-[#F4F1EC]">
      {/* Hero */}
      <section className="relative isolate">
        <FightStage />
        <div className="relative mx-auto grid w-full max-w-5xl items-center gap-10 px-4 pb-14 pt-8 md:grid-cols-[1.1fr_0.9fr] md:gap-12 md:pb-20 md:pt-14">
          <div>
            <Link href="/" className="block text-sm font-bold tracking-wide text-[#E8675D]">KHEL-O</Link>

            {upcoming ? (
              <>
                <p className={`${fightFont.className} cm-rise mt-6 inline-block bg-[#D0463C] px-3 py-0.5 text-xl font-semibold uppercase tracking-widest`} style={{ ['--cm-delay' as string]: '0ms' }}>
                  Free · {upcoming.game}
                </p>
                <h1 className={`${fightFont.className} mt-3 text-[3.6rem] font-bold uppercase leading-[0.9] md:text-[5.2rem]`}>
                  {['Your', 'bracket', 'drops'].map((w, i) => (
                    <span key={w} className="cm-rise mr-3 inline-block" style={{ ['--cm-delay' as string]: `${120 + i * 110}ms` }}>
                      {w}
                    </span>
                  ))}
                  <span className="cm-rise inline-block text-[#E8675D]" style={{ ['--cm-delay' as string]: '480ms' }}>
                    in this chat.
                  </span>
                </h1>
                <p className="cm-rise mt-4 max-w-md text-[#C9CBD3]" style={{ ['--cm-delay' as string]: '650ms' }}>
                  {upcoming.title} is {challengeDay(upcoming.startsAt)} at {upcoming.cafe.name}. Match order, check-in and results are
                  posted only in this WhatsApp community.
                </p>
                <div className="cm-rise mt-5" style={{ ['--cm-delay' as string]: '780ms' }}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[#A39DAB]">First fight in</p>
                  <Countdown to={upcoming.startsAt} />
                </div>
              </>
            ) : (
              <>
                <h1 className={`${fightFont.className} cm-rise mt-6 text-[3.6rem] font-bold uppercase leading-[0.9] md:text-[5.2rem]`}>
                  Hyderabad gamers,<br />
                  <span className="text-[#E8675D]">one group chat.</span>
                </h1>
                <p className="cm-rise mt-4 max-w-md text-[#C9CBD3]" style={{ ['--cm-delay' as string]: '200ms' }}>
                  Challenges at real cafés, café news before anyone else, and people to play with. Free on WhatsApp. Leave any time.
                </p>
              </>
            )}

            <div className="cm-rise mt-6 max-w-md" style={{ ['--cm-delay' as string]: '900ms' }}>
              {joinButton('hero', heroBtn)}
              <p className="mt-2 text-center text-xs text-[#8C8592]">Free. One tap. Leave any time.</p>
              {tapped && (
                <div className="mt-3 rounded-2xl border border-[#3B6B4A] bg-[#13221A] p-4 text-sm" role="status">
                  <p className="flex items-center gap-1.5 font-semibold text-[#7FE0A0]">
                    <Check className="h-4 w-4" aria-hidden /> One more step in WhatsApp
                  </p>
                  <p className="mt-1 text-[#DADCE3]">
                    Tap <b>Join community</b> there, then open <b>Challengers</b> and <b>Lobby</b> to join them too.
                  </p>
                  <a href={COMMUNITY_URL} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-semibold text-[#7FE0A0] underline">
                    WhatsApp didn&apos;t open? Try again
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="cm-rise" style={{ ['--cm-delay' as string]: '500ms' }}>
            <ChatDemo />
          </div>
        </div>
      </section>

      <div className="mx-auto w-full max-w-5xl px-4 pb-28">
        {/* What lands */}
        <Reveal>
          <h2 className={`${fightFont.className} text-4xl font-bold uppercase`}>What lands in your chat</h2>
        </Reveal>
        <ol className="mt-4 grid gap-3 md:grid-cols-3">
          {STEPS.map(([when, what], i) => (
            <li key={when}>
              <Reveal delay={i * 120} className="h-full">
                <div className="h-full rounded-2xl border border-[#262932] bg-[#16181E] p-4 transition-colors hover:border-[#5A2A26]">
                  <span className={`${fightFont.className} text-3xl font-bold text-[#F2C94C]`}>0{i + 1}</span>
                  <p className="mt-1 font-semibold">{when}</p>
                  <p className="mt-1 text-sm text-[#A3A6B1]">{what}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
        <Reveal>
          <p className="mt-3 text-xs text-[#A3A6B1]">
            WhatsApp shows new members only what is posted after they join. The pinned welcome message at the top has everything you need.
          </p>
        </Reveal>

        {/* Spaces */}
        <Reveal>
          <h2 className={`${fightFont.className} mt-12 text-4xl font-bold uppercase`}>Three rooms, one tap</h2>
        </Reveal>
        <ul className="mt-4 grid gap-3 md:grid-cols-3">
          {SPACES.map(({ icon: Icon, name, what }, i) => (
            <li key={name}>
              <Reveal delay={i * 120} className="h-full">
                <div className="flex h-full gap-3 rounded-2xl border border-[#262932] bg-[#16181E] p-4 transition-transform duration-200 hover:-translate-y-1 hover:border-[#5A2A26]">
                  <Icon className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#E8675D]" aria-hidden />
                  <span>
                    <span className="block font-semibold">{name}</span>
                    <span className="block text-sm text-[#A3A6B1]">{what}</span>
                  </span>
                </div>
              </Reveal>
            </li>
          ))}
        </ul>

        {/* Next challenge */}
        {upcoming && (
          <Reveal>
            <div className="mt-12 rounded-2xl border border-[#5A2A26] bg-[#1A1114] p-5 md:flex md:items-center md:justify-between md:gap-6">
              <div>
                <p className={`${fightFont.className} text-xl font-semibold uppercase tracking-widest text-[#E8675D]`}>Free challenge · {upcoming.game}</p>
                <p className="mt-1 font-heading text-xl font-bold">{upcoming.title}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-[#A3A6B1]">
                  <CalendarDays className="h-4 w-4 flex-shrink-0" aria-hidden />
                  {challengeDay(upcoming.startsAt)}, {challengeTimeRange(upcoming.startsAt, upcoming.endsAt)} · {upcoming.cafe.name}
                </p>
                <p className="mt-2 text-sm text-[#DADCE3]">
                  {upcoming.capacity} player spots, then a waitlist. Signing up to play is separate from joining the community.
                </p>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-[#DADCE3]">
                  <Users className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#7FE0A0]" aria-hidden />
                  <span>Anyone can come to watch{upcoming.visitorOffer ? `. ${upcoming.visitorOffer}.` : '.'}</span>
                </p>
              </div>
              <Link
                href={`/challenge/${upcoming.slug}?join=1`}
                onClick={() => trackAction('challenge_teaser_click', { challenge: upcoming.slug, where: 'community' })}
                className="mt-4 flex h-12 flex-shrink-0 items-center justify-center gap-1.5 rounded-xl bg-[#D0463C] px-6 font-semibold text-white hover:bg-[#E8675D] md:mt-0"
              >
                Lock my spot <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </Reveal>
        )}

        <Reveal>
          <h2 className="mt-12 text-xs font-bold uppercase tracking-[0.1em] text-[#A3A6B1]">Good to know</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[#C9CBD3]">
            <li>People in the groups you join can see your number, like any WhatsApp group.</li>
            <li>Mute what you don&apos;t want. Announcements stays quiet.</li>
            <li>Be decent: no spam, no selling, no abuse. Admins remove people who break this.</li>
          </ul>
        </Reveal>

        <Reveal>
          <div className="mx-auto mt-10 max-w-md">{joinButton('bottom')}</div>
        </Reveal>
      </div>

      {/* Sticky join once the hero button has scrolled away */}
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
            <MessageCircle className="h-5 w-5" aria-hidden /> Join on WhatsApp
          </a>
        </div>
      </div>
    </main>
  );
}

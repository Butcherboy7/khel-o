'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarDays, Clock, MapPin, ScrollText, Users, MessageCircle, ChevronRight, Check, Trophy, Play, Send } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { trackAction } from '@/lib/api/analyticsEvents';
import { getChallenge, getMyChallenge, type Challenge, type MyEntry } from '@/lib/api/challenges';
import { COMMUNITY_URL, challengeDay, challengeTime, challengeTimeRange, rememberUtm, whatsappShare } from '@/lib/challenge';
import { markChallengeSeen } from '@/lib/challengeNudge';
import { SimpleMarkdown } from '@/components/challenge/SimpleMarkdown';
import { ChallengeSignUpSheet } from '@/components/challenge/ChallengeSignUpSheet';
import { ChallengeIntro } from '@/components/challenge/ChallengeIntro';
import { ChallengeVideo, isVideoId } from '@/components/challenge/ChallengeVideo';
import { FightHud, FightStage, PlayerSelect, RoundFight, fightFont } from '@/components/challenge/ChallengeHero';

const REFRESH_MS = 30_000;

export function ChallengeClient({ slug, initial, showIntro = false }: { slug: string; initial: Challenge | null; showIntro?: boolean }) {
  const router = useRouter();
  const { isAuthenticated, isHydrated } = useAuthStore();
  const [ch, setCh] = useState<Challenge | null>(initial);
  const [missing, setMissing] = useState(false);
  // They found it: no more pop-up or New tag for this challenge.
  useEffect(() => markChallengeSeen(slug), [slug]);
  const [entry, setEntry] = useState<MyEntry | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const startBtn = useRef<HTMLButtonElement>(null);
  const videoWrap = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const glided = useRef(false);

  // Landing from the reel: once the intro is done, glide down once so the sign-up
  // button sits mid-screen with the video under it. Any touch, scroll or key
  // press from the person cancels it, and it never fights a sign-up sheet.
  const ready = !!ch;
  useEffect(() => {
    if (!ready || glided.current) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
    };
    const events = ['touchstart', 'wheel', 'keydown', 'pointerdown'] as const;
    events.forEach((e) => window.addEventListener(e, cancel, { passive: true, once: true }));
    const t = setTimeout(() => {
      glided.current = true;
      const el = startBtn.current;
      if (cancelled || !el || window.scrollY > 40) return;
      // Bring the whole video into view with the share and community buttons still under it
      // (above the sticky sign-up bar); if the screen is too short for all of that, the
      // top of the video card wins. With no video, centre the sign-up button as before.
      const wrap = videoWrap.current;
      const actions = actionsRef.current;
      if (wrap && actions) {
        const top = wrap.getBoundingClientRect().top + window.scrollY;
        const bottom = actions.getBoundingClientRect().bottom + window.scrollY;
        const y = Math.min(bottom - (window.innerHeight - 88), top - 48);
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      trackAction('challenge_autoscroll', { challenge: slug });
    }, showIntro ? 5200 : 1800);
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, cancel));
    };
  }, [ready, showIntro, slug]);

  // The real count, kept fresh while the page is open.
  useEffect(() => {
    const load = () => {
      if (document.hidden) return;
      getChallenge(slug)
        .then((c) => {
          setCh(c);
          setMissing(false);
        })
        .catch(() => setMissing((m) => m || !initial));
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [slug, initial]);

  useEffect(() => {
    rememberUtm(window.location.search);
    trackAction('challenge_page_view', { challenge: slug });
  }, [slug]);

  // Already signed up? Then the button takes them to their page instead.
  useEffect(() => {
    if (!isHydrated || !isAuthenticated) return;
    getMyChallenge(slug)
      .then((m) => setEntry(m.entry))
      .catch(() => undefined);
  }, [slug, isHydrated, isAuthenticated]);

  // Back from the email sign-in page with ?join=1: carry on with the form.
  useEffect(() => {
    if (!isHydrated) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get('join') === '1') {
      setSheetOpen(true);
      q.delete('join');
      const rest = q.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${rest ? `?${rest}` : ''}`);
    }
  }, [isHydrated]);

  const start = useCallback((where: 'hero' | 'sticky') => {
    trackAction('challenge_signup_started', { challenge: slug, signedIn: isAuthenticated, where });
    setSheetOpen(true);
  }, [slug, isAuthenticated]);

  if (!ch) {
    return (
      <Shell>
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
          {missing ? (
            <>
              <h1 className="font-heading text-2xl font-bold">No challenge here</h1>
              <p className="text-sm text-[#A3A6B1]">The link may be wrong, or the challenge isn&apos;t open yet.</p>
              <Link href="/" className="mt-2 text-sm font-semibold text-[#E8675D] underline">Go to KHEL-O</Link>
            </>
          ) : (
            <p className="text-sm text-[#A3A6B1]">Loading…</p>
          )}
        </div>
      </Shell>
    );
  }

  const active = entry && (entry.status === 'confirmed' || entry.status === 'waitlist');
  const full = ch.spotsLeft === 0;
  const open = ch.status === 'open';
  const filled = Math.min(ch.confirmed, ch.capacity);

  return (
    <Shell>
      {ch.status === 'draft' && (
        <p className="mb-4 rounded-xl border border-[#E8A33D]/40 bg-[#E8A33D]/10 px-3 py-2 text-xs font-semibold text-[#F2C27A]">
          Draft: only admins can see this page.
        </p>
      )}

      {showIntro && open && (
        <>
          <ChallengeIntro slug={ch.slug} />
          <RoundFight delayMs={2700} />
        </>
      )}

      {/* First screen: the fight is about to start, and you're player one. */}
      <section className="relative -mx-4 -mt-6 px-4 pb-6 pt-5">
        <FightStage />
        <div className="relative">
          <FightHud />
          <h1 className={`${fightFont.className} relative mt-6 uppercase`}>
            <span
              className="chs-title-slash absolute left-[-4%] top-[44%] h-3 w-[86%] bg-[#D0463C]/80"
              aria-hidden
            />
            <span className="relative block -skew-x-[8deg] text-[78px] font-bold leading-[0.8] tracking-[0.01em] text-white [text-shadow:0_6px_24px_rgba(0,0,0,0.7)]">
              {ch.game}
            </span>
            <span className="relative mt-1 block -skew-x-[8deg] text-[40px] font-semibold leading-[0.9] tracking-[0.04em] text-[#E8675D]">
              Challenge {ch.title.match(/#\s?\d+/)?.[0] ?? ''}
            </span>
          </h1>
          {ch.status !== 'finished' && ch.status !== 'cancelled' && (
            <div className="cm-rise relative mt-4 -skew-x-[6deg] overflow-hidden bg-[#F2C94C] px-4 py-2.5 text-[#1A1306] shadow-[0_10px_30px_rgba(242,201,76,0.22)]">
              <span className="cm-shine" aria-hidden />
              <div className="relative skew-x-[6deg]">
                <p className={`${fightFont.className} text-[46px] font-bold uppercase leading-none tracking-wide`}>
                  <span className="cm-free relative mr-2 inline-block bg-[#1A1306] px-2 text-[#F2C94C]">Free</span>
                  to enter
                </p>
                {ch.prizeLine && <p className="mt-1 text-[17px] font-bold leading-tight">{ch.prizeLine}</p>}
                {ch.prizeNote && <p className="mt-0.5 text-[13px] font-medium leading-snug text-[#3A2E0A]">{ch.prizeNote}</p>}
              </div>
            </div>
          )}
          <p className="mt-3 text-balance font-heading text-[19px] font-bold leading-[1.15] text-white">
            {ch.heroLine || 'Free to play. Just show up.'}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 text-sm font-semibold">
            <Chip icon={<CalendarDays className="h-4 w-4" />}>{challengeDay(ch.startsAt)}</Chip>
            <Chip icon={<Clock className="h-4 w-4" />}>{challengeTimeRange(ch.startsAt, ch.endsAt)}</Chip>
            <Chip icon={<MapPin className="h-4 w-4" />}>{ch.cafe.name.replace(/ Gaming Lounge$/i, '')}</Chip>
          </div>
          {open && !active && (
            <button
              type="button"
              ref={startBtn}
              onClick={() => start('hero')}
              className="chv-start mt-5 flex h-[68px] w-full flex-col items-center justify-center bg-[#D0463C] text-white transition-colors [clip-path:polygon(3%_0,100%_0,97%_100%,0_100%)] hover:bg-[#B23A31] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <span className={`${fightFont.className} flex items-center gap-2 text-[34px] font-bold uppercase leading-none tracking-[0.08em]`}>
                <Play className="h-6 w-6 fill-current" /> {full ? 'Join the waitlist' : 'Sign up for free'}
              </span>
              <span className="text-xs font-semibold text-white/90">{full ? 'Free · seats open up when people don’t show' : 'Free · takes under a minute'}</span>
            </button>
          )}
          {isVideoId(ch.videoId) && (
            <div ref={videoWrap}>
              <ChallengeVideo slug={slug} videoId={ch.videoId} cafe={ch.cafe.name.replace(/ Gaming Lounge$/i, '')} />
            </div>
          )}
          <div ref={actionsRef} className="mt-3 grid grid-cols-2 gap-2">
            <a
              href={whatsappShare(`${ch.game} challenge, free to play. ${challengeDay(ch.startsAt)}, ${challengeTimeRange(ch.startsAt, ch.endsAt)} at ${ch.cafe.name}. You vs me?`)}
              onClick={(e) => {
                e.currentTarget.href = whatsappShare(
                  `${ch.game} challenge, free to play. ${challengeDay(ch.startsAt)}, ${challengeTimeRange(ch.startsAt, ch.endsAt)} at ${ch.cafe.name}. You vs me? ${window.location.origin}/challenge/${ch.slug}`,
                );
                trackAction('challenge_invite_friend', { challenge: slug, where: 'hero' });
              }}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center justify-center gap-1.5 whitespace-nowrap border border-white/25 bg-black/40 px-2 text-[13px] font-semibold text-white transition-colors hover:border-white/50"
            >
              <Send className="h-4 w-4" /> Challenge a friend
            </a>
            <a
              href={ch.communityUrl || COMMUNITY_URL}
              onClick={() => trackAction('challenge_community_click', { challenge: slug, where: 'hero' })}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[52px] items-center justify-center gap-1.5 whitespace-nowrap border border-[#25D366]/50 bg-[#25D366]/15 px-2 text-[13px] font-semibold text-[#9BF0B9] transition-colors hover:bg-[#25D366]/25"
            >
              <MessageCircle className="h-4 w-4" /> Join the community
            </a>
          </div>
          <p className="mt-4 text-[15px] text-[#C9C0C4]">Remember those 1v1s with your friends at home? This time it&apos;s on the big screen.</p>
        </div>
      </section>

      {/* Spots: the real count, as a select screen */}
      <section className="mt-2" aria-live="polite">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className={`${fightFont.className} text-[30px] font-semibold uppercase leading-none tracking-wide`}>
            {full ? `All ${ch.capacity} players in` : filled === 0 ? 'Player 1 is still open' : `${filled} in · ${ch.spotsLeft} open`}
          </h2>
          {ch.waitlist > 0 && <p className="text-xs text-[#A3A6B1]">{ch.waitlist} on the waitlist</p>}
        </div>
        {ch.capacity <= 20 ? (
          <PlayerSelect capacity={ch.capacity} filled={filled} open={open} />
        ) : (
          <div className="mt-3 flex gap-1" aria-hidden>
            {Array.from({ length: ch.capacity }, (_, i) => (
              <span key={i} className={`h-2 flex-1 rounded-full ${i < filled ? 'bg-[#D0463C]' : 'bg-[#2A2D36]'}`} />
            ))}
          </div>
        )}
        <p className="mt-3 text-sm text-[#A3A6B1]">
          {!open
            ? ch.status === 'closed' && !ch.checkinClosedAt && ch.waitlist > 0
              ? 'Sign-ups are closed. Already on the waitlist? Come anyway: if someone doesn’t show, the next waitlist player there plays.'
              : 'The spots are set.'
            : full
            ? 'The waitlist is open. Waitlist players are welcome on the day, and if someone doesn’t show, the next waitlist player there plays.'
            : `The first ${ch.capacity} to sign up play. After that, the waitlist opens.`}
        </p>
      </section>

      <a
        href={ch.cafe.mapsUrl ?? undefined}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackAction('challenge_map_click', { challenge: slug })}
        className="mt-4 flex items-center gap-3 rounded-2xl border border-[#262932] bg-[#16181E] px-4 py-3 transition-colors hover:border-[#3A3E4A]"
      >
        <MapPin className="h-4 w-4 flex-shrink-0 text-[#E8675D]" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{ch.cafe.name}</span>
          <span className="block truncate text-xs text-[#A3A6B1]">{ch.cafe.address || ch.cafe.city}</span>
        </span>
        {ch.cafe.mapsUrl && <span className="text-xs font-semibold text-[#E8675D]">Map</span>}
      </a>

      {/* Rewards (never "prizes": payment partners read the site) */}
      {ch.prizesMd.trim() && (
        <section className="mt-8">
          <h2 className="font-heading text-xl font-bold">Rewards</h2>
          <SimpleMarkdown text={ch.prizesMd} className="mt-3 text-[15px] leading-relaxed text-[#DADCE3]" />
        </section>
      )}

      {/* How it works */}
      <section className="mt-8">
        <h2 className="font-heading text-xl font-bold">How it works</h2>
        <ol className="mt-3 flex flex-col gap-3 text-[15px] text-[#DADCE3]">
          <Step n={1}>Sign up free on KHELO with your name and number.</Step>
          <Step n={2}>
            Check in at the café from {challengeTime(ch.checkinOpensAt)} to {challengeTime(ch.checkinClosesAt)} with the QR on your
            KHELO page.
          </Step>
          <Step n={3}>The bracket goes up live on the screen once check-in closes.</Step>
          <Step n={4}>
            {ch.format}. Best of {ch.bestOf}
            {ch.finalBestOf !== ch.bestOf ? `, final best of ${ch.finalBestOf}` : ''}.
          </Step>
        </ol>
        {(ch.drawnAt || ch.status === 'finished') && (
          <Link
            href={`/challenge/${ch.slug}/bracket`}
            className="mt-4 flex items-center gap-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] px-4 py-3 transition-colors hover:border-[#E8675D]"
          >
            <Trophy className="h-4 w-4 text-[#F2C27A]" />
            <span className="flex-1 font-semibold">{ch.status === 'finished' ? 'See the results' : 'Follow the live bracket'}</span>
            <ChevronRight className="h-4 w-4 text-[#A3A6B1]" />
          </Link>
        )}
        <Link
          href={`/challenge/${ch.slug}/rules`}
          className="mt-4 flex items-center gap-3 rounded-2xl border border-[#262932] bg-[#16181E] px-4 py-3 transition-colors hover:border-[#3A3E4A]"
        >
          <ScrollText className="h-4 w-4 text-[#E8675D]" />
          <span className="flex-1 font-semibold">Read the rules</span>
          <ChevronRight className="h-4 w-4 text-[#A3A6B1]" />
        </Link>
      </section>

      {/* Watching is open to everyone: the spots above are only for players. */}
      <section className="mt-8 rounded-2xl border border-[#3B6B4A] bg-[#13221A] p-4">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold">
          <Users className="h-5 w-5 text-[#7FE0A0]" /> Not playing? Come watch
        </h2>
        <p className="mt-1 text-sm text-[#DADCE3]">
          The {ch.capacity} spots are only for players. Anyone can come to {ch.cafe.name} on the day to watch and cheer. No sign-up needed
          to watch.
        </p>
        {ch.visitorOffer && <p className="mt-2 text-sm font-semibold text-[#7FE0A0]">{ch.visitorOffer}</p>}
      </section>

      {/* FAQ */}
      <section className="mt-8">
        <h2 className="font-heading text-xl font-bold">Questions</h2>
        <dl className="mt-3 flex flex-col divide-y divide-[#262932] rounded-2xl border border-[#262932] bg-[#16181E]">
          <Faq q="Is it free?" a="Yes. Signing up and playing cost nothing." />
          <Faq q="What if I’m on the waitlist?" a="Come anyway. If someone doesn’t show up, the next waitlist player who’s there plays." />
          <Faq
            q="Can my friends come?"
            a={`Yes. Anyone can come to watch, no sign-up needed. To play, they sign up here: the first ${ch.capacity} get spots, then the waitlist.`}
          />
          <Faq q="Will I be filmed?" a="Only if you say yes when you sign up. If you say no, the camera stays off you." />
          <Faq q="Can’t make it after all?" a="Tap “Can’t make it” on your KHELO page, so the next person gets your spot." />
        </dl>
      </section>

      {ch.communityUrl && (
        <a
          href={ch.communityUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackAction('challenge_community_click', { challenge: slug, where: 'page' })}
          className="mt-8 flex items-center gap-3 rounded-2xl border border-[#25D366]/30 bg-[#25D366]/10 px-4 py-3 text-sm"
        >
          <MessageCircle className="h-4 w-4 text-[#25D366]" />
          <span className="flex-1">
            <span className="block font-semibold">Join the KHELO community on WhatsApp</span>
            <span className="block text-xs text-[#A3A6B1]">Hear about every challenge first. Optional.</span>
          </span>
          <ChevronRight className="h-4 w-4 text-[#A3A6B1]" />
        </a>
      )}

      {/* Sticky action */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#262932] bg-[#0E0F13]/95 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          {active ? (
            <button
              type="button"
              onClick={() => router.push(`/challenge/${ch.slug}/me`)}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#1F2A22] font-semibold text-[#7FE0A0]"
            >
              <Check className="h-5 w-5" />
              {entry!.status === 'confirmed' ? `You’re in · Spot #${entry!.rank}` : `You’re on the waitlist · #${entry!.rank}`}
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : open ? (
            <button
              type="button"
              onClick={() => start('sticky')}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#D0463C] font-heading text-lg font-bold text-white transition-colors hover:bg-[#B23A31] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Play className="h-5 w-5 fill-current" />
              {full ? 'Join the waitlist · free' : 'Sign up for free'}
            </button>
          ) : (
            <p className="flex h-14 items-center justify-center rounded-2xl bg-[#16181E] text-sm font-semibold text-[#A3A6B1]">
              {ch.status === 'finished' ? 'This challenge has finished' : 'Sign-ups are closed'}
            </p>
          )}
        </div>
      </div>

      <ChallengeSignUpSheet
        challenge={ch}
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onJoined={() => router.push(`/challenge/${ch.slug}/me?new=1`)}
      />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#0A0809] text-[#F4F1EC] selection:bg-[#D0463C] selection:text-white">
      <header className="mx-auto flex max-w-xl items-center justify-between px-4 pt-4">
        <Link href="/" aria-label="Back to the KHEL-O home page" className="relative z-10 inline-flex h-11 items-center gap-1.5 rounded-full border border-white/20 bg-black/60 pl-3 pr-4 text-sm font-semibold text-[#F4F1EC] backdrop-blur hover:bg-black/80">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Home
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-32 pt-6">{children}</main>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 border border-white/15 bg-black/45 px-3 py-1.5">
      <span className="text-[#E8675D]">{icon}</span>
      {children}
    </span>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#2A2D36] text-xs font-bold">{n}</span>
      <span>{children}</span>
    </li>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="px-4 py-3">
      <dt className="font-semibold">{q}</dt>
      <dd className="mt-1 text-sm text-[#A3A6B1]">{a}</dd>
    </div>
  );
}

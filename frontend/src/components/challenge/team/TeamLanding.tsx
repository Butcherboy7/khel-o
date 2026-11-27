'use client';

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, Gamepad2, Instagram, MapPin, Share2 } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { trackAction } from '@/lib/api/analyticsEvents';
import { getChallenge, type Challenge } from '@/lib/api/challenges';
import { getMyTeamEntry, type MyTeamEntry, type TeamInfo } from '@/lib/api/teamChallenges';
import { rememberUtm } from '@/lib/challenge';
import { ShareModal } from '@/components/customer/ShareModal';
import { useAuthStore } from '@/store/authStore';
import type { TeamChallengeConfig } from '@/challenges/types';
import { LiveBackdrop } from './LiveBackdrop';
import { Opener, SoundToggle, TeamFooter, TeamIconGlyph, countdownParts, instaUrl, istDay, istTime, rupees, useNow, useVxClickSounds } from './ui';

const REFRESH_MS = 30_000;

type ChallengeWithTeam = Challenge & { team?: TeamInfo };

/*
 * The world: a match HUD over a real café. Warm black, KHEL-O red for the
 * action, signal yellow for time and money, hairlines instead of boxes.
 * Teko carries every number and heading; the body stays the site's sans.
 * One authored moment: the title is cut in by a scan line, then the 16
 * team slots light up in order. The café clip is the only loop.
 */
export function TeamLanding({ cfg, initial }: { cfg: TeamChallengeConfig; initial: ChallengeWithTeam | null }) {
  const [ch, setCh] = useState<ChallengeWithTeam | null>(initial);
  const [mine, setMine] = useState<MyTeamEntry | null>(null);
  const { isAuthenticated, isHydrated } = useAuthStore();
  const heroCta = useRef<HTMLAnchorElement>(null);
  const [heroGone, setHeroGone] = useState(false);
  const [tab, setTab] = useState<TabKey>('rewards');
  const tabsRef = useRef<HTMLDivElement>(null);

  // A link like /challenge/<slug>#rules opens that tab.
  useEffect(() => {
    const fromHash = () => {
      const h = window.location.hash.replace('#', '');
      if (TABS.some((t) => t.key === h)) setTab(h as TabKey);
    };
    fromHash();
    window.addEventListener('hashchange', fromHash);
    return () => window.removeEventListener('hashchange', fromHash);
  }, []);

  // The real counts, kept fresh while the page is open.
  useEffect(() => {
    const load = () => {
      if (document.hidden) return;
      getChallenge(cfg.slug).then((c) => setCh(c as ChallengeWithTeam)).catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [cfg.slug]);

  useEffect(() => {
    rememberUtm(window.location.search);
    trackAction('challenge_page_view', { challenge: cfg.slug });
  }, [cfg.slug]);

  useEffect(() => {
    if (!isHydrated || !isAuthenticated) return;
    getMyTeamEntry(cfg.slug).then(setMine).catch(() => undefined);
  }, [cfg.slug, isHydrated, isAuthenticated]);

  useEffect(() => {
    const el = heroCta.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => setHeroGone(!e.isIntersecting && e.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [ch]);

  const team = ch?.team;
  const max: number | null = team ? team.maxTeams : 16; // null = no limit
  const joined = team?.teams ?? 0;
  const solos = team?.solosWaiting ?? 0;
  const [shareOpen, setShareOpen] = useState(false);
  const openShare = (where: string) => { trackAction('challenge_share_open', { challenge: cfg.slug, where }); setShareOpen(true); };
  const registering = joined + solos; // teams plus solo players waiting for a team
  const left = max === null ? Infinity : team?.spotsLeft ?? max;
  // Before the counts arrive (or if the API is down) the page assumes open: the join page re-checks.
  const open = team ? team.signupsOpen : ch ? ch.status === 'open' : true;
  const full = open && left <= 0;
  const perPlayer = team ? Math.round(team.priceTeam / team.size) : 250;
  const inIt = !!mine?.player && (mine.player.status === 'active' || mine.player.status === 'waitlist');
  const joinHref = `/challenge/${cfg.slug}/join`;

  const cta = inIt
    ? { href: `/challenge/${cfg.slug}/me`, label: 'Open my entry' }
    : !open
      ? { href: `/challenge/${cfg.slug}/bracket`, label: 'See the bracket' }
      : full
        ? { href: `${joinHref}?waitlist=1`, label: 'Join the waitlist' }
        : { href: joinHref, label: 'Register your team' };

  // While spots are open, every big button offers the two real choices with their prices.
  const choice: Choice = open && !full && !inIt
    ? {
        team: { href: `${joinHref}?kind=team`, price: team?.priceTeam ?? 1250, note: `${rupees(perPlayer)} per player · friends join free` },
        solo: { href: `${joinHref}?kind=solo`, price: team?.priceSolo ?? 250 },
      }
    : null;

  useVxClickSounds();
  return (
    <div className="min-h-screen bg-[#0A0809] text-[#F4F1EC] selection:bg-[#D0463C] selection:text-white">
      <Opener />
      {ch?.status === 'draft' && (
        <p className="relative z-30 bg-[#E8A33D] px-4 py-1.5 text-center text-xs font-bold text-[#1A1306]">Draft: only admins can see this page.</p>
      )}

      {/* ── Hero: the café, live ──────────────────────────────────── */}
      <section className="relative isolate flex min-h-[100svh] flex-col overflow-hidden">
        <LiveBackdrop cfg={cfg} />
        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pt-4 md:px-8">
          <span className="flex min-w-0 items-center gap-2">
          <Link
            href="/"
            aria-label="Back to KHEL-O"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 bg-black/55 backdrop-blur hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden />
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2.5 text-[16px] font-bold tracking-[0.08em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <span className="inline-flex items-center">
              KHEL-
              <span
                className="ml-px inline-block h-[0.78em] w-[0.78em] translate-y-[0.02em] rounded-full bg-[radial-gradient(circle_at_32%_28%,#FF8F85_0%,#D0463C_45%,#9E2D25_100%)] shadow-[0_0_14px_rgba(208,70,60,0.65)]"
                aria-label="O"
                role="img"
              />
            </span>
            <span className="font-medium text-white/55">×</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cfg.venue.logo} alt={cfg.venue.shortName} className="h-[17px] w-auto" />
          </Link>
          </span>
          <span className="flex items-center gap-2">
            <span className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full bg-black/60 px-3 text-[11px] font-bold uppercase tracking-[0.1em] backdrop-blur-md sm:px-3.5 sm:text-[12px] sm:tracking-[0.16em]">
              <span className="vx-live-dot h-2 w-2 rounded-full bg-[#FF4A4A]" aria-hidden />
              <span className="sm:hidden">At {cfg.venue.shortName} Cafe</span>
              <span className="hidden sm:inline">At {cfg.venue.name}</span>
            </span>
            <SoundToggle />
          </span>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 items-end gap-12 px-4 pb-4 pt-4 md:items-center md:px-8 md:pb-16">
          <div className="w-full min-w-0 md:max-w-[620px]">
            <Link
              href="/"
              onClick={() => trackAction('challenge_khelo_click', { challenge: cfg.slug, where: 'hero' })}
              className="-my-1 inline-flex min-h-[40px] items-center gap-1.5 text-[13.5px] font-semibold text-white/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <span>KHEL-O is <b className="text-[#F2C94C] underline decoration-[#F2C94C]/50 underline-offset-4">BookMyShow for gaming cafes</b></span>
              <ChevronRight className="h-4 w-4 text-[#F2C94C]" aria-hidden />
            </Link>
            <h1 className={`${fightFont.className} relative uppercase`}>
              <span className="vx-scan absolute -left-2 top-[18%] h-[64%] w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent" aria-hidden />
              <span className="vx-cut block text-[clamp(64px,22vw,148px)] font-bold leading-[0.76] tracking-[0.01em] [text-shadow:0_10px_40px_rgba(0,0,0,0.55)] [@media(max-height:780px)]:text-[clamp(52px,17.5vw,120px)]">
                {cfg.titleTop}
              </span>
              <span className="vx-cut vx-cut-2 mt-2 block text-[clamp(34px,10.2vw,72px)] font-semibold leading-[0.9] tracking-[0.04em] text-[#E8675D] [text-shadow:0_4px_24px_rgba(0,0,0,0.7)]">
                {cfg.titleBottom}
              </span>
            </h1>
            <p className="vx-rise mt-3 max-w-[34ch] text-balance text-[17px] md:max-w-none font-semibold leading-snug text-white [animation-delay:.45s] md:text-[21px]">
              Teams of 5. Rewards worth {rupees(cfg.prizeTotal)}.
            </p>

            {/* The facts as a readout, not a row of pills. */}
            <dl className="vx-rise mt-3 grid grid-cols-3 border-y border-white/15 [animation-delay:.55s]">
              <Readout label="When" value={istDay(cfg.dates.firstMatch).replace(',', '')} sub={`${istTime(cfg.dates.reportingTime).replace(':00', '')} check-in`} />
              <Readout label="Where" value={cfg.venue.shortName} sub="Gachibowli" href={`/cafe/${cfg.venue.bookingSlug}`} />
              <Readout
                label="Format"
                value="5v5"
                sub="In person"
                onClick={() => {
                  setTab('rules');
                  trackAction('challenge_tab', { challenge: cfg.slug, tab: 'rules', from: 'format' });
                  setTimeout(() => tabsRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
                }}
              />
            </dl>

            <div className="vx-rise mt-2.5 [animation-delay:.62s]">
              <ProvidedCard cfg={cfg} hero />
            </div>

            <div className="vx-rise mt-2.5 [animation-delay:.65s]">
              <StatusPanel
                open={open}
                full={full}
                max={max}
                joined={joined}
                solos={solos}
                closesAt={team?.registrationClosesAt ?? cfg.dates.registrationCloses}
              />
            </div>

            <div className="vx-rise mt-2.5 [animation-delay:.75s]">
              <SignUpCta cta={cta} choice={choice} where="hero" slug={cfg.slug} heroRef={heroCta} />
              <p className="mt-2 text-[12.5px] leading-tight text-white/70">Not playing this time? Don&apos;t miss the next one.</p>
              <div className="mt-1.5 grid grid-cols-[1.25fr_1fr] gap-2">
                <a
                  href={cfg.links.communityInvite}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackAction('challenge_community_click', { challenge: cfg.slug, where: 'hero' })}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 px-2 text-center text-[13px] font-semibold leading-[1.1] text-white transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <WhatsAppIcon className="h-[18px] w-[18px] flex-none text-[#25D366]" aria-hidden /> Join KHEL-O community
                </a>
                <button
                  type="button"
                  onClick={() => openShare('hero')}
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/15 px-2 text-center text-[13px] font-semibold leading-[1.1] text-white transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Share2 className="h-[18px] w-[18px] flex-none" aria-hidden /> Share with your squad
                </button>
              </div>
            </div>
            {inIt && (
              <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-[#13221A] px-3 py-1.5 text-sm font-semibold text-[#9BF0B9]">
                <Check className="h-4 w-4" aria-hidden />
                {mine?.team ? `You're in: ${mine.team.name}` : mine?.player?.status === 'waitlist' ? "You're on the waitlist" : "You're in as a solo player"}
              </p>
            )}
          </div>

          <LiveFeed cfg={cfg} />
        </div>
      </section>

      {/* ── Tabs: one short page instead of a long scroll ───────── */}
      <div
        ref={tabsRef}
        className="sticky top-0 z-30 border-b border-[#2A2530] bg-[#0A0809]/92 backdrop-blur-md"
        role="tablist"
        aria-label="More about the challenge"
      >
        <div className="mx-auto flex max-w-xl gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none] md:max-w-6xl md:px-8 [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => (
            <button
              key={t.key}
              id={`tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={tab === t.key}
              aria-controls={`panel-${t.key}`}
              onClick={() => {
                setTab(t.key);
                trackAction('challenge_tab', { challenge: cfg.slug, tab: t.key });
                // Keep the tab bar in view, so the panel opens right under it.
                const el = tabsRef.current;
                if (el && el.getBoundingClientRect().top > 8) el.scrollIntoView({ block: 'start', behavior: 'smooth' });
              }}
              className={`min-h-[44px] flex-shrink-0 rounded-full px-4 text-[15px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                tab === t.key ? 'bg-[#F4F1EC] text-[#14110F]' : 'text-[#B4B0B8] hover:bg-white/5 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto min-h-[460px] max-w-xl px-4 pb-6 pt-6 md:max-w-6xl md:px-8 md:pt-9">
        {/* ── Rewards + entry ─────────────────────────────────────── */}
        <div role="tabpanel" id="panel-rewards" aria-labelledby="tab-rewards" hidden={tab !== 'rewards'}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[1.05fr_1fr] md:items-start md:gap-10">
            <div>
              <div className="vx-corner bg-[#F2C94C] px-5 pb-4 pt-4 text-[#1A1306]">
                <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-[#1A1306]/70">Exciting rewards worth</p>
                <p className={`${fightFont.className} mt-0.5 font-bold leading-[0.82] text-[clamp(64px,19vw,104px)]`}>{rupees(cfg.prizeTotal)}</p>
                <p className="mt-2 text-[14.5px] font-semibold text-[#1A1306]/80">For the Top team and the Second team.</p>
                <p className="mt-3 border-t border-[#1A1306]/25 pt-3 text-[14.5px] font-semibold">{cfg.prizeExtra}</p>
              </div>
              <p className="mt-2.5 text-[13px] text-[#B4B0B8]">{cfg.sponsorLine}</p>
              {cfg.sponsors.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {cfg.sponsors.map((sp) => (
                    <a key={sp.name} href={sp.url ?? undefined} target="_blank" rel="noopener noreferrer" className="flex h-11 items-center rounded-xl bg-white px-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={sp.logo} alt={sp.name} className="max-h-7 w-auto" loading="lazy" />
                    </a>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="grid gap-3">
                <PriceCard
                  href={open ? (full ? `${joinHref}?waitlist=1&kind=team` : `${joinHref}?kind=team`) : undefined}
                  badge="Best value"
                  title="Team of 5"
                  price={team?.priceTeam ?? 1250}
                  line={`Just ${rupees(perPlayer)} per player`}
                  note="One person books. Your 4 teammates join free with your link."
                  strong
                />
                <PriceCard
                  href={open ? (full ? `${joinHref}?waitlist=1&kind=solo` : `${joinHref}?kind=solo`) : undefined}
                  title="Solo"
                  price={team?.priceSolo ?? 250}
                  line="We put you in a team with other solo players."
                  note="If we can't make a team, you get your full money back by 4 December."
                />
              </div>
              <p className="mt-2.5 text-[13px] text-[#B4B0B8]">No booking fee. Nothing added on top.</p>
            </div>
          </div>
        </div>

        {/* ── How it works + match day + Skirmish + Instagram ─────── */}
        <div role="tabpanel" id="panel-how" aria-labelledby="tab-how" hidden={tab !== 'how'}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-2 md:gap-14">
            <div>
              <PanelTitle>How it works</PanelTitle>
              <ol className="flex flex-col">
                {cfg.howItWorks.map((st, i) => (
                  <li key={st.text} className="flex items-start gap-4 border-b border-[#2A2530] py-3 first:pt-0 last:border-0">
                    <span className={`${fightFont.className} w-6 flex-shrink-0 text-[28px] font-bold leading-[0.9] text-[#E8675D]`}>{i + 1}</span>
                    <span className="pt-0.5 text-[15.5px] leading-snug">{st.text}</span>
                  </li>
                ))}
              </ol>
              <div className="mt-5 grid gap-2.5 rounded-2xl border border-[#2A2530] bg-[#141017] p-4">
                <p className="text-[14.5px] text-[#DCD7E0]">
                  <b className="text-white">Follow @{cfg.links.kheloInstagramHandle}.</b> The draw, your match time and live scores are posted there first.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <FollowButton handle={cfg.links.kheloInstagramHandle} label={`Follow @${cfg.links.kheloInstagramHandle}`} slug={cfg.slug} />
                  {cfg.venue.instagramHandle && <FollowButton handle={cfg.venue.instagramHandle} label={`Follow @${cfg.venue.instagramHandle}`} slug={cfg.slug} />}
                </div>
              </div>
            </div>

            <div>
              <PanelTitle>{`Match day · ${istDay(cfg.dates.firstMatch).replace(',', '')}`}</PanelTitle>
              {/* Phones: a strip you slide sideways. Wide screens: the full timeline. */}
              <ol className="-mx-4 grid auto-cols-[104px] grid-flow-col gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:thin] md:hidden">
                {cfg.timeline.map((t) => (
                  <li key={t.time} className="rounded-xl border border-[#2A2530] bg-[#141017] p-2.5">
                    <span className={`${fightFont.className} block text-[24px] font-semibold leading-none tabular-nums text-[#F2C94C]`}>{t.time}</span>
                    <span className="mt-1 block text-[13px] font-semibold leading-tight">{t.text}</span>
                  </li>
                ))}
              </ol>
              <ol className="relative hidden md:block">
                <span className="absolute bottom-3 left-[5px] top-3 w-px bg-gradient-to-b from-[#F2C94C] via-[#D0463C] to-[#2A2530]" aria-hidden />
                {cfg.timeline.map((t, i) => (
                  <li key={t.time} className="relative grid grid-cols-[11px_92px_1fr] items-baseline gap-x-4 py-2">
                    <span className={`relative top-[-2px] h-[11px] w-[11px] rotate-45 ${i === 0 ? 'bg-[#F2C94C]' : 'border border-[#D0463C] bg-[#0A0809]'}`} aria-hidden />
                    <span className={`${fightFont.className} text-[25px] font-semibold leading-none tabular-nums text-[#F2C94C]`}>{t.time}</span>
                    <span className="text-[16px] font-semibold">{t.text}</span>
                  </li>
                ))}
              </ol>

              <PanelTitle className="mt-7">What is Swift Play?</PanelTitle>
              <p className="text-[15px] text-[#DCD7E0]">A short, fast Valorant mode. Five rounds win the game.</p>
              <ul className="mt-3 grid border-t border-[#2A2530]">
                {cfg.skirmish.map((sk) => (
                  <li key={sk.text} className="flex items-start gap-3 border-b border-[#2A2530] py-2.5">
                    <span className="mt-0.5 text-[#E8675D]"><TeamIconGlyph icon={sk.icon} className="h-5 w-5" /></span>
                    <span className="text-[15px] font-semibold leading-snug">{sk.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* ── Rules ───────────────────────────────────────────────── */}
        <div role="tabpanel" id="panel-rules" aria-labelledby="tab-rules" hidden={tab !== 'rules'}>
          <div className="mx-auto max-w-3xl">
            <p className="mb-4 flex items-start gap-3 rounded-xl bg-[#F2C94C] p-4 text-[15.5px] font-bold text-[#1A1306]">
              <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden />
              {cfg.lateRule}
            </p>
            <div className="border-t border-[#2A2530]">
              {cfg.rules.map((g, gi) => (
                <details key={g.group} className="group border-b border-[#2A2530]" open={gi === 0}>
                  <summary className="flex min-h-[54px] cursor-pointer list-none items-center justify-between gap-3 text-[16.5px] font-bold transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60 [&::-webkit-details-marker]:hidden">
                    {g.group}
                    <ChevronDown className="h-5 w-5 text-[#B4B0B8] transition-transform duration-200 group-open:rotate-180" aria-hidden />
                  </summary>
                  <ol className="flex max-w-[68ch] flex-col gap-2 pb-4 text-[14.5px] leading-relaxed text-[#DCD7E0]">
                    {g.items.map((r) => (
                      <li key={r} className="flex gap-3">
                        <span className="mt-[9px] h-1.5 w-1.5 flex-shrink-0 rotate-45 bg-[#E8675D]" aria-hidden />
                        {r}
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </div>
        </div>

        {/* ── Where ───────────────────────────────────────────────── */}
        <div role="tabpanel" id="panel-where" aria-labelledby="tab-where" hidden={tab !== 'where'}>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-5 md:grid-cols-[1.4fr_1fr] md:items-end md:gap-10">
            <div className="grid aspect-[4/3] grid-cols-3 grid-rows-2 gap-2 md:aspect-[16/10]">
              {cfg.media.photos.slice(0, 3).map((ph, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={ph.src} src={ph.srcSmall} alt={ph.alt} loading="lazy" decoding="async"
                  className={`h-full w-full rounded-2xl object-cover ${i === 0 ? 'col-span-2 row-span-2' : ''}`} />
              ))}
            </div>
            <div>
              <div className="mb-4"><ProvidedCard cfg={cfg} full /></div>
              <p className={`${fightFont.className} text-[clamp(32px,9vw,42px)] font-bold uppercase leading-none`}>{cfg.venue.name}</p>
              <p className="mt-2 max-w-[40ch] text-[14.5px] leading-snug text-[#B4B0B8]">{cfg.venue.address}</p>
              <a
                href={cfg.venue.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackAction('challenge_map_click', { challenge: cfg.slug })}
                className="mt-4 flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl bg-[#F4F1EC] px-4 text-[16px] font-bold text-[#0A0809] transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
              >
                <MapPin className="h-5 w-5 text-[#D0463C]" aria-hidden /> Open in Google Maps
              </a>
              {cfg.venue.bookingSlug && (
                <Link
                  href={`/cafe/${cfg.venue.bookingSlug}`}
                  className="mt-2 flex min-h-[52px] items-center gap-3 rounded-xl border border-[#2A2530] px-4 transition-colors hover:border-[#4A4352] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
                >
                  <Gamepad2 className="h-5 w-5 flex-shrink-0 text-[#E8675D]" aria-hidden />
                  <span className="flex-1 text-[14.5px] leading-snug">
                    <b>Want practice first?</b> Book a scrim at {cfg.venue.shortName}, 1 to 4 Dec.
                  </span>
                  <ChevronRight className="h-5 w-5 text-[#B4B0B8]" aria-hidden />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* ── Questions ───────────────────────────────────────────── */}
        <div role="tabpanel" id="panel-faq" aria-labelledby="tab-faq" hidden={tab !== 'faq'}>
          <dl className="grid border-t border-[#2A2530] md:grid-cols-2 md:gap-x-14">
            {cfg.faq.map((f) => (
              <div key={f.q} className="border-b border-[#2A2530] py-3.5">
                <dt className="text-[15.5px] font-bold">{f.q}</dt>
                <dd className="mt-1 text-[14.5px] leading-relaxed text-[#C4BFC8]">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </main>

      <section className="border-t border-[#2A2530] bg-[#0A0809] px-4 py-9">
        <div className="mx-auto grid max-w-xl gap-9 md:max-w-6xl md:grid-cols-2 md:gap-14 md:px-4">
          <div>
            <h2 className={`${fightFont.className} text-[clamp(32px,9vw,44px)] font-bold uppercase leading-[0.95]`}>Not playing this time? Don&apos;t miss the next one.</h2>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-snug text-[#C4BFC8]">
              Join the KHEL-O community for upcoming challenges, gaming events, deals and updates. Even if you&apos;re not playing this time, there&apos;s always another game.
            </p>
            <a
              href={cfg.links.communityInvite}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction('challenge_community_click', { challenge: cfg.slug, where: 'band' })}
              className="mt-4 flex min-h-[52px] items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-5 text-[16px] font-bold text-[#06210F] transition-colors hover:bg-[#3BE07B] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <WhatsAppIcon className="h-5 w-5" aria-hidden /> Join KHEL-O community
            </a>
            <button
              type="button"
              onClick={() => openShare('band')}
              className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl border border-white/25 px-5 text-[15px] font-semibold text-white transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <Share2 className="h-5 w-5" aria-hidden /> Share with your squad
            </button>
          </div>
          <div>
            <h2 className={`${fightFont.className} text-[clamp(32px,9vw,44px)] font-bold uppercase leading-[0.95]`}>KHEL-O is BookMyShow for gaming cafes.</h2>
            <p className="mt-3 max-w-[46ch] text-[15px] leading-snug text-[#C4BFC8]">
              Find gaming cafes and PC gaming sessions near you and book your seat. No calling around. No visiting several cafes. This challenge is one of the events we run with partner cafes.
            </p>
            <Link
              href="/browse"
              onClick={() => trackAction('challenge_khelo_click', { challenge: cfg.slug, where: 'band' })}
              className="mt-4 inline-flex min-h-[48px] items-center gap-1.5 text-[15.5px] font-bold text-[#F2C94C] underline decoration-[#F2C94C]/50 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Browse gaming cafes near you <ChevronRight className="h-5 w-5" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      <TeamFooter cfg={cfg} wide />

      <ShareModal
        isOpen={shareOpen}
        onClose={() => setShareOpen(false)}
        heading="Share the Valorant challenge"
        message="Valorant 5v5 in person at XQZ Gaming Cafe, Hyderabad on Sat 5 Dec. Teams of 5, rewards worth ₹5,000. Sign up here:"
        path={`/challenge/${cfg.slug}`}
        context="campaign"
        campaign="valorant-share"
      />

      {/* ── Sticky bar once the hero buttons scroll away (phones and desktop) ─ */}
      <div className="hidden h-24 md:block" aria-hidden />
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0A0809]/90 px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 backdrop-blur-md transition-transform duration-300 ease-out ${
          heroGone ? 'translate-y-0' : 'translate-y-full'
        }`}
        aria-hidden={!heroGone}
      >
        <div className="mx-auto flex max-w-xl items-center gap-3 md:max-w-6xl md:px-4">
          <p className="min-w-0 flex-1 text-[14px] font-semibold leading-tight md:text-[16px]">
            {inIt ? "You're signed up" : !open ? 'Sign-ups are closed' : full ? 'All spots are full. The waitlist is free.' : (
              <>
                <span className="hidden md:inline">{cfg.title} · </span>
                {rupees(perPlayer)} per player
                <span className="block text-[#F2C94C] md:ml-2 md:inline">{max === null ? (registering > 0 ? 'People are registering' : 'Sign-ups are open') : `${left} of ${max} spots left`}</span>
              </>
            )}
          </p>
          {choice && (
            <Link
              href={choice.solo.href}
              tabIndex={heroGone ? 0 : -1}
              onClick={() => trackAction('challenge_signup_started', { challenge: cfg.slug, where: 'sticky', kind: 'solo' })}
              className="hidden h-12 items-center rounded-xl border border-white/20 px-5 text-[15px] font-bold transition-colors hover:bg-white/5 md:flex"
            >
              Solo · {rupees(choice.solo.price)}
            </Link>
          )}
          <Link
            href={choice ? choice.team.href : cta.href}
            tabIndex={heroGone ? 0 : -1}
            onClick={() => trackAction('challenge_signup_started', { challenge: cfg.slug, where: 'sticky', kind: choice ? 'team' : '' })}
            className="vx-corner-sm flex h-12 items-center justify-center gap-1.5 bg-[#D0463C] px-5 text-[16px] font-bold text-white transition-colors hover:bg-[#B93C33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
          >
            {inIt ? 'My entry' : !open ? 'Bracket' : full ? 'Join waitlist' : <>Sign up · {rupees(choice?.team.price ?? 750)}</>}
          </Link>
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { key: 'rewards', label: 'Rewards' },
  { key: 'how', label: 'How it works' },
  { key: 'rules', label: 'Rules' },
  { key: 'where', label: 'Where' },
  { key: 'faq', label: 'Questions' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

function PanelTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`${fightFont.className} mb-3 flex items-center gap-4 text-[28px] font-semibold uppercase leading-none tracking-[0.04em] ${className}`}>
      <span className="min-w-0">{children}</span>
      <span className="h-px flex-1 translate-y-[-2px] bg-gradient-to-r from-[#3A3340] to-transparent" aria-hidden />
    </h2>
  );
}

function ProvidedCard({ cfg, full = false, hero = false }: { cfg: TeamChallengeConfig; full?: boolean; hero?: boolean }) {
  const p = cfg.provided;
  return (
    <div className="rounded-xl border border-[#F2C94C]/50 bg-black/55 p-3 backdrop-blur-md">
      {hero && (
        <p className="mb-1.5 flex items-center gap-1.5 text-[13.5px] font-bold leading-snug [@media(max-height:780px)]:hidden">
          <MapPin className="h-4 w-4 flex-none text-[#E8675D]" aria-hidden />
          Played in person at {cfg.venue.name}
        </p>
      )}
      <p className="flex items-start gap-2.5 text-[15px] font-bold leading-snug">
        <Gamepad2 className="mt-0.5 h-5 w-5 flex-none text-[#F2C94C]" aria-hidden />
        {hero ? (
          <span><span className="text-[#F2C94C]">Your PC is already waiting.</span> We provide the gaming PCs and peripherals. Bring your phone and Riot ID.</span>
        ) : (
          p.headline
        )}
      </p>
      {!hero && <p className="mt-1 text-[13px] leading-snug text-white/75">{p.line}</p>}
      <ul className="mt-2 flex flex-wrap items-center gap-1.5">
        {(full ? p.specs : p.specs.slice(0, 3)).map((sp) => (
          <li key={sp.label} className="rounded-lg border border-white/15 bg-black/25 px-2 py-1 text-[12.5px] font-bold leading-tight">
            {full && <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#F2C94C]">{sp.label}</span>}
            {sp.value}
          </li>
        ))}
        {hero && (
          <li className="[@media(max-height:780px)]:hidden">
            <a
              href={cfg.venue.googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => trackAction('challenge_map_click', { challenge: cfg.slug, from: 'hero' })}
              className="flex items-center rounded-lg px-1.5 py-1 text-[12.5px] font-semibold text-[#F2C94C] underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Open in Maps ›
            </a>
          </li>
        )}
      </ul>
      {full && <p className="mt-2 text-[13px] leading-snug text-white/75">{p.extras}</p>}
    </div>
  );
}

function Readout({ label, value, sub, href, onClick }: { label: string; value: string; sub: string; href?: string; onClick?: () => void }) {
  const tappable = Boolean(href || onClick);
  const labelCls = 'block text-[11px] font-bold uppercase tracking-[0.16em] text-white/60';
  const valueCls = `${fightFont.className} mt-0.5 block text-[28px] font-semibold uppercase leading-none ${tappable ? 'underline decoration-white/40 decoration-2 underline-offset-4' : ''}`;
  const subCls = `mt-0.5 block truncate text-[13px] ${tappable ? 'font-semibold text-[#F2C94C]' : 'text-white/70'}`;
  const box = 'border-l border-white/15 first:border-l-0';
  const hit = 'block min-h-[44px] w-full py-2.5 pl-3 text-left transition-colors hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70';
  if (!tappable) {
    return (
      <div className={`${box} py-2.5 pl-3 first:pl-0`}>
        <dt className={labelCls}>{label}</dt>
        <dd className={valueCls}>{value}</dd>
        <dd className={subCls}>{sub}</dd>
      </div>
    );
  }
  // Tappable tile: a real link or button. The label is read out as part of it.
  const body = (
    <>
      <span className={labelCls}>{label}</span>
      <span className={valueCls}>{value}</span>
      <span className={subCls}>{sub} ›</span>
    </>
  );
  return (
    <div className={box}>
      {href ? (
        <a href={href} className={hit}>{body}</a>
      ) : (
        <button type="button" onClick={onClick} className={hit}>{body}</button>
      )}
    </div>
  );
}

/** Countdown and the 16 slots in one panel: how long, and how many are left. */
function StatusPanel({ open, full, max, joined, solos, closesAt }: { open: boolean; full: boolean; max: number | null; joined: number; solos: number; closesAt: string }) {
  const now = useNow();
  const { d, h, m, s, over, ready } = countdownParts(closesAt, now);
  const filled = max === null ? joined : Math.min(joined, max);
  return (
    <div className="rounded-xl bg-black/55 px-3 py-2.5 ring-1 ring-inset ring-white/10 backdrop-blur-md" aria-live="polite">
      {open ? (
        <p className="flex items-baseline justify-between gap-2 text-[13px] font-semibold text-white/75">
          <span>{over ? 'Sign-ups are closing' : 'Sign-ups close in'}</span>
          <span className={`${fightFont.className} text-[22px] font-bold leading-none tabular-nums text-white`} role="timer" aria-live="off">
            {ready ? `${String(d).padStart(2, '0')}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : '--'}
          </span>
        </p>
      ) : (
        <p className="text-[15px] font-semibold">Sign-ups are closed.</p>
      )}
      {max !== null && <div className="mt-2 grid grid-cols-[repeat(16,minmax(0,1fr))] gap-[3px] [@media(max-height:780px)]:hidden" aria-hidden>
        {Array.from({ length: max }, (_, i) => (
          <span
            key={i}
            className={`vx-slot relative h-2 overflow-hidden ${i < filled ? 'vx-slot-lit bg-[#D0463C]' : 'bg-white/15'}`}
            style={{ animationDelay: `${0.9 + i * 0.04}s`, clipPath: 'polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%)' }}
          />
        ))}
      </div>}
      <p className="mt-1.5 flex justify-between text-[13.5px] font-semibold">
        <span>{max === null ? (filled + solos > 0 ? 'People are registering' : 'Sign-ups are open') : full ? `All ${max} team spots are full` : `${filled} of ${max} teams in`}</span>
        <span className="text-[#F2C94C]">{max === null ? 'Your team can join' : full ? 'Waitlist open' : `${max - filled} spots left`}</span>
      </p>
    </div>
  );
}

function LiveFeed({ cfg }: { cfg: TeamChallengeConfig }) {
  return (
    <div className="relative ml-auto hidden aspect-[9/16] w-[300px] flex-shrink-0 overflow-hidden rounded-[20px] shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] ring-1 ring-white/15 md:block lg:w-[330px]" aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={cfg.media.heroPoster} alt="" className="absolute inset-0 h-full w-full object-cover" />
      <video
        src={cfg.media.heroVideo}
        poster={cfg.media.heroPoster}
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        className="absolute inset-0 h-full w-full object-cover motion-reduce:hidden"
      />
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/70 to-transparent p-3.5 text-[12px] font-bold uppercase tracking-[0.16em]">
        <span className="vx-live-dot h-2 w-2 rounded-full bg-[#FF4A4A]" />
        {cfg.venue.shortName} · Gachibowli
      </div>
      {['left-3 top-3 border-l-2 border-t-2', 'right-3 top-3 border-r-2 border-t-2', 'left-3 bottom-3 border-b-2 border-l-2', 'right-3 bottom-3 border-b-2 border-r-2'].map((c) => (
        <span key={c} className={`absolute h-5 w-5 border-[#F2C94C] ${c}`} />
      ))}
    </div>
  );
}

function PriceCard({ href, badge, title, price, line, note, strong = false }: {
  href?: string; badge?: string; title: string; price: number; line: string; note: string; strong?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-center justify-between gap-3">
        <span className="text-[17px] font-bold">{title}</span>
        {badge && <span className="rounded-full bg-[#F2C94C] px-2.5 py-0.5 text-[12px] font-bold uppercase tracking-wider text-[#1A1306]">{badge}</span>}
      </span>
      <span className={`${fightFont.className} mt-3 block text-[68px] font-bold leading-[0.8]`}>{rupees(price)}</span>
      <span className={`mt-2 block text-[16px] font-bold ${strong ? 'text-[#F2C94C]' : 'text-[#F4F1EC]'}`}>{line}</span>
      <span className="mt-1.5 block max-w-[42ch] text-[14px] leading-snug text-[#B4B0B8]">{note}</span>
      {href && (
        <span
          className={`mt-5 flex h-12 items-center justify-center gap-1.5 text-[16px] font-bold transition-colors ${
            strong ? 'vx-corner-sm bg-[#D0463C] text-white group-hover:bg-[#B93C33]' : 'rounded-xl border border-white/25 text-white group-hover:bg-white/5'
          }`}
        >
          {strong ? 'Sign up your team' : 'Join solo'} <ChevronRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </span>
      )}
    </>
  );
  const cls = `vx-corner group relative block p-5 transition-[background-color] duration-200 md:p-6 ${
    strong ? 'bg-[#1E1013] ring-1 ring-inset ring-[#D0463C]/55 hover:bg-[#25131A]' : 'bg-[#141017] ring-1 ring-inset ring-[#2A2530] hover:bg-[#1A151E]'
  }`;
  return href ? (
    <Link href={href} className={`${cls} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function FollowButton({ handle, label, slug }: { handle: string; label: string; slug: string }) {
  return (
    <a
      href={instaUrl(handle)}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackAction('challenge_instagram_click', { challenge: slug, handle })}
      className="flex min-h-[54px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737] px-5 text-[16px] font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
    >
      <Instagram className="h-5 w-5" aria-hidden /> {label}
    </a>
  );
}

type Cta = { href: string; label: string };
type Choice = { team: { href: string; price: number; note: string }; solo: { href: string; price: number } } | null;

/** The sign-up decision: team (primary, with its price) and solo (secondary).
 *  When sign-ups aren't open, or you're already in, the one right action. */
function SignUpCta({ cta, choice, where, slug, heroRef }: {
  cta: Cta; choice: Choice; where: string; slug: string; heroRef?: Ref<HTMLAnchorElement>;
}) {
  if (!choice) {
    return (
      <Link
        ref={heroRef}
        href={cta.href}
        onClick={() => trackAction('challenge_signup_started', { challenge: slug, where })}
        className="vx-corner group flex h-[62px] w-full items-center justify-center gap-2 bg-[#D0463C] text-white shadow-[0_14px_34px_-14px_rgba(208,70,60,0.9)] transition-colors duration-200 hover:bg-[#B93C33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <span className={`${fightFont.className} text-[30px] font-bold uppercase leading-none tracking-[0.06em]`}>{cta.label}</span>
        <ChevronRight className="h-6 w-6 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Link
        ref={heroRef}
        href={choice.team.href}
        onClick={() => trackAction('challenge_signup_started', { challenge: slug, where, kind: 'team' })}
        className="vx-corner group flex min-h-[60px] flex-[1.6] items-stretch bg-[#D0463C] text-white shadow-[0_14px_34px_-14px_rgba(208,70,60,0.9)] transition-colors duration-200 hover:bg-[#B93C33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
      >
        <span className="flex flex-1 flex-col justify-center px-4 py-2">
          <span className={`${fightFont.className} text-[clamp(24px,7vw,30px)] font-bold uppercase leading-[0.9] tracking-[0.04em] whitespace-nowrap`}>Sign up your team</span>
          <span className="text-[13px] font-semibold text-white/85">{choice.team.note}</span>
        </span>
        <span className={`${fightFont.className} flex items-center gap-0.5 bg-black/20 pl-3 pr-5 text-[32px] font-bold leading-none`}>
          {rupees(choice.team.price)}
          <ChevronRight className="h-6 w-6 transition-transform duration-200 group-hover:translate-x-0.5" aria-hidden />
        </span>
      </Link>
      <Link
        href={choice.solo.href}
        onClick={() => trackAction('challenge_signup_started', { challenge: slug, where, kind: 'solo' })}
        className="flex min-h-[48px] flex-1 items-center justify-between gap-2 rounded-xl border border-white/25 bg-black/40 px-4 text-white backdrop-blur-md transition-colors hover:border-white/45 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:flex-col sm:items-start sm:justify-center sm:gap-0"
      >
        <span className="text-[16px] font-bold">No team? Join solo</span>
        <span className={`${fightFont.className} text-[26px] font-bold leading-none sm:text-[22px]`}>{rupees(choice.solo.price)}</span>
      </Link>
    </div>
  );
}

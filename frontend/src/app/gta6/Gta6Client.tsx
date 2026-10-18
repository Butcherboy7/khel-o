'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, Loader2, MessageCircle, MessageSquareText, Phone, Plus, Share2, Star } from 'lucide-react';
import { useBotGuard } from '@/components/auth/BotGuard';
import { getLaunch, joinLaunch, type ReachBy } from '@/lib/api/launchList';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { trackAction } from '@/lib/api/analyticsEvents';
import { optimizedImg, fallBackToOriginal } from '@/lib/imageUrl';
import type { CafeListItem } from '@/types';
import { customerPrice } from '@/lib/format';
import { firstBookingOfferLive } from '@/lib/pricing';
import { Gta6Scene } from './Gta6Scene';

const LAUNCH_KEY = 'gta6';
// 19 Nov 2026, midnight in Hyderabad.
const LAUNCH_AT = new Date('2026-11-19T00:00:00+05:30').getTime();
// The list count is re-read this often so a busy day visibly ticks up.
const COUNT_REFRESH_MS = 30_000;
// Long enough for the title card and the first countdown ticks to be seen.
const AUTOSCROLL_AFTER_MS = 2200;
// Cafés that told us they have pre-ordered GTA 6 (confirmed by KHEL-O,
// 2026-10-17). Only these get the "Pre-ordered" stamp; a PS5 café that joins
// later shows without it until it's confirmed and added here.
const PREORDERED_CAFE_IDS = new Set([
  '73484598-b6a8-4118-82b9-7df16d03ed05', // DG Gaming Cafe
  '69a24177-fc5f-4c07-a792-dacf7c2d147b', // Rockstar Gaming Cafe
  // AdamsDen Gaming Lounge (told KHEL-O 2026-10-18). Still a draft application:
  // the page lists only live cafés with a PlayStation, so it shows once approved.
  '596ebec6-7dd5-480a-bf40-327d7f4c1e7e',
]);

const REACH: { value: ReachBy; label: string; icon: typeof Phone; said: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, said: 'WhatsApp you' },
  { value: 'text', label: 'Text', icon: MessageSquareText, said: 'text you' },
  { value: 'call', label: 'Call', icon: Phone, said: 'call you' },
];

/* A sunset scene and a live countdown up top, then the real cafés and the
   form. The form must still start inside the first phone screen (ad traffic). */

type Countdown = ReturnType<typeof useCountdown>;

function useCountdown(target: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now === null) return null;
  const ms = Math.max(0, target - now);
  return {
    done: ms === 0,
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor(ms / 3_600_000) % 24,
    mins: Math.floor(ms / 60_000) % 60,
    secs: Math.floor(ms / 1000) % 60,
  };
}

interface PlayCafe {
  id: string;
  href: string;
  name: string;
  area: string;
  console: string;
  price: number | null;
  photo: string | null;
  rating: number | null;
  preordered: boolean;
}

function toPlayCafe(c: CafeListItem): PlayCafe {
  const ps5 = c.tierNames.find((t) => /ps ?5|playstation ?5/i.test(t));
  return {
    id: c.id,
    href: cafePath(c),
    name: c.name,
    area: c.addressLine2 || c.city,
    console: ps5 && /pro/i.test(ps5) ? 'PS5 Pro' : 'PS5',
    price: (() => { const p = c.bestOffer?.fromPrice ?? c.startingPrice; return p == null ? null : customerPrice(p); })(),
    photo: c.photos[0]?.url ?? null,
    rating: c.totalReviews > 0 ? c.averageRating : null,
    preordered: PREORDERED_CAFE_IDS.has(c.id),
  };
}

/** Bookable (not "Booking soon") cafés with a PlayStation, straight from the live list. */
function usePs5Cafes(): PlayCafe[] | null {
  const [cafes, setCafes] = useState<PlayCafe[] | null>(null);
  useEffect(() => {
    listCafes({ city: 'Hyderabad', activity: 'console', limit: 50 })
      .then((res) =>
        setCafes(
          res.items
            .filter((c) => !c.isLeadListing && c.platforms?.includes('playstation'))
            .map(toPlayCafe)
            .sort((a, b) => Number(b.preordered) - Number(a.preordered))
            .slice(0, 6),
        ),
      )
      .catch(() => setCafes([]));
  }, []);
  return cafes;
}

const UNITS = [
  { key: 'days', label: 'Days' },
  { key: 'hours', label: 'Hrs' },
  { key: 'mins', label: 'Min' },
  { key: 'secs', label: 'Sec' },
] as const;

/** Four neon tiles. Each digit re-mounts when it changes, so only that digit rolls in. */
function CountdownTiles({ countdown }: { countdown: Countdown }) {
  if (countdown?.done) {
    return <p className="mt-4 text-[17px] font-semibold text-[#FFB4A8] md:text-xl">It’s out. Book a slot below.</p>;
  }
  const days = countdown?.days ?? 0;
  return (
    <div role="timer" data-gta6-stop className="mt-3.5 md:mt-6">
      <span className="sr-only">
        {countdown ? `${days} ${days === 1 ? 'day' : 'days'} and ${countdown.hours} hours to go` : 'Counting down to 19 November'}
      </span>
      <div aria-hidden="true" className="grid max-w-[340px] grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr] items-start gap-x-1.5 md:max-w-[440px] md:gap-x-2.5">
        {UNITS.map(({ key, label }, i) => {
          const text = countdown ? String(countdown[key]).padStart(2, '0') : '--';
          return (
            <div key={key} className="contents">
              {i > 0 && (
                <span className="gta6-colon pt-2 font-heading text-[22px] font-bold leading-none text-[#FF6B5F] md:pt-4 md:text-[30px]">:</span>
              )}
              <div className="flex flex-col items-center">
                <div
                  className={`gta6-tile gta6-digits flex h-[52px] w-full items-center justify-center rounded-xl border border-white/[0.12] bg-[#1B0F24]/75 font-heading text-[30px] font-bold leading-none tabular-nums backdrop-blur-sm md:h-[76px] md:rounded-2xl md:text-[42px] ${
                    key === 'secs' ? 'text-[#FF8A80]' : 'text-[#FFF4EE]'
                  }`}
                >
                  {text.split('').map((ch, d) => (
                    <span key={`${d}-${ch}`} className="gta6-digit">
                      {ch}
                    </span>
                  ))}
                </div>
                <span className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A3A6B1] md:text-[11px]">{label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string; details?: { msg?: string }[] } } }; message?: string };
  const body = e?.response?.data?.error;
  const detail = body?.details?.[0]?.msg?.replace(/^Value error, /, '');
  return detail || body?.message || 'Something went wrong. Please try again.';
}

function CafeThumb({ cafe, className }: { cafe: PlayCafe; className: string }) {
  if (!cafe.photo) return <div className={`${className} bg-white/10`} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...optimizedImg(cafe.photo, '120px', { maxWidth: 384 })}
      onError={fallBackToOriginal(cafe.photo)}
      alt=""
      className={`${className} object-cover`}
    />
  );
}

export function Gta6Client() {
  const countdown = useCountdown(LAUNCH_AT);
  const cafes = usePs5Cafes();
  const { guardFields, trap } = useBotGuard();
  const [count, setCount] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [reach, setReach] = useState<ReachBy>('whatsapp');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ again: boolean; position: number } | null>(null);
  const [cafesOpen, setCafesOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const joinRef = useRef<HTMLButtonElement>(null);

  // On a phone the Join button sits below the fold. Once the title and the
  // countdown have played, glide down until it's in view: one time only, and
  // never after the visitor has touched, scrolled or typed (they're reading).
  useEffect(() => {
    if (window.location.hash) return;
    let touched = false;
    const stop = () => {
      touched = true;
    };
    const events = ['touchstart', 'wheel', 'keydown', 'pointerdown'] as const;
    events.forEach((e) => window.addEventListener(e, stop, { passive: true, once: true }));
    const t = setTimeout(() => {
      const btn = joinRef.current;
      const card = cardRef.current;
      if (touched || window.scrollY > 4 || !btn || !card) return;
      const need = btn.getBoundingClientRect().bottom + 16 - window.innerHeight;
      if (need <= 0) return;
      // Stop at a clean edge (a block's top), never halfway through the countdown.
      const stops = Array.from(document.querySelectorAll<HTMLElement>('[data-gta6-stop]')).map((el) => el.getBoundingClientRect().top - 14);
      const by = Math.min(...stops.filter((y) => y >= need), card.getBoundingClientRect().top - 12);
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollBy({ top: by, behavior: reduce ? 'auto' : 'smooth' });
      trackAction('launch_list_autoscroll', { launch: LAUNCH_KEY });
    }, AUTOSCROLL_AFTER_MS);
    return () => {
      clearTimeout(t);
      events.forEach((e) => window.removeEventListener(e, stop));
    };
  }, []);

  useEffect(() => {
    const load = () => {
      if (document.hidden) return;
      getLaunch(LAUNCH_KEY).then((l) => setCount(l.count)).catch(() => undefined);
    };
    load();
    const t = setInterval(load, COUNT_REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  // The /c/gta6 link forwards utm tags; keep them with the sign-up.
  const utm = useMemo(() => {
    if (typeof window === 'undefined') return {};
    const q = new URLSearchParams(window.location.search);
    const pick = (k: string) => q.get(k)?.slice(0, 80) || undefined;
    return { utmSource: pick('utm_source'), utmCampaign: pick('utm_campaign'), utmContent: pick('utm_content') };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError('Tell us your name.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Enter your 10-digit mobile number.');
    if (!consent) return setError("Tick the box so we're allowed to message you.");
    setBusy(true);
    try {
      const res = await joinLaunch(LAUNCH_KEY, {
        name: name.trim(),
        phone,
        contactMethod: reach,
        email: email.trim() || undefined,
        consent,
        ...utm,
        ...(await guardFields()),
      });
      setCount(res.count);
      setDone({ again: res.alreadyJoined, position: res.position });
      trackAction('launch_list_join', { launch: LAUNCH_KEY, reach, again: res.alreadyJoined, position: res.position });
      requestAnimationFrame(() => cardRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}/gta6`;
    const text = 'GTA 6 drops 19 Nov. No PS5? Join the KHEL-O launch list, we play it at a café on launch week 🎮';
    trackAction('launch_list_share', { launch: LAUNCH_KEY });
    if (navigator.share) {
      try {
        await navigator.share({ title: 'GTA 6 launch list', text, url });
        return;
      } catch {
        /* closed the sheet: fall through to WhatsApp */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`, '_blank', 'noopener');
  };

  const said = REACH.find((r) => r.value === reach)?.said ?? 'message you';
  const daysLeft = countdown?.days ?? 0;

  return (
    <div className="gta6 relative min-h-screen overflow-x-clip bg-[#0E0F13] text-[#F4F1EC] caret-[#D0463C] selection:bg-[#D0463C] selection:text-white">
      {/* A soft warm light in the far corner, under the sunset. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(640px_480px_at_100%_110%,rgba(208,70,60,0.16),transparent_65%)]"
      />
      <Gta6Scene />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-5 pt-4 md:px-8 md:pt-6">
        <Link href="/" className="flex items-center gap-2 font-heading text-base font-bold tracking-wide md:text-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/khelo-logo-64.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg md:h-8 md:w-8" />
          KHEL-O
        </Link>
        <span className="text-[13px] font-medium text-[#A3A6B1]">Hyderabad</span>
      </header>

      <main className="relative mx-auto grid max-w-5xl items-start gap-5 px-5 pb-16 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-x-16 md:px-8 md:pt-6">
        <div className="flex flex-col gap-5 pt-[106px] md:gap-8 md:pt-[208px]">
          <section>
            {/* Title card: each word rises out of its own slot. */}
            <h1 className="font-heading text-[40px] font-bold leading-[1.04] tracking-[-0.03em] md:text-[72px]">
              {['GTA', '6', 'drops'].map((w, i) => (
                <span key={w} className="inline-block overflow-hidden pb-[0.06em] align-bottom">
                  <span className="gta6-word" style={{ animationDelay: `${0.08 + i * 0.08}s` }}>
                    {w}
                  </span>
                  &nbsp;
                </span>
              ))}
              <span className="inline-block overflow-hidden pb-[0.06em] align-bottom">
                <span className="gta6-word text-[#FF6B5F]" style={{ animationDelay: '0.34s' }}>
                  19&nbsp;Nov.
                </span>
              </span>
            </h1>
            <CountdownTiles countdown={countdown} />
            <p data-gta6-stop className="mt-3.5 max-w-md text-[16px] leading-relaxed text-[#D9D6D0] md:mt-6 md:text-xl">
              No PS5 at home? Play it on a big screen at a café near you.
            </p>
          </section>

          {/* The pre-ordered cafés, folded into one row so they cost a line until
              someone asks. The arrow nudges a few times to say "open me", then
              rests. With none confirmed yet it lists bookable PS5 cafés instead. */}
          {(cafes === null || cafes.length > 0) && (
            <section data-gta6-stop>
              {cafes === null ? (
                <div className="h-[68px] animate-pulse rounded-2xl bg-white/[0.04]" />
              ) : (
                (() => {
                  const preordered = cafes.filter((c) => c.preordered);
                  const shown = preordered.length > 0 ? preordered : cafes;
                  const n = shown.length;
                  const title =
                    preordered.length > 0
                      ? `${n} ${n === 1 ? 'café has' : 'cafés have'} pre-ordered GTA 6`
                      : `${n} PS5 ${n === 1 ? 'café' : 'cafés'} you can book`;
                  return (
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
                      <button
                        type="button"
                        aria-expanded={cafesOpen}
                        aria-controls="gta6-cafe-list"
                        onClick={() => {
                          setCafesOpen((v) => !v);
                          if (!cafesOpen) trackAction('launch_list_cafes_open', { launch: LAUNCH_KEY, count: n });
                        }}
                        className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#FF6B5F]"
                      >
                        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#FF6B5F]/[0.14] text-[#FF8A80]">
                          <Check className="h-4 w-4" aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold leading-tight">{title}</span>
                          <span className="mt-0.5 block text-[12.5px] text-[#A3A6B1]">
                            {cafesOpen ? 'Tap one to see it and book' : 'Tap to see which'}
                          </span>
                        </span>
                        <ChevronDown
                          className={`h-5 w-5 flex-shrink-0 text-[#D9D6D0] transition-transform duration-300 ${cafesOpen ? 'rotate-180' : 'gta6-nudge'}`}
                          aria-hidden
                        />
                      </button>
                      {cafesOpen && (
                        <ul id="gta6-cafe-list" className="flex flex-col divide-y divide-white/[0.07] border-t border-white/[0.07] px-4 motion-safe:animate-in motion-safe:fade-in">
                          {shown.map((c) => (
                            <li key={c.id}>
                              <Link
                                href={c.href}
                                onClick={() => trackAction('launch_list_cafe_click', { launch: LAUNCH_KEY, cafe: c.name, where: 'strip' })}
                                className="group flex items-center gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B5F]"
                              >
                                <CafeThumb cafe={c} className="h-10 w-10 flex-shrink-0 rounded-[10px]" />
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[14.5px] font-semibold leading-tight">{c.name}</span>
                                  <span className="mt-0.5 block truncate text-[12.5px] text-[#A3A6B1]">
                                    {c.area} · {c.console}
                                    {c.price !== null && <> · ₹{c.price}/hr</>}
                                  </span>
                                </span>
                                <ArrowRight className="h-4 w-4 flex-shrink-0 text-[#6B6F7A] transition-transform group-hover:translate-x-0.5" aria-hidden />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })()
              )}
            </section>
          )}
        </div>

        <section ref={cardRef} className="scroll-mt-4 md:sticky md:top-8">
          <div className="rounded-[24px] bg-[#F4F1EC] p-5 text-[#111318] md:rounded-[28px] md:p-8">
            {done ? (
              <div className="flex flex-col items-start gap-3">
                {/* Wanted level: five stars light up one after another. */}
                <div className="flex items-center gap-3">
                  <span className="flex gap-1" aria-hidden="true">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <span key={i} className="relative h-6 w-6">
                        <Star className="absolute inset-0 h-6 w-6 text-[#DEDBD5]" strokeWidth={2} />
                        <Star
                          className="gta6-star absolute inset-0 h-6 w-6 fill-[#D0463C] text-[#D0463C]"
                          strokeWidth={2}
                          style={{ animationDelay: `${0.15 + i * 0.12}s` }}
                        />
                      </span>
                    ))}
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#5A5E6B]">Wanted level: max</span>
                </div>
                <h2 className="font-heading text-[24px] font-bold leading-tight tracking-tight">
                  {done.again ? 'You’re still on the list.' : `You’re on the list, ${name.trim().split(' ')[0]}.`}
                </h2>
                <p className="text-[15px] leading-relaxed text-[#5A5E6B]">
                  You’re <b className="font-semibold tabular-nums text-[#111318]">#{done.position}</b>. When launch-week slots open, we’ll {said}. If
                  you’re free, we’ll try to save you a seat.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="flex flex-col gap-4">
                {trap}
                <div>
                  <h2 className="font-heading text-[22px] font-bold leading-tight tracking-tight md:text-[26px]">
                    Get on the GTA 6 list
                  </h2>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-[#5A5E6B]">
                    Leave your number. When launch-week slots open, we’ll {said}. If you’re free, we’ll try to save you a
                    seat. Free to join, first come first served
                    {count !== null && count > 0 ? <> ({count.toLocaleString('en-IN')} in so far).</> : '.'}
                  </p>
                </div>

                <div className="flex flex-col gap-2.5">
                  <label htmlFor="gta6-name" className="sr-only">
                    Name
                  </label>
                  <input
                    id="gta6-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="given-name"
                    maxLength={80}
                    placeholder="Your name"
                    className="h-12 rounded-xl border border-[#DEDBD5] bg-white px-4 text-base outline-none transition-colors placeholder:text-[#7A7E89] focus:border-[#111318]"
                  />

                  <label htmlFor="gta6-phone" className="sr-only">
                    Mobile number
                  </label>
                  <div className="flex h-12 items-center rounded-xl border border-[#DEDBD5] bg-white transition-colors focus-within:border-[#111318]">
                    <span className="pl-4 pr-2 text-[#5A5E6B]">+91</span>
                    <input
                      id="gta6-phone"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+-]/g, ''))}
                      inputMode="tel"
                      autoComplete="tel-national"
                      maxLength={16}
                      placeholder="Mobile number"
                      className="h-full min-w-0 flex-1 rounded-r-xl bg-transparent pr-4 text-base outline-none placeholder:text-[#7A7E89]"
                    />
                  </div>
                </div>

                <fieldset>
                  <legend className="mb-1.5 text-[13px] font-medium text-[#5A5E6B]">Reach me on</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {REACH.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={reach === value}
                        onClick={() => setReach(value)}
                        className={`flex h-11 items-center justify-center gap-1.5 rounded-xl border text-[14px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D0463C] ${
                          reach === value ? 'border-[#111318] bg-[#111318] text-white' : 'border-[#DEDBD5] bg-white text-[#111318] hover:border-[#B9B6B0]'
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {showEmail ? (
                  <>
                    <label htmlFor="gta6-email" className="sr-only">
                      Email (optional)
                    </label>
                    <input
                      id="gta6-email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      type="email"
                      autoComplete="email"
                      maxLength={255}
                      placeholder="Email (optional)"
                      autoFocus
                      className="h-12 rounded-xl border border-[#DEDBD5] bg-white px-4 text-base outline-none transition-colors placeholder:text-[#7A7E89] focus:border-[#111318]"
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowEmail(true)}
                    className="-my-1 flex min-h-[32px] items-center gap-1 self-start text-[13px] font-medium text-[#5A5E6B] underline-offset-2 hover:text-[#111318] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add email (optional)
                  </button>
                )}

                <label className="flex cursor-pointer items-start gap-2.5 text-[13px] leading-snug text-[#5A5E6B]">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-px h-[18px] w-[18px] flex-shrink-0 accent-[#D0463C]"
                  />
                  <span>OK to {said} about GTA 6 at KHEL-O cafés. Only this, and you can stop it any time.</span>
                </label>

                {error && (
                  <p role="alert" className="rounded-xl bg-[#D0463C]/10 px-3.5 py-2 text-sm font-semibold text-[#B23A31]">
                    {error}
                  </p>
                )}

                <button
                  ref={joinRef}
                  type="submit"
                  disabled={busy}
                  className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#D0463C] text-base font-bold text-white transition-colors hover:bg-[#B23A31] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111318] disabled:opacity-70"
                >
                  {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                  Join the list
                </button>

                <p className="text-center text-xs text-[#5F636E]">
                  We use your number only for this.{' '}
                  <Link href="/privacy" className="underline underline-offset-2">
                    Privacy
                  </Link>
                </p>
              </form>
            )}
          </div>

          {/* After joining: somewhere to go next instead of a dead end. */}
          {done && (
            <div className="mt-8 flex flex-col gap-4">
              {cafes && cafes.length > 0 && (
                <div>
                  <h3 className="font-heading text-[18px] font-bold leading-tight tracking-tight">
                    {daysLeft >= 2 ? `Can’t wait ${daysLeft} days?` : 'Can’t wait?'} Play at one of these this week.
                  </h3>
                  <p className="mt-1.5 text-[14px] leading-relaxed text-[#A3A6B1]">
                    Book a PS5 slot and pay online. Your seat is ready when you walk in.
                    {firstBookingOfferLive() && <> No platform fee on your first booking.</>}
                  </p>
                  <ul className="mt-3 flex flex-col divide-y divide-white/[0.07] border-y border-white/[0.07]">
                    {cafes.slice(0, 3).map((c) => (
                      <li key={c.id}>
                        <Link
                          href={c.href}
                          onClick={() => trackAction('launch_list_cafe_click', { launch: LAUNCH_KEY, cafe: c.name, where: 'after_join' })}
                          className="group flex items-center gap-3 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B5F]"
                        >
                          <CafeThumb cafe={c} className="h-12 w-12 flex-shrink-0 rounded-xl" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold">{c.name}</span>
                            <span className="mt-0.5 flex items-center gap-1 truncate text-[12.5px] text-[#A3A6B1]">
                              {c.area}
                              {c.rating !== null && (
                                <>
                                  {' · '}
                                  <Star className="h-3 w-3 fill-current text-[#E7B15A]" aria-hidden />
                                  {c.rating.toFixed(1)}
                                </>
                              )}
                              {c.price !== null && <> · ₹{c.price}/hr</>}
                            </span>
                          </span>
                          <span className="flex flex-shrink-0 items-center gap-1 text-[13px] font-semibold text-[#F4F1EC]">
                            Book
                            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <button
                type="button"
                onClick={share}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/20 font-semibold transition-colors hover:border-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF6B5F]"
              >
                <Share2 className="h-4 w-4" aria-hidden />
                Send it to your player 2
              </button>
              <Link href="/cafes/hyderabad" className="py-1 text-center text-[13px] font-medium text-[#A3A6B1] hover:text-white">
                See every café in Hyderabad →
              </Link>
            </div>
          )}
        </section>
      </main>

      <footer className="relative mx-auto max-w-5xl px-5 pb-10 text-xs leading-relaxed text-[#8A8E99] md:px-8">
        GTA 6 is a trademark of Take-Two Interactive. KHEL-O isn’t affiliated with Rockstar Games. Launch date as announced
        by Rockstar; it can change.
      </footer>
    </div>
  );
}

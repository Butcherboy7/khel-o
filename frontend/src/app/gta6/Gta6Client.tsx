'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, Flame, Loader2, MessageCircle, MessageSquareText, Phone, Plus, Share2, Star } from 'lucide-react';
import { useBotGuard } from '@/components/auth/BotGuard';
import { getLaunch, joinLaunch, type ReachBy } from '@/lib/api/launchList';
import { listCafes, cafePath } from '@/lib/api/cafes';
import { trackAction } from '@/lib/api/analyticsEvents';
import { optimizedImg, fallBackToOriginal } from '@/lib/imageUrl';
import type { CafeListItem } from '@/types';
import { customerPrice } from '@/lib/format';
import { firstBookingOfferLive } from '@/lib/pricing';

const LAUNCH_KEY = 'gta6';
// 19 Nov 2026, midnight in Hyderabad.
const LAUNCH_AT = new Date('2026-11-19T00:00:00+05:30').getTime();
// The list count is re-read this often so a busy day visibly ticks up.
const COUNT_REFRESH_MS = 30_000;

const REACH: { value: ReachBy; label: string; icon: typeof Phone; said: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, said: 'WhatsApp you' },
  { value: 'text', label: 'Text', icon: MessageSquareText, said: 'text you' },
  { value: 'call', label: 'Call', icon: Phone, said: 'call you' },
];

/* Ad visitors land in the Instagram in-app browser, which shows about 700px
   of a 390px-wide phone. Everything needed to sign up (pitch, countdown, real
   cafés, the form and its button) is sized to fit inside that first screen. */

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

/** Rolls a number up to its new value (ease-out), or jumps when motion is reduced. */
function useCountUp(target: number | null): number | null {
  const [shown, setShown] = useState<number | null>(null);
  const from = useRef(0);
  useEffect(() => {
    if (target === null) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = from.current;
    if (reduce || start === target) {
      from.current = target;
      setShown(target);
      return;
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / 1100);
      const eased = 1 - Math.pow(2, -10 * p);
      setShown(Math.round(start + (target - start) * (p === 1 ? 1 : eased)));
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return shown;
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
            .slice(0, 3)
            .map(toPlayCafe),
        ),
      )
      .catch(() => setCafes([]));
  }, []);
  return cafes;
}

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string; details?: { msg?: string }[] } } }; message?: string };
  const body = e?.response?.data?.error;
  const detail = body?.details?.[0]?.msg?.replace(/^Value error, /, '');
  return detail || body?.message || 'Something went wrong. Please try again.';
}

function Tick({ value, label, seconds }: { value: number; label: string; seconds?: boolean }) {
  const v = String(value).padStart(2, '0');
  return (
    <div className="relative flex h-[38px] w-[38px] flex-col items-center justify-center overflow-hidden rounded-[10px] border border-white/10 bg-white/[0.05] md:h-[68px] md:w-[64px] md:rounded-2xl">
      {/* A new key remounts the digit, which plays the roll-in. */}
      <span key={v} className="gta6-tick font-heading text-[17px] font-bold leading-none tabular-nums md:text-[30px]">
        {v}
      </span>
      <span className="mt-[2px] text-[7.5px] font-bold uppercase tracking-[0.14em] text-[#A3A6B1] md:mt-1 md:text-[10px]">{label}</span>
      {seconds && <span key={`bar${v}`} aria-hidden className="gta6-sec absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[#FF5A4E]" />}
    </div>
  );
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
  const shownCount = useCountUp(count);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [showEmail, setShowEmail] = useState(false);
  const [reach, setReach] = useState<ReachBy>('whatsapp');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ again: boolean; position: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);

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
    <div className="gta6 min-h-screen bg-[#0E0F13] text-[#F4F1EC] caret-[#D0463C] selection:bg-[#D0463C] selection:text-white">
      <style>{`
        @keyframes gta6-tick { from { transform: translateY(-60%); opacity: 0; filter: blur(3px); } to { transform: none; opacity: 1; filter: none; } }
        @keyframes gta6-sec { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .gta6-tick { animation: gta6-tick 0.5s cubic-bezier(0.16, 1, 0.3, 1); }
        .gta6-sec { animation: gta6-sec 1s linear forwards; }
        @media (prefers-reduced-motion: reduce) { .gta6-tick, .gta6-sec { animation: none; } }
      `}</style>
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(700px_520px_at_95%_105%,rgba(208,70,60,0.30),transparent_60%)]"
      />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-4 pt-3 md:px-8 md:pt-5">
        <Link href="/" className="flex items-center gap-2 font-heading text-base font-bold tracking-wide md:text-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/khelo-logo-64.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg md:h-8 md:w-8" />
          KHEL-O
        </Link>
        <span className="text-[13px] font-semibold text-[#A3A6B1]">Hyderabad</span>
      </header>

      <main className="relative mx-auto grid max-w-5xl items-start gap-3 px-4 pb-14 pt-2 md:grid-cols-[1.1fr_1fr] md:gap-x-14 md:gap-y-8 md:px-8 md:pt-14">
        {/* Pitch + countdown. On phones the countdown sits beside "19 Nov." to save a row. */}
        <section className="md:col-start-1 md:row-start-1">
          <div className="relative">
            <h1 className="font-heading text-[42px] font-bold leading-[0.95] tracking-[-0.035em] md:text-[84px]">
              GTA 6 drops
              <span className="mt-2 block text-[#FF5A4E] md:mt-0">19 Nov.</span>
            </h1>
            <div
              role="timer"
              aria-label={countdown ? `${countdown.days} days ${countdown.hours} hours to launch` : 'Countdown to launch'}
              className="absolute bottom-0 right-0 flex gap-1 md:static md:mt-7 md:gap-2.5"
            >
              {countdown && !countdown.done ? (
                <>
                  <Tick value={countdown.days} label="days" />
                  <Tick value={countdown.hours} label="hrs" />
                  <Tick value={countdown.mins} label="min" />
                  <Tick value={countdown.secs} label="sec" seconds />
                </>
              ) : countdown?.done ? (
                <p className="rounded-full bg-[#D0463C] px-3 py-1.5 text-sm font-bold">It’s out. Grab a slot.</p>
              ) : (
                <div className="h-[38px] md:h-[68px]" />
              )}
            </div>
          </div>
          <p className="mt-2 max-w-md text-[14.5px] font-medium leading-snug text-[#D9D6D0] md:mt-6 md:text-xl">
            No PS5 at home? <b className="font-extrabold text-[#F4F1EC]">Koi tension nai.</b> Play it on a big screen at a
            café near you.
          </p>
        </section>

        {/* Proof: real, bookable PS5 cafés with their live price. Hidden if the list can't load. */}
        {cafes === null || cafes.length > 0 ? (
          <section className="md:col-start-1 md:row-start-2" aria-label="PS5 cafés on KHEL-O">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#A3A6B1] md:text-xs">
              PS5 cafés on KHEL-O · bookable today
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-2 md:mt-2.5 md:gap-3">
              {cafes === null
                ? [0, 1].map((i) => <div key={i} className="h-[52px] animate-pulse rounded-2xl bg-white/[0.05]" />)
                : cafes.slice(0, 2).map((c) => (
                    <Link
                      key={c.id}
                      href={c.href}
                      onClick={() => trackAction('launch_list_cafe_click', { launch: LAUNCH_KEY, cafe: c.name, where: 'strip' })}
                      className="flex h-[52px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-1.5 transition-colors hover:bg-white/[0.09] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5A4E]"
                    >
                      <CafeThumb cafe={c} className="h-10 w-10 flex-shrink-0 rounded-[10px]" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold leading-tight">{c.name}</span>
                        <span className="block truncate text-[11.5px] text-[#A3A6B1]">
                          {c.console}
                          {c.price !== null && (
                            <>
                              {' · '}
                              <b className="font-bold text-[#F4F1EC]">₹{c.price}</b>/hr
                            </>
                          )}
                        </span>
                      </span>
                    </Link>
                  ))}
            </div>
          </section>
        ) : null}

        <section ref={cardRef} className="scroll-mt-3 md:col-start-2 md:row-span-3 md:row-start-1 md:pt-2">
          <div className="rounded-[24px] bg-[#F4F1EC] p-3.5 text-[#111318] shadow-[0_24px_48px_-20px_rgba(0,0,0,0.6)] md:rounded-[28px] md:p-7">
            {done ? (
              <div className="flex flex-col items-start gap-2.5 py-1">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#D0463C] text-white">
                  <Check className="h-6 w-6" aria-hidden />
                </span>
                <h2 className="font-heading text-[26px] font-bold leading-tight tracking-tight">
                  {done.again ? 'Updated. You’re still on the list.' : `You’re in, ${name.trim().split(' ')[0]}.`}
                </h2>
                <span className="rounded-full bg-[#111318] px-3 py-1.5 text-[13px] font-bold text-white">
                  You’re <b className="text-[#FF5A4E] tabular-nums">#{done.position}</b> on the GTA 6 list
                </span>
                <p className="text-[14px] leading-relaxed text-[#5A5E6B]">
                  We’ll {said} first when launch-week slots open. One message, no spam.
                </p>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="flex flex-col gap-2.5 md:gap-4">
                {trap}
                <div>
                  <h2 className="font-heading text-[21px] font-bold leading-tight tracking-tight md:text-[26px]">
                    Get on the GTA 6 list
                  </h2>
                  <p className="mt-1 flex min-h-[22px] flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] font-semibold text-[#5A5E6B] md:text-sm">
                    {shownCount !== null && (
                      <>
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#111318] px-2.5 py-[3px] text-white">
                          <span className="relative flex h-1.5 w-1.5" aria-hidden>
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF5A4E] opacity-75 motion-reduce:animate-none" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#FF5A4E]" />
                          </span>
                          <span>
                            You’d be <b className="text-[#FF5A4E] tabular-nums">#{shownCount + 1}</b> in line
                          </span>
                        </span>
                        {shownCount === 0 ? (
                          <span>Be the first one in.</span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <b className="tabular-nums text-[#111318]">{shownCount.toLocaleString('en-IN')}</b> already in. It’s
                            gonna be crazy
                            <Flame className="h-3.5 w-3.5 text-[#D0463C]" aria-hidden />
                          </span>
                        )}
                      </>
                    )}
                  </p>
                </div>

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
                  className="h-11 rounded-xl border-2 border-[#E8E6E2] bg-white px-4 text-base outline-none transition-colors placeholder:text-[#7A7E89] focus:border-[#111318] md:h-12"
                />

                <label htmlFor="gta6-phone" className="sr-only">
                  Mobile number
                </label>
                <div className="flex h-11 items-center rounded-xl border-2 border-[#E8E6E2] bg-white transition-colors focus-within:border-[#111318] md:h-12">
                  <span className="pl-4 pr-2 font-semibold text-[#5A5E6B]">+91</span>
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

                <fieldset>
                  <legend className="mb-1 text-[12px] font-bold text-[#5A5E6B] md:text-sm">Reach me on</legend>
                  <div className="grid grid-cols-3 gap-1.5">
                    {REACH.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={reach === value}
                        onClick={() => setReach(value)}
                        className={`flex h-10 items-center justify-center gap-1.5 rounded-full border-2 text-[13.5px] font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D0463C] md:h-12 md:text-sm ${
                          reach === value ? 'border-[#111318] bg-[#111318] text-white' : 'border-[#E8E6E2] bg-white text-[#111318] hover:border-[#C9C6C0]'
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
                      className="h-11 rounded-xl border-2 border-[#E8E6E2] bg-white px-4 text-base outline-none transition-colors placeholder:text-[#7A7E89] focus:border-[#111318] md:h-12"
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowEmail(true)}
                    className="-my-0.5 flex items-center gap-1 self-start text-[12.5px] font-bold text-[#5A5E6B] underline-offset-2 hover:text-[#111318] hover:underline"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add email (optional)
                  </button>
                )}

                <label className="flex cursor-pointer items-start gap-2.5 text-[12px] leading-snug text-[#5A5E6B] md:text-sm">
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
                  type="submit"
                  disabled={busy}
                  className="flex h-[52px] items-center justify-center gap-2 rounded-2xl bg-[#D0463C] text-lg font-extrabold text-white transition-colors hover:bg-[#B23A31] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111318] disabled:opacity-70 md:h-14"
                >
                  {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                  I’m in
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
            <div className="mt-6 flex flex-col gap-3">
              {cafes && cafes.length > 0 && (
                <>
                  <div>
                    <h3 className="font-heading text-[20px] font-bold leading-tight tracking-tight [text-wrap:balance]">
                      {daysLeft >= 2 ? `Can’t wait ${daysLeft} days?` : 'Can’t wait?'} Play PS5 this week.
                    </h3>
                    <p className="mt-1 text-[13px] text-[#A3A6B1]">
                      Same cafés. Book a slot in a minute, pay online.
                      {firstBookingOfferLive() && <> <b className="font-bold text-[#F4F1EC]">First booking: no platform fee.</b></>}
                    </p>
                  </div>
                  {cafes.map((c) => (
                    <Link
                      key={c.id}
                      href={c.href}
                      onClick={() => trackAction('launch_list_cafe_click', { launch: LAUNCH_KEY, cafe: c.name, where: 'after_join' })}
                      className="group flex overflow-hidden rounded-[18px] border border-white/10 bg-[#16171C] transition-colors hover:border-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#FF5A4E]"
                    >
                      <CafeThumb cafe={c} className="h-[104px] w-28 flex-shrink-0" />
                      <span className="flex min-w-0 flex-1 flex-col justify-between px-3 py-2.5">
                        <span>
                          <span className="block truncate text-[15px] font-extrabold">{c.name}</span>
                          <span className="mt-0.5 flex items-center gap-1 text-xs text-[#A3A6B1]">
                            {c.area}
                            {c.rating !== null && (
                              <>
                                {' · '}
                                <Star className="h-3 w-3 fill-current text-[#FFB547]" aria-hidden />
                                {c.rating.toFixed(1)}
                              </>
                            )}
                          </span>
                          <span className="mt-1 block text-[12.5px] text-[#D9D6D0]">
                            {c.console}
                            {c.price !== null && (
                              <>
                                {' · from '}
                                <b className="font-extrabold text-[#F4F1EC]">₹{c.price}/hr</b>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="mt-1.5 inline-flex items-center gap-1 self-start rounded-full bg-[#D0463C] px-3 py-1.5 text-[13px] font-extrabold text-white transition-colors group-hover:bg-[#B23A31]">
                          Book PS5 <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </span>
                      </span>
                    </Link>
                  ))}
                </>
              )}
              <button
                type="button"
                onClick={share}
                className="flex h-[50px] items-center justify-center gap-2 rounded-2xl border-2 border-white/20 font-extrabold transition-colors hover:border-white/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#FF5A4E]"
              >
                <Share2 className="h-4 w-4" aria-hidden />
                Send it to your player 2
              </button>
              <Link href="/cafes/hyderabad" className="py-1 text-center text-[13px] font-bold text-[#D9D6D0] hover:text-white">
                See every café in Hyderabad →
              </Link>
            </div>
          )}
        </section>

        <section className="mt-5 md:col-start-1 md:row-start-3 md:mt-0">
          <ul className="flex flex-col gap-3 text-[14.5px] md:gap-4 md:text-base">
            {[
              ['First to know', 'you hear before launch-week slots go public'],
              ['Your spot', 'slots go in sign-up order, so early is better'],
              ['Launch deal', 'a list-only price at the cafés that sign up'],
              ['Free', 'joining costs nothing'],
            ].map(([k, v]) => (
              <li key={k} className="flex items-baseline gap-4">
                <span className="w-28 flex-shrink-0 font-heading font-bold text-[#FF5A4E]">{k}</span>
                <span className="text-[#D9D6D0]">{v}</span>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="relative mx-auto max-w-5xl px-4 pb-10 text-xs text-[#8A8E99] md:px-8">
        GTA 6 is a trademark of Take-Two Interactive. KHEL-O isn’t affiliated with Rockstar Games. Launch date as announced
        by Rockstar; it can change.
      </footer>
    </div>
  );
}

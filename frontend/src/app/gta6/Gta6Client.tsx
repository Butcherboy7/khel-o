'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, MessageCircle, MessageSquareText, Phone, Share2, Loader2 } from 'lucide-react';
import { useBotGuard } from '@/components/auth/BotGuard';
import { getLaunch, joinLaunch, type ReachBy } from '@/lib/api/launchList';
import { trackAction } from '@/lib/api/analyticsEvents';

const LAUNCH_KEY = 'gta6';
// 19 Nov 2026, midnight in Hyderabad.
const LAUNCH_AT = new Date('2026-11-19T00:00:00+05:30').getTime();
// Below this the public count reads as "nobody's here"; it only shows once it helps.
const SHOW_COUNT_FROM = 10;

const REACH: { value: ReachBy; label: string; icon: typeof Phone; said: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, said: 'WhatsApp you' },
  { value: 'text', label: 'Text', icon: MessageSquareText, said: 'text you' },
  { value: 'call', label: 'Call', icon: Phone, said: 'call you' },
];

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

function errorText(err: unknown): string {
  const e = err as { response?: { data?: { error?: { message?: string; details?: { msg?: string }[] } } }; message?: string };
  const body = e?.response?.data?.error;
  const detail = body?.details?.[0]?.msg?.replace(/^Value error, /, '');
  return detail || body?.message || 'Something went wrong. Please try again.';
}

export function Gta6Client() {
  const countdown = useCountdown(LAUNCH_AT);
  const { guardFields, trap } = useBotGuard();
  const [count, setCount] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [reach, setReach] = useState<ReachBy>('whatsapp');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ again: boolean } | null>(null);

  useEffect(() => {
    getLaunch(LAUNCH_KEY).then((l) => setCount(l.count)).catch(() => setCount(null));
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
      setDone({ again: res.alreadyJoined });
      trackAction('launch_list_join', { launch: LAUNCH_KEY, reach, again: res.alreadyJoined });
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

  return (
    <div className="gta6 min-h-screen bg-[#0E0F13] text-[#F4F1EC] selection:bg-[#D0463C] selection:text-white">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(900px_600px_at_90%_105%,rgba(208,70,60,0.30),transparent_60%)]"
      />

      <header className="relative mx-auto flex max-w-5xl items-center justify-between px-4 pt-5 md:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-heading text-lg font-bold tracking-wide">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/khelo-logo-64.png" alt="" width={32} height={32} className="h-8 w-8 rounded-lg" />
          KHEL-O
        </Link>
        <span className="text-sm font-semibold text-[#A3A6B1]">Hyderabad</span>
      </header>

      <main className="relative mx-auto grid max-w-5xl gap-10 px-4 pb-16 pt-10 md:grid-cols-[1.1fr_1fr] md:gap-x-14 md:gap-y-10 md:px-8 md:pt-16">
        <section className="flex flex-col md:col-start-1 md:row-start-1">
          <h1 className="font-heading text-[56px] font-bold leading-[0.95] tracking-[-0.035em] md:text-[84px]">
            GTA 6 drops
            <br />
            <span className="text-[#FF5A4E]">19 Nov.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg font-medium leading-snug text-[#D9D6D0] md:text-xl">
            No PS5 at home? <b className="font-extrabold text-[#F4F1EC]">Koi tension nai.</b> Play it on a big screen at a
            gaming café near you, on launch week.
          </p>

          <div className="mt-8 flex gap-2.5" aria-live="off">
            {countdown && !countdown.done ? (
              ([
                ['days', countdown.days],
                ['hrs', countdown.hours],
                ['min', countdown.mins],
                ['sec', countdown.secs],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex w-[72px] flex-col items-center rounded-2xl border border-white/10 bg-white/[0.04] py-3">
                  <span className="font-heading text-3xl font-bold tabular-nums">{String(value).padStart(2, '0')}</span>
                  <span className="mt-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#A3A6B1]">{label}</span>
                </div>
              ))
            ) : countdown?.done ? (
              <p className="rounded-full bg-[#D0463C] px-4 py-2 font-bold">GTA 6 is out. Grab a slot.</p>
            ) : (
              <div className="h-[74px]" />
            )}
          </div>
        </section>

        <section className="md:col-start-2 md:row-span-2 md:row-start-1 md:pt-2">
          <div className="rounded-[28px] bg-[#F4F1EC] p-5 text-[#111318] shadow-[0_30px_60px_-20px_rgba(0,0,0,0.6)] md:p-7">
            {done ? (
              <div className="flex flex-col gap-4 py-2">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#D0463C] text-white">
                  <Check className="h-6 w-6" aria-hidden />
                </span>
                <h2 className="font-heading text-[28px] font-bold leading-tight tracking-tight">
                  {done.again ? 'Updated. You’re still on the list.' : `You’re in, ${name.trim().split(' ')[0]}.`}
                </h2>
                <p className="text-[15px] leading-relaxed text-[#5A5E6B]">
                  We’ll {said} once launch-week slots open, with the launch deal. One message, no spam.
                </p>
                <button
                  type="button"
                  onClick={share}
                  className="mt-2 flex items-center justify-center gap-2 rounded-2xl bg-[#111318] py-4 font-bold text-white transition-colors hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D0463C]"
                >
                  <Share2 className="h-4 w-4" aria-hidden />
                  Send it to your player 2
                </button>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="flex flex-col gap-4">
                {trap}
                <div>
                  <h2 className="font-heading text-[26px] font-bold leading-tight tracking-tight">Join the GTA 6 launch list</h2>
                  {count !== null && count >= SHOW_COUNT_FROM && (
                    <p className="mt-1 text-sm font-semibold text-[#5A5E6B] tabular-nums">
                      <span className="text-[#D0463C]">{count.toLocaleString('en-IN')}</span> gamers are already on it
                    </p>
                  )}
                </div>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-[#5A5E6B]">Name</span>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="given-name"
                    maxLength={80}
                    placeholder="Your name"
                    className="h-12 rounded-xl border-2 border-[#E8E6E2] bg-white px-4 text-base outline-none transition-colors placeholder:text-[#8A8E99] focus:border-[#111318]"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-[#5A5E6B]">Mobile number</span>
                  <div className="flex h-12 items-center rounded-xl border-2 border-[#E8E6E2] bg-white transition-colors focus-within:border-[#111318]">
                    <span className="pl-4 pr-2 font-semibold text-[#5A5E6B]">+91</span>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/[^\d\s+-]/g, ''))}
                      inputMode="tel"
                      autoComplete="tel-national"
                      maxLength={16}
                      placeholder="98765 43210"
                      className="h-full min-w-0 flex-1 rounded-r-xl bg-transparent pr-4 text-base outline-none placeholder:text-[#8A8E99]"
                    />
                  </div>
                </label>

                <fieldset className="flex flex-col gap-1.5">
                  <legend className="mb-1.5 text-sm font-bold text-[#5A5E6B]">Reach me on</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {REACH.map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={reach === value}
                        onClick={() => setReach(value)}
                        className={`flex h-12 items-center justify-center gap-1.5 rounded-full border-2 text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#D0463C] ${
                          reach === value ? 'border-[#111318] bg-[#111318] text-white' : 'border-[#E8E6E2] bg-white text-[#111318] hover:border-[#C9C6C0]'
                        }`}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-[#5A5E6B]">
                    Email <span className="font-medium text-[#8A8E99]">(optional)</span>
                  </span>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    autoComplete="email"
                    maxLength={255}
                    placeholder="you@example.com"
                    className="h-12 rounded-xl border-2 border-[#E8E6E2] bg-white px-4 text-base outline-none transition-colors placeholder:text-[#8A8E99] focus:border-[#111318]"
                  />
                </label>

                <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-[#5A5E6B]">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[#D0463C]"
                  />
                  <span>
                    OK to {said} about GTA 6 at KHEL-O cafés. Only about this, and you can tell us to stop any time.
                  </span>
                </label>

                {error && (
                  <p role="alert" className="rounded-xl bg-[#D0463C]/10 px-3.5 py-2.5 text-sm font-semibold text-[#B23A31]">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-[#D0463C] text-lg font-extrabold text-white transition-colors hover:bg-[#B23A31] disabled:opacity-70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#111318]"
                >
                  {busy && <Loader2 className="h-5 w-5 animate-spin" aria-hidden />}
                  I’m in
                </button>

                <p className="text-center text-xs text-[#8A8E99]">
                  We use your number only for this. <Link href="/privacy" className="underline underline-offset-2">Privacy</Link>
                </p>
              </form>
            )}
          </div>
        </section>
        {/* On phones the form comes straight after the countdown (an ad visitor
            shouldn't have to scroll past the pitch to act); on desktop it sits
            beside the pitch and the perks fill the left column under it. */}
        <section className="md:col-start-1 md:row-start-2">
          <ul className="flex flex-col gap-4 text-base">
            {[
              ['First dibs', 'on launch-week PS5 slots at KHEL-O cafés'],
              ['Launch deal', 'a launch-week price, only for the list'],
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

      <footer className="relative mx-auto max-w-5xl px-4 pb-10 text-xs text-[#6E7280] md:px-8">
        GTA 6 is a trademark of Take-Two Interactive. KHEL-O isn’t affiliated with Rockstar Games. Launch date as announced
        by Rockstar; it can change.
      </footer>
    </div>
  );
}

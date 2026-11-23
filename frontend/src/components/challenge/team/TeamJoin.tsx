'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, ChevronRight, Hourglass, Instagram, Loader2, ShieldCheck, User, Users } from 'lucide-react';
import { MockPaymentModal } from '@/components/MockPaymentModal';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { useRazorpay } from '@/hooks/useRazorpay';
import { trackAction } from '@/lib/api/analyticsEvents';
import { getChallenge } from '@/lib/api/challenges';
import { ApiError } from '@/lib/api/errors';
import {
  getMyTeamEntry, joinWaitlist, startPayment, verifyPayment, type EntryBody, type PlayerForm, type Taps, type TeamInfo,
} from '@/lib/api/teamChallenges';
import { useAuthStore } from '@/store/authStore';
import type { TeamChallengeConfig } from '@/challenges/types';
import { AccountStep } from './AccountStep';
import { Labelled, PlayerFields, TEAM_NAME_RE, RIOT_RE, checkPlayer, cleanInsta, cleanRiot, phoneDigits, type PlayerErrors } from './PlayerFields';
import { TapButton, TeamFooter, Tick, field, instaUrl, rupees } from './ui';

type Step = 'account' | 'kind' | 'details' | 'agree';
type Kind = 'team' | 'solo';

const EMPTY: PlayerForm = { fullName: '', phone: '', riotId: '', rank: '', instagram: '', college: '', playStyle: '' };
const DRAFT_KEY = (slug: string) => `khelo-team-draft:${slug}`;

/** Which step a server error belongs to, so the person lands on the box to fix. */
const FIELD_FOR: Record<string, { step: Step; key: keyof PlayerErrors }> = {
  BAD_TEAM_NAME: { step: 'details', key: 'teamName' },
  TEAM_NAME_TAKEN: { step: 'details', key: 'teamName' },
  BAD_RIOT_ID: { step: 'details', key: 'riotId' },
  RIOT_ID_TAKEN: { step: 'details', key: 'riotId' },
  RIOT_ID_TWICE: { step: 'details', key: 'sub' },
  BAD_INSTAGRAM: { step: 'details', key: 'instagram' },
  BAD_PHONE: { step: 'details', key: 'phone' },
  BAD_NAME: { step: 'details', key: 'fullName' },
  BAD_RANK: { step: 'details', key: 'rank' },
};

export function TeamJoin({ cfg }: { cfg: TeamChallengeConfig }) {
  const router = useRouter();
  const query = useSearchParams();
  const { user, isAuthenticated, isHydrated } = useAuthStore();
  const { displayRazorpay, mockModalState } = useRazorpay();

  const [info, setInfo] = useState<TeamInfo | null>(null);
  const [kind, setKind] = useState<Kind | null>(() => {
    const k = query.get('kind');
    return k === 'team' || k === 'solo' ? k : null;
  });
  const [step, setStep] = useState<Step>('account');
  const [teamName, setTeamName] = useState('');
  const [me, setMe] = useState<PlayerForm>(EMPTY);
  const [withSub, setWithSub] = useState(false);
  const [sub, setSub] = useState({ fullName: '', riotId: '', phone: '' });
  const [taps, setTaps] = useState<Taps>({ community: false, instaKhelo: false, instaVenue: false });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<PlayerErrors>({});
  const [touched, setTouched] = useState<Partial<Record<string, boolean>>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [holdUntil, setHoldUntil] = useState<string | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const full = !!info && info.signupsOpen && info.spotsLeft <= 0;
  const waitlist = full || query.get('waitlist') === '1';
  const price = kind === 'solo' ? info?.priceSolo ?? 250 : info?.priceTeam ?? 1250;

  // Live counts: a full challenge turns Pay into "Join the waitlist".
  useEffect(() => {
    const load = () => getChallenge(cfg.slug).then((c) => setInfo((c as { team?: TeamInfo }).team ?? null)).catch(() => undefined);
    load();
    const t = window.setInterval(() => !document.hidden && load(), 20_000);
    return () => window.clearInterval(t);
  }, [cfg.slug]);

  // Signed in: skip step 1, prefill from the account, send anyone already in to "My entry".
  useEffect(() => {
    if (!isHydrated) return;
    if (!isAuthenticated) {
      setStep('account');
      return;
    }
    setMe((m) => ({ ...m, fullName: m.fullName || user?.fullName || '', phone: m.phone || phoneDigits(user?.phoneNumber || '') }));
    setStep((s) => (s === 'account' ? (kind ? 'details' : 'kind') : s));
    getMyTeamEntry(cfg.slug)
      .then((r) => {
        if (r.player && (r.player.status === 'active' || r.player.status === 'waitlist')) router.replace(`/challenge/${cfg.slug}/me`);
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHydrated, isAuthenticated]);

  // Keep what they typed if the page reloads (a slow network, an app switch to Instagram).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY(cfg.slug));
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d.teamName) setTeamName(d.teamName);
      if (d.me) setMe((m) => ({ ...m, ...d.me, fullName: m.fullName || d.me.fullName, phone: m.phone || d.me.phone }));
      if (d.sub) { setSub(d.sub); setWithSub(!!d.sub.fullName); }
      if (d.taps) setTaps(d.taps);
      if (d.kind && !query.get('kind')) setKind(d.kind);
    } catch { /* nothing saved */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg.slug]);
  useEffect(() => {
    try {
      sessionStorage.setItem(DRAFT_KEY(cfg.slug), JSON.stringify({ kind, teamName, me, sub, taps }));
    } catch { /* private mode */ }
  }, [cfg.slug, kind, teamName, me, sub, taps]);

  const go = (s: Step) => {
    setStep(s);
    setBanner(null);
    requestAnimationFrame(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const detailErrors = useMemo((): PlayerErrors => {
    const e = checkPlayer(me);
    if (kind === 'team' && !TEAM_NAME_RE.test(teamName.trim().replace(/\s+/g, ' '))) e.teamName = 'Team name: 3 to 20 letters, numbers or spaces.';
    if (kind === 'team' && withSub) {
      if (sub.fullName.trim().length < 2 || !RIOT_RE.test(cleanRiot(sub.riotId)) || !/^[6-9]\d{9}$/.test(phoneDigits(sub.phone))) {
        e.sub = 'Add the substitute’s name, Riot ID (Name#TAG) and 10-digit WhatsApp number, or remove them.';
      } else if (cleanRiot(sub.riotId).toLowerCase() === cleanRiot(me.riotId).toLowerCase()) {
        e.sub = 'Each player needs a different Riot ID.';
      }
    }
    return e;
  }, [me, kind, teamName, withSub, sub]);

  const shown = (k: keyof PlayerErrors) => (touched[k] || touched.all ? detailErrors[k] ?? errors[k] : errors[k]);

  const body = (): EntryBody => ({
    kind: kind!,
    teamName: kind === 'team' ? teamName.trim().replace(/\s+/g, ' ') : undefined,
    player: { ...me, riotId: cleanRiot(me.riotId), instagram: cleanInsta(me.instagram), phone: phoneDigits(me.phone), playStyle: kind === 'solo' ? me.playStyle || undefined : undefined },
    sub: kind === 'team' && withSub ? { fullName: sub.fullName.trim(), riotId: cleanRiot(sub.riotId), phone: phoneDigits(sub.phone) } : null,
    taps,
    agreed,
  });

  const fail = (e: unknown) => {
    const err = e as ApiError;
    const where = err?.code ? FIELD_FOR[err.code] : undefined;
    if (where) {
      setErrors({ [where.key]: err.message });
      go(where.step);
      return;
    }
    if (err?.code === 'ALREADY_IN') {
      router.replace(`/challenge/${cfg.slug}/me`);
      return;
    }
    if (err?.code === 'FULL') {
      setInfo((i) => (i ? { ...i, spotsLeft: 0 } : i));
      setBanner('The last team spot was just taken. You can still join the waitlist below, free.');
      return;
    }
    setBanner(err?.message || 'Something went wrong. Check your internet and try again.');
  };

  const toAgree = () => {
    setTouched({ all: true });
    setErrors({});
    if (Object.keys(detailErrors).length) {
      const first = Object.keys(detailErrors)[0];
      document.getElementById(first === 'teamName' ? 'team-name' : first === 'sub' ? 'sub-fullName' : `p-${first}`)?.focus();
      return;
    }
    trackAction('challenge_details_done', { challenge: cfg.slug, kind: kind ?? '' });
    go('agree');
  };

  const tap = (which: keyof Taps) => () => {
    setTaps((t) => ({ ...t, [which]: true }));
    trackAction(which === 'community' ? 'challenge_community_click' : 'challenge_instagram_click', { challenge: cfg.slug, where: 'join' });
  };

  const pay = async () => {
    if (!agreed || !kind) return;
    setBusy(true);
    setBanner(null);
    try {
      if (waitlist) {
        await joinWaitlist(cfg.slug, body());
        sessionStorage.removeItem(DRAFT_KEY(cfg.slug));
        router.push(`/challenge/${cfg.slug}/me?new=1`);
        return;
      }
      const order = await startPayment(cfg.slug, body());
      setHoldUntil(order.holdUntil);
      trackAction('challenge_pay_started', { challenge: cfg.slug, kind });
      displayRazorpay({
        order_id: order.orderId,
        amount: Math.round(order.amount * 100),
        currency: order.currency,
        key: order.keyId,
        name: 'KHEL-O',
        description: `${cfg.title}: ${kind === 'team' ? 'Team of 5' : 'Solo'} entry`,
        prefill: { name: me.fullName, email: user?.email, contact: phoneDigits(me.phone) },
        onDismiss: () => setBusy(false),
        handler: async (rsp) => {
          try {
            await verifyPayment(cfg.slug, {
              razorpayOrderId: rsp.razorpay_order_id,
              razorpayPaymentId: rsp.razorpay_payment_id,
              razorpaySignature: rsp.razorpay_signature,
            });
            sessionStorage.removeItem(DRAFT_KEY(cfg.slug));
            trackAction('challenge_paid', { challenge: cfg.slug, kind });
            router.push(`/challenge/${cfg.slug}/me?new=1`);
          } catch (e) {
            const err = e as ApiError;
            setBusy(false);
            if (err?.code === 'FULL_REFUNDED') {
              setBanner('Your payment came in after the last spot was taken, so we refunded it in full. It reaches you in 5 to 7 days. You can join the waitlist below.');
              setInfo((i) => (i ? { ...i, spotsLeft: 0 } : i));
            } else {
              setBanner(err?.message || 'The payment didn’t go through. No money was taken. Tap Pay to try again.');
            }
          }
        },
      });
    } catch (e) {
      setBusy(false);
      fail(e);
    }
  };

  const stepNo = { account: 1, kind: 2, details: 3, agree: 4 }[step];
  const signupsClosed = info && !info.signupsOpen;

  return (
    <div className="min-h-screen bg-[#0A0809] text-[#F4F1EC] selection:bg-[#D0463C] selection:text-white">
      {/* The café, quietly, behind the top of the flow. */}
      <div className="relative overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={cfg.media.photos[0].srcSmall} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-[#0A0809]" aria-hidden />
        <div className="relative mx-auto max-w-xl px-4 pb-6 pt-4">
          <Link
            href={step === 'account' || step === 'kind' ? `/challenge/${cfg.slug}` : '#'}
            onClick={(e) => {
              if (step === 'details') { e.preventDefault(); go(isAuthenticated ? 'kind' : 'account'); }
              if (step === 'agree') { e.preventDefault(); go('details'); }
            }}
            className="inline-flex h-11 items-center gap-1.5 rounded-full border border-white/20 bg-black/55 pl-3 pr-4 text-sm font-semibold backdrop-blur hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden /> Back
          </Link>
          <h1 className={`${fightFont.className} mt-5 text-[44px] font-bold uppercase leading-[0.85]`}>
            <span className="block">{cfg.titleTop}</span>
            <span className="block text-[30px] font-semibold tracking-[0.04em] text-[#E8675D]">{cfg.titleBottom}</span>
          </h1>
          <p className="mt-2 text-[15px] font-semibold text-[#DCD7E0]">
            {cfg.venue.name} · Sat 5 Dec · {info ? `${info.spotsLeft} of ${info.maxTeams} team spots left` : 'Checking spots…'}
          </p>
          <ol className="mt-4 grid grid-cols-4 gap-1.5" aria-label={`Step ${stepNo} of 4`}>
            {['Log in', 'Choose', 'Details', 'Pay'].map((label, i) => (
              <li key={label} className="flex flex-col gap-1">
                <span className={`h-1.5 rounded-full transition-colors duration-500 ${i < stepNo ? 'bg-[#D0463C]' : 'bg-white/15'}`} />
                <span className={`text-[12px] font-semibold ${i + 1 === stepNo ? 'text-white' : 'text-[#9A94A0]'}`}>{label}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div ref={topRef} className="mx-auto max-w-xl scroll-mt-4 px-4 pb-16">
        {signupsClosed && (
          <p className="mb-4 rounded-2xl border border-[#3A3340] bg-[#141017] p-4 text-[15px]">
            Sign-ups are closed. <Link className="font-bold text-[#E8675D] underline" href={`/challenge/${cfg.slug}/bracket`}>See the bracket</Link>
          </p>
        )}
        {waitlist && !signupsClosed && (
          <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#F2C94C]/45 bg-[#F2C94C]/10 p-4 text-[15px] text-[#FFE59A]">
            <Hourglass className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#F2C94C]" aria-hidden />
            <span>
              <b className="text-[#FFF1C2]">All {info?.maxTeams ?? 16} team spots are full.</b> Join the waitlist for free. If a team drops out, we
              message you first. Join the Khelo community so you don&apos;t miss it.
            </span>
          </div>
        )}
        {banner && (
          <p role="alert" className="mb-4 rounded-2xl border border-[#D0463C]/60 bg-[#2A1214] p-4 text-[15px] font-semibold text-[#FFC9C3]">
            {banner}
          </p>
        )}

        {/* ── 1. Log in ─────────────────────────────────────── */}
        {step === 'account' && (
          <section key="account" className="vx-step-in flex flex-col gap-4">
            <h2 className="text-[22px] font-bold">First, log in</h2>
            <p className="-mt-2 text-[15px] text-[#B4B0B8]">So your entry, QR and match time are saved to you.</p>
            {!isHydrated ? (
              <Loader2 className="h-6 w-6 animate-spin text-[#B4B0B8]" aria-label="Loading" />
            ) : (
              <AccountStep
                slug={cfg.slug}
                returnTo={`/challenge/${cfg.slug}/join${kind ? `?kind=${kind}` : ''}`}
                onDone={(who) => {
                  setMe((m) => ({ ...m, fullName: m.fullName || who.fullName, phone: m.phone || who.phone }));
                  go(kind ? 'details' : 'kind');
                }}
              />
            )}
          </section>
        )}

        {/* ── 2. Team or solo ───────────────────────────────── */}
        {step === 'kind' && (
          <section key="kind" className="vx-step-in flex flex-col gap-3">
            <h2 className="text-[22px] font-bold">How are you joining?</h2>
            <KindCard
              icon={<Users className="h-6 w-6" aria-hidden />}
              title="Team of 5"
              price={info?.priceTeam ?? 1250}
              line={`${rupees(Math.round((info?.priceTeam ?? 1250) / (info?.size ?? 5)))} per player. You pay for the team, your {(info?.size ?? 5) - 1} friends join free with your link.`}
              badge="Best value"
              onClick={() => { setKind('team'); go('details'); }}
            />
            <KindCard
              icon={<User className="h-6 w-6" aria-hidden />}
              title="Solo"
              price={info?.priceSolo ?? 250}
              line="No team? We put you in a team that needs players. Full refund if we can't."
              onClick={() => { setKind('solo'); go('details'); }}
            />
            <p className="text-center text-sm text-[#A49EA9]">No booking fee. Nothing added on top.</p>
          </section>
        )}

        {/* ── 3. Details ────────────────────────────────────── */}
        {step === 'details' && kind && (
          <section key="details" className="vx-step-in flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[22px] font-bold">{kind === 'team' ? 'Your team' : 'Your details'}</h2>
              <button type="button" onClick={() => go('kind')} className="min-h-[44px] rounded-full px-3 text-sm font-semibold text-[#E8675D] hover:bg-white/5">
                {kind === 'team' ? 'Team of 5' : 'Solo'} · Change
              </button>
            </div>
            {kind === 'team' && (
              <Labelled id="team-name" label="Team name" hint="3 to 20 letters or numbers. Shown on the bracket." error={shown('teamName')}>
                <input
                  id="team-name"
                  className={field}
                  maxLength={20}
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, teamName: true }))}
                  aria-invalid={shown('teamName') ? true : undefined}
                  aria-describedby={shown('teamName') ? 'team-name-err' : 'team-name-hint'}
                />
              </Labelled>
            )}
            {kind === 'team' && <p className="-mb-1 text-[15px] font-bold text-[#F2C94C]">You (the captain)</p>}
            <PlayerFields
              value={me}
              onChange={setMe}
              solo={kind === 'solo'}
              errors={Object.fromEntries((['fullName', 'phone', 'riotId', 'rank', 'instagram'] as const).map((k) => [k, shown(k)]))}
              onBlurField={(k) => setTouched((t) => ({ ...t, [k]: true }))}
            />
            {kind === 'team' && (
              <div className="rounded-2xl border border-[#2C2530] bg-[#141017] p-4">
                <p className="text-[15px] font-bold">Your {(info?.size ?? 5) - 1} teammates</p>
                <p className="mt-1 text-[14px] leading-snug text-[#B4B0B8]">
                  After you pay, you get a link. Send it to them on WhatsApp and they fill their own details. Free for them.
                </p>
                {!withSub ? (
                  <button type="button" onClick={() => setWithSub(true)} className="mt-3 min-h-[44px] text-[15px] font-bold text-[#E8675D]">
                    + Add a substitute (optional)
                  </button>
                ) : (
                  <div className="mt-4 flex flex-col gap-3 border-t border-[#2C2530] pt-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[15px] font-bold">Substitute</p>
                      <button type="button" onClick={() => { setWithSub(false); setSub({ fullName: '', riotId: '', phone: '' }); }} className="min-h-[44px] px-2 text-sm font-semibold text-[#B4B0B8]">
                        Remove
                      </button>
                    </div>
                    <Labelled id="sub-fullName" label="Name">
                      <input id="sub-fullName" className={field} value={sub.fullName} onChange={(e) => setSub({ ...sub, fullName: e.target.value })} />
                    </Labelled>
                    <Labelled id="sub-riot" label="Riot ID">
                      <input id="sub-riot" className={field} placeholder="Name#TAG" autoCapitalize="off" spellCheck={false} value={sub.riotId} onChange={(e) => setSub({ ...sub, riotId: e.target.value })} />
                    </Labelled>
                    <Labelled id="sub-phone" label="WhatsApp number">
                      <input id="sub-phone" className={`${field} tabular-nums`} inputMode="numeric" maxLength={14} value={sub.phone} onChange={(e) => setSub({ ...sub, phone: e.target.value })} />
                    </Labelled>
                    {shown('sub') && <p role="alert" className="text-[13px] font-medium text-[#FF9C93]">{shown('sub')}</p>}
                  </div>
                )}
              </div>
            )}
            <PrimaryButton onClick={toAgree}>Next</PrimaryButton>
          </section>
        )}

        {/* ── 4. Community, Instagram, the one tick, pay ─────── */}
        {step === 'agree' && kind && (
          <section key="agree" className="vx-step-in flex flex-col gap-4">
            <h2 className="text-[22px] font-bold">Last step</h2>
            <p className="-mt-2 text-[15px] text-[#B4B0B8]">Match times, the bracket draw and scores are shared here first.</p>
            <TapButton href={cfg.links.communityInvite} done={taps.community} onTap={tap('community')} tone="whatsapp" icon={<WhatsAppIcon className="h-7 w-7 text-[#25D366]" />}>
              Join the Khelo community
            </TapButton>
            <TapButton href={instaUrl(cfg.links.kheloInstagramHandle)} done={taps.instaKhelo} onTap={tap('instaKhelo')} tone="instagram" icon={<Instagram className="h-6 w-6" />}>
              Follow Khelo on Instagram
            </TapButton>
            {cfg.venue.instagramHandle && (
              <TapButton href={instaUrl(cfg.venue.instagramHandle)} done={taps.instaVenue} onTap={tap('instaVenue')} tone="instagram" icon={<Instagram className="h-6 w-6" />}>
                Follow {cfg.venue.shortName} on Instagram
              </TapButton>
            )}

            <div className="mt-2 rounded-2xl border border-[#2C2530] bg-[#141017] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[16px] font-bold">{kind === 'team' ? `Team of 5 · ${teamName.trim()}` : 'Solo entry'}</span>
                <span className={`${fightFont.className} text-[36px] font-bold leading-none`}>{waitlist ? 'Free' : rupees(price)}</span>
              </div>
              <p className="mt-1 text-[14px] text-[#B4B0B8]">
                {waitlist ? 'Waitlist: you pay only if we offer you a spot.' : 'No booking fee. Nothing added on top.'}
              </p>
            </div>

            <Tick checked={agreed} onChange={setAgreed}>
              {cfg.agreeLine}{' '}
              <Link href={`/challenge/${cfg.slug}#rules`} className="font-semibold text-[#E8675D] underline" target="_blank">
                Read the rules
              </Link>
            </Tick>

            <PrimaryButton busy={busy} disabled={!agreed || !!signupsClosed} onClick={pay}>
              {waitlist ? 'Join the waitlist' : `Pay ${rupees(price)}`}
            </PrimaryButton>
            {!agreed && <p className="-mt-2 text-center text-[13px] text-[#A49EA9]">Tick the box to continue.</p>}
            {holdUntil && busy && !waitlist && (
              <p className="text-center text-[13px] text-[#F2C94C]">We&apos;re holding your spot for 10 minutes while you pay.</p>
            )}
            <p className="flex items-center justify-center gap-1.5 text-[13px] text-[#A49EA9]">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Safe payment by Razorpay. UPI, cards and wallets.
            </p>
          </section>
        )}
      </div>

      <TeamFooter cfg={cfg} />

      <MockPaymentModal
        isOpen={mockModalState?.isOpen || false}
        orderId={mockModalState?.orderId || ''}
        amount={mockModalState?.amount || 0}
        onSuccess={mockModalState?.onSuccess || (() => {})}
        onFailure={mockModalState?.onFailure || (() => {})}
        onClose={mockModalState?.onClose || (() => {})}
      />
    </div>
  );
}

function PrimaryButton({ children, busy = false, disabled = false, onClick, type = 'button' }: {
  children: React.ReactNode; busy?: boolean; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={busy || disabled}
      className="vx-corner flex h-[58px] w-full items-center justify-center gap-2 bg-[#D0463C] text-[18px] font-bold text-white shadow-[0_10px_30px_-10px_rgba(208,70,60,0.8)] transition-colors hover:bg-[#B93C33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:bg-[#4A2A2A] disabled:text-[#C9A8A4] disabled:shadow-none"
    >
      {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Working" /> : <>{children}<ChevronRight className="h-5 w-5" aria-hidden /></>}
    </button>
  );
}

function KindCard({ icon, title, price, line, badge, onClick }: { icon: React.ReactNode; title: string; price: number; line: string; badge?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`vx-corner relative flex w-full items-center gap-4 p-4 text-left transition-colors hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        badge ? 'bg-gradient-to-br from-[#2A1214] to-[#141017] ring-1 ring-inset ring-[#D0463C]/60' : 'bg-[#141017] ring-1 ring-inset ring-[#2A2530]'
      }`}
    >
      {badge && <span className="absolute right-0 top-0 bg-[#F2C94C] px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-[#1A1306]">{badge}</span>}
      <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#D0463C]/15 text-[#E8675D]">{icon}</span>
      <span className="flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-[18px] font-bold">{title}</span>
          <span className={`${fightFont.className} text-[30px] font-bold leading-none`}>{rupees(price)}</span>
        </span>
        <span className="mt-1 block text-[14px] leading-snug text-[#B4B0B8]">{line}</span>
      </span>
      <ChevronRight className="h-5 w-5 flex-shrink-0 text-[#B4B0B8]" aria-hidden />
    </button>
  );
}

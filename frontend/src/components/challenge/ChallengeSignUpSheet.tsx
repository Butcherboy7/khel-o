'use client';

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarPlus, CheckCircle2, MessageCircle, Share2, X } from 'lucide-react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useBotGuard } from '@/components/auth/BotGuard';
import { fightFont } from '@/components/challenge/ChallengeHero';
import { useAuthStore } from '@/store/authStore';
import { getPublicEnv } from '@/lib/runtimeEnv';
import { trackAction } from '@/lib/api/analyticsEvents';
import { joinChallenge, quickJoinChallenge, type Challenge, type MyChallenge } from '@/lib/api/challenges';
import { ApiError } from '@/lib/api/errors';
import { COMMUNITY_URL, calendarUrl, challengeDay, challengeTimeRange, openToAll, recalledUtm, whatsappShare } from '@/lib/challenge';
import {
  hasTappedCommunity,
  lastSignInMethod,
  markCommunityTapped,
  rememberSignInMethod,
  type SignInMethod,
} from '@/lib/challenge-signup';

interface Props {
  challenge: Challenge;
  isOpen: boolean;
  onClose: () => void;
  /** Go to the player's own page (check-in QR). */
  onJoined: () => void;
}

const field =
  'h-12 w-full rounded-xl border border-[#2C2530] bg-[#0F0C12] px-3.5 text-base text-[#F4F1EC] placeholder:text-[#6F6874] focus:border-[#E8675D] focus:outline-none focus:ring-2 focus:ring-[#E8675D]/40';

/**
 * One screen to lock a spot: Continue with Google (name and email fill
 * themselves), or name, email and WhatsApp number with no password. Nothing
 * is saved until "Lock my spot". After that the sheet turns into step 2:
 * joining the WhatsApp community, which is where check-in and bracket
 * updates are sent.
 */
export function ChallengeSignUpSheet({ challenge, isOpen, onClose, onJoined }: Props) {
  const router = useRouter();
  const { user, isAuthenticated, setAuth } = useAuthStore();
  const { guardFields, trap } = useBotGuard();
  const hasGoogle = Boolean(getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID'));
  const panelRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [rules, setRules] = useState(false);
  const [extras, setExtras] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingEmail, setExistingEmail] = useState(false);
  const [done, setDone] = useState<MyChallenge | null>(null);
  const [last, setLast] = useState<SignInMethod | null>(null);
  const [viaGoogle, setViaGoogle] = useState(false);
  const [communityTapped, setCommunityTapped] = useState(false);

  useEffect(() => {
    setLast(lastSignInMethod());
    setCommunityTapped(hasTappedCommunity(challenge.slug));
  }, [challenge.slug]);

  // A signed-in account fills the name, email and number by itself.
  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.fullName || '');
    setEmail((e) => e || user.email || '');
    setPhone((p) => p || (user.phoneNumber ?? '').replace(/^\+91/, ''));
  }, [user]);

  // Escape closes, the page behind doesn't scroll, focus lands in the sheet.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const signedIn = isAuthenticated && !!user;
  const full = challenge.spotsLeft <= 0 && !openToAll(challenge.capacity);
  const cta = full ? 'Join the reserve list' : 'Lock my spot';

  const backHere = () => {
    const q = new URLSearchParams(window.location.search);
    q.set('join', '1');
    return encodeURIComponent(`${window.location.pathname}?${q.toString()}`);
  };

  // From the QR at the café counter: walk-ins sign up and are checked in at once.
  const door = typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('door') ?? '';

  const finish = (res: MyChallenge, method: SignInMethod) => {
    rememberSignInMethod(method);
    trackAction('challenge_signup_completed', {
      challenge: challenge.slug,
      status: res.entry?.status,
      again: res.created === false,
      method,
    });
    setDone(res);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setExistingEmail(false);
    if (!name.trim()) return setError('Tell us your name.');
    if (!signedIn && !/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim())) return setError('Enter a valid email.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Enter your 10-digit WhatsApp number.');
    if (!rules) return setError('Tick the box to agree to the rules.');
    setBusy(true);
    try {
      const base = {
        name: name.trim(),
        phone,
        consentRules: rules,
        consentFilming: extras,
        consentUpdates: extras,
        ...recalledUtm(window.location.search),
        ...(door ? { door } : {}),
        ...(await guardFields()),
      };
      if (signedIn) {
        finish(await joinChallenge(challenge.slug, base), viaGoogle ? 'google' : 'form');
      } else {
        const res = await quickJoinChallenge(challenge.slug, { ...base, email: email.trim().toLowerCase() });
        setAuth(res.user, res.accessToken, res.refreshToken);
        finish(res, 'form');
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_ALREADY_EXISTS') {
        setExistingEmail(true);
      } else {
        setError((err as Error)?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const shareText =
    `I'm playing in ${challenge.title} at ${challenge.cafe.name}${challenge.cafe.city ? `, ${challenge.cafe.city}` : ''}: ` +
    `${challengeDay(challenge.startsAt)}, ${challengeTimeRange(challenge.startsAt, challenge.endsAt)}. ` +
    `Free to sign up${openToAll(challenge.capacity) ? '' : `, ${challenge.capacity} player spots`}. ${window.location.origin}/challenge/${challenge.slug}`;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center" role="presentation">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/70" tabIndex={-1} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={done ? 'You are in' : cta}
        className="relative max-h-[94dvh] w-full max-w-content overflow-y-auto overscroll-contain rounded-t-3xl border-t border-[#3A1F22] bg-[#14101A] px-5 pb-6 pt-4 text-[#F4F1EC] outline-none"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className={`${fightFont.className} text-3xl font-bold uppercase leading-none tracking-wide`}>
            {done ? (done.entry?.present ? 'You’re checked in' : done.entry?.status === 'waitlist' ? 'You’re on the reserve list' : 'You’re in') : cta}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#22252D]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <Done
            slug={challenge.slug}
            res={done}
            communityUrl={challenge.communityUrl || COMMUNITY_URL}
            tapped={communityTapped}
            onTap={() => {
              markCommunityTapped(challenge.slug);
              setCommunityTapped(true);
              trackAction('challenge_community_click', { challenge: challenge.slug, where: 'after_signup' });
            }}
            shareHref={whatsappShare(shareText)}
            calendarHref={calendarUrl(challenge)}
            onSpot={onJoined}
          />
        ) : (
          <form onSubmit={submit} noValidate className="relative flex flex-col gap-3">
            {trap}
            <p className="-mt-1 rounded-xl bg-[#F2C94C] px-3 py-2 text-sm font-bold leading-snug text-[#1A1306]">
              {full
                ? 'Free to enter. Come to check-in and we’ll fit you in: when someone doesn’t show, the next reserve player there plays.'
                : `Free to enter. ${challenge.prizeLine || 'Nothing to pay.'}`}
            </p>
            {signedIn && viaGoogle ? (
              <p className="flex items-center gap-2 rounded-xl border border-[#3B6B4A] bg-[#13221A] px-3 py-2.5 text-sm">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-[#7FE0A0]" aria-hidden />
                <span className="min-w-0 truncate">Signed in as {user?.email}</span>
              </p>
            ) : null}

            {!signedIn && hasGoogle && (
              <div className="relative">
                {last === 'google' && <LastUsed />}
                <div>
                  <GoogleSignInButton
                    onSuccess={() => {
                      setViaGoogle(true);
                      trackAction('challenge_signin_done', { challenge: challenge.slug, method: 'google' });
                    }}
                    onError={setError}
                    inAppKeeps="The link opens on this same page."
                  />
                </div>
                <p className="my-3 flex items-center gap-3 text-xs text-[#8C8592]" aria-hidden>
                  <span className="h-px flex-1 bg-[#2C2530]" /> or fill it in <span className="h-px flex-1 bg-[#2C2530]" />
                </p>
              </div>
            )}

            <div className="relative flex flex-col gap-3">
              {!signedIn && last === 'form' && <LastUsed />}
              <label className="flex flex-col gap-1 text-sm font-medium">
                Your name
                <input className={field} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
              </label>
              {!signedIn && (
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Email
                  <input
                    className={field}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    inputMode="email"
                    maxLength={255}
                  />
                </label>
              )}
              <label className="flex flex-col gap-1 text-sm font-medium">
                WhatsApp number
                <input
                  className={field}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="98765 43210"
                  maxLength={14}
                />
                <span className="text-xs font-normal text-[#A39DAB]">For check-in and bracket updates. Never shown publicly.</span>
              </label>
            </div>

            <fieldset className="mt-1 flex flex-col gap-2.5">
              <legend className="sr-only">Agreements</legend>
              <Tick checked={rules} onChange={setRules}>
                I agree to the{' '}
                <Link href={`/challenge/${challenge.slug}/rules`} target="_blank" className="font-semibold underline">
                  rules
                </Link>
                .
              </Tick>
              <Tick checked={extras} onChange={setExtras}>
                OK to film me for KHELO videos and tell me about future challenges. <span className="text-[#A39DAB]">(optional)</span>
              </Tick>
            </fieldset>

            {existingEmail && (
              <div role="alert" className="rounded-xl bg-[#2A1A1C] px-3 py-3 text-sm">
                You already have a KHEL-O account. Sign in to lock your spot.
                <button
                  type="button"
                  onClick={() => router.push(`/login?redirect=${backHere()}`)}
                  className="mt-2 flex h-11 w-full items-center justify-center rounded-xl bg-[#22252D] font-semibold"
                >
                  Sign in
                </button>
              </div>
            )}
            {error && (
              <p role="alert" className="rounded-xl bg-[#2A1A1C] px-3 py-2 text-sm text-[#FF9C93]">
                {error}
              </p>
            )}

            {!full && challenge.confirmed > 0 && (
              <p className="text-center text-sm font-bold text-[#F2C94C]">You’ll be player {challenge.confirmed + 1}</p>
            )}
            <button
              type="submit"
              disabled={busy}
              className={`${fightFont.className} h-14 w-full rounded-xl bg-[#D0463C] text-2xl font-bold uppercase tracking-wider text-white transition-colors hover:bg-[#E8675D] disabled:opacity-70`}
            >
              {busy ? 'Saving your spot…' : cta}
            </button>
            <p className="text-center text-xs text-[#A39DAB]">
              Free. Nothing to pay. By continuing you accept our{' '}
              <Link href="/terms" target="_blank" className="underline">Terms</Link> and{' '}
              <Link href="/privacy" target="_blank" className="underline">Privacy Policy</Link>.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function LastUsed() {
  return (
    <span className="absolute -top-2 right-3 z-10 rounded-full bg-[#F2C94C] px-2 py-0.5 text-[11px] font-semibold text-[#1A1306]">
      Last used
    </span>
  );
}

function Done({
  slug,
  res,
  communityUrl,
  tapped,
  onTap,
  shareHref,
  calendarHref,
  onSpot,
}: {
  slug: string;
  res: MyChallenge;
  communityUrl: string;
  tapped: boolean;
  onTap: () => void;
  shareHref: string;
  calendarHref: string;
  onSpot: () => void;
}) {
  const waitlist = res.entry?.status === 'waitlist';
  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-xl border border-[#3B6B4A] bg-[#13221A] px-3 py-3 text-sm">
        <CheckCircle2 className="mr-2 inline h-4 w-4 text-[#7FE0A0]" aria-hidden />
        {res.entry?.present
          ? 'You’re checked in. Watch the big screen: your name goes into the draw.'
          : waitlist
          ? 'You’re on the reserve list. Come to check-in and we’ll fit you in as spots free up.'
          : `Your spot is locked${res.entry?.rank ? `: P${res.entry.rank}` : ''}.`}
      </p>
      <div className="rounded-2xl border border-[#1F6B3A] bg-[#0E1D14] p-4">
        <p className="text-xs font-semibold text-[#7FE0A0]">Step 2 · Required</p>
        <p className="mt-1 font-semibold">Join the WhatsApp community.</p>
        <p className="mt-1 text-sm text-[#C9C4CF]">Check-in and bracket updates are sent only there. Players who skip it miss them.</p>
        <a
          href={communityUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onTap}
          className="mt-3 flex h-14 items-center justify-center gap-2 rounded-xl bg-[#25D366] text-base font-bold text-[#0B2E17]"
        >
          <MessageCircle className="h-5 w-5" aria-hidden /> {tapped ? 'Open the community again' : 'Join the community'}
        </a>
        {tapped && <p className="mt-2 text-xs text-[#7FE0A0]">Thanks. Make sure you tapped “Join” inside WhatsApp.</p>}
      </div>
      <a
        href={calendarHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackAction('challenge_calendar_add', { challenge: slug, where: 'after_signup' })}
        className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#F2C94C]/60 bg-[#F2C94C]/10 font-semibold text-[#F2C94C]"
      >
        <CalendarPlus className="h-4 w-4" aria-hidden /> Add to my calendar
      </a>
      <a
        href={shareHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => trackAction('challenge_invite_friend', { challenge: slug, where: 'after_signup' })}
        className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#22252D] font-semibold"
      >
        <Share2 className="h-4 w-4" aria-hidden /> Challenge a friend
      </a>
      <button type="button" onClick={onSpot} className="h-11 text-sm font-semibold underline underline-offset-2">
        See my spot and check-in QR
      </button>
    </div>
  );
}

function Tick({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-5 w-5 flex-shrink-0 accent-[#D0463C]"
      />
      <span>{children}</span>
    </label>
  );
}

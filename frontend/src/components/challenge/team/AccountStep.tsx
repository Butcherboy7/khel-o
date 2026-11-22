'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2 } from 'lucide-react';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useBotGuard } from '@/components/auth/BotGuard';
import { trackAction } from '@/lib/api/analyticsEvents';
import { ApiError } from '@/lib/api/errors';
import { makeAccount } from '@/lib/api/teamChallenges';
import { recalledUtm } from '@/lib/challenge';
import { getPublicEnv } from '@/lib/runtimeEnv';
import { useAuthStore } from '@/store/authStore';
import { Labelled, phoneDigits } from './PlayerFields';
import { field } from './ui';

/** Log in with Google, or name + email + WhatsApp (a KHEL-O account with no password). */
export function AccountStep({ slug, returnTo, onDone }: {
  slug: string;
  /** Where "Log in" sends someone who already has an account, and brings them back. */
  returnTo: string;
  onDone: (who: { fullName: string; phone: string }) => void;
}) {
  const { setAuth } = useAuthStore();
  const { guardFields, trap } = useBotGuard();
  const hasGoogle = Boolean(getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID'));
  const [a, setA] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [emailTaken, setEmailTaken] = useState(false);
  const [busy, setBusy] = useState(false);
  const loginHref = `/login?redirect=${encodeURIComponent(returnTo)}`;

  const submit = async () => {
    setError(null);
    setEmailTaken(false);
    if (a.name.trim().length < 2) return setError('Write your full name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(a.email.trim())) return setError('Enter a valid email.');
    if (!/^[6-9]\d{9}$/.test(phoneDigits(a.phone))) return setError('WhatsApp number: 10 digits, like 9876543210.');
    setBusy(true);
    try {
      const utm = recalledUtm(window.location.search);
      const r = await makeAccount(slug, {
        name: a.name.trim(), email: a.email.trim(), phone: phoneDigits(a.phone),
        utmSource: utm.utmSource, utmCampaign: utm.utmCampaign, ...(await guardFields()),
      });
      setAuth(r.user, r.accessToken, r.refreshToken);
      trackAction('challenge_signin_done', { challenge: slug, method: 'form' });
      onDone({ fullName: a.name.trim(), phone: phoneDigits(a.phone) });
    } catch (e) {
      const err = e as ApiError;
      if (err?.code === 'EMAIL_ALREADY_EXISTS') setEmailTaken(true);
      setError(err?.message || 'Could not make your account. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {hasGoogle && (
        <>
          <GoogleSignInButton
            onSuccess={() => {
              trackAction('challenge_signin_done', { challenge: slug, method: 'google' });
              const u = useAuthStore.getState().user;
              onDone({ fullName: u?.fullName ?? '', phone: phoneDigits(u?.phoneNumber ?? '') });
            }}
            onError={setError}
            inAppKeeps="The link opens on this same page."
          />
          <p className="flex items-center gap-3 text-xs text-[#8C8592]" aria-hidden>
            <span className="h-px flex-1 bg-[#2C2530]" /> or fill it in <span className="h-px flex-1 bg-[#2C2530]" />
          </p>
        </>
      )}
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {trap}
        <Labelled id="acc-name" label="Full name">
          <input id="acc-name" className={field} autoComplete="name" value={a.name} onChange={(e) => setA({ ...a, name: e.target.value })} />
        </Labelled>
        <Labelled id="acc-email" label="Email" hint="Your QR and match time come here.">
          <input id="acc-email" type="email" className={field} autoComplete="email" inputMode="email" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} aria-describedby="acc-email-hint" />
        </Labelled>
        <Labelled id="acc-phone" label="WhatsApp number">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A49EA9]">+91</span>
            <input id="acc-phone" className={`${field} pl-12 tabular-nums`} inputMode="numeric" autoComplete="tel-national" maxLength={14} value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} />
          </div>
        </Labelled>
        {error && (
          <p role="alert" className="text-[14px] font-semibold text-[#FF9C93]">
            {error} {emailTaken && <Link className="underline" href={loginHref}>Log in</Link>}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="vx-corner flex h-[58px] w-full items-center justify-center gap-2 bg-[#D0463C] text-[18px] font-bold text-white transition-colors hover:bg-[#B93C33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Working" /> : <>Continue <ChevronRight className="h-5 w-5" aria-hidden /></>}
        </button>
        <p className="text-center text-[14px] text-[#A49EA9]">
          Have an account? <Link className="font-semibold text-[#E8675D] underline" href={loginHref}>Log in</Link>
        </p>
      </form>
    </div>
  );
}

'use client';

import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BottomSheet, Button, Input } from '@/components/ui';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { useBotGuard } from '@/components/auth/BotGuard';
import { useAuthStore } from '@/store/authStore';
import { getPublicEnv } from '@/lib/runtimeEnv';
import { trackAction } from '@/lib/api/analyticsEvents';
import { joinChallenge, type Challenge } from '@/lib/api/challenges';
import { recalledUtm } from '@/lib/challenge';

interface Props {
  challenge: Challenge;
  isOpen: boolean;
  onClose: () => void;
  onJoined: () => void;
}

/**
 * Sign-up over the challenge page: sign in first (Google, or email and
 * password for people inside Instagram's browser), then name, phone and the
 * tick boxes. Rules and 18+ are required; filming and updates are optional,
 * and updates starts unticked.
 */
export function ChallengeSignUpSheet({ challenge, isOpen, onClose, onJoined }: Props) {
  const router = useRouter();
  const { user, isAuthenticated } = useAuthStore();
  const { guardFields, trap } = useBotGuard();
  const hasGoogle = Boolean(getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID'));

  const [name, setName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [main, setMain] = useState('');
  const [rules, setRules] = useState(false);
  const [age, setAge] = useState(false);
  const [filming, setFilming] = useState(false);
  const [updates, setUpdates] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the account once they're signed in.
  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.fullName || '');
    setPhone((p) => p || (user.phoneNumber ?? '').replace(/^\+91/, ''));
  }, [user]);

  // Where the email pages send them back to: this page, form open, tags kept.
  const backHere = () => {
    const q = new URLSearchParams(window.location.search);
    q.set('join', '1');
    return encodeURIComponent(`${window.location.pathname}?${q.toString()}`);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!name.trim()) return setError('Tell us your name.');
    if (phone.replace(/\D/g, '').length < 10) return setError('Enter your 10-digit mobile number.');
    if (!rules) return setError('Tick the box to agree to the rules.');
    if (!age) return setError(`This challenge is ${challenge.minAge}+ only.`);
    setBusy(true);
    try {
      const res = await joinChallenge(challenge.slug, {
        name: name.trim(),
        displayName: displayName.trim() || undefined,
        phone,
        mainCharacter: main.trim() || undefined,
        consentRules: rules,
        consentAge: age,
        consentFilming: filming,
        consentUpdates: updates,
        ...recalledUtm(window.location.search),
        ...(await guardFields()),
      });
      trackAction('challenge_signup_completed', {
        challenge: challenge.slug,
        status: res.entry?.status,
        again: res.created === false,
      });
      onJoined();
    } catch (err) {
      setError((err as Error)?.message || 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const title = challenge.spotsLeft > 0 ? 'Sign up free' : 'Join the waitlist';

  if (!isAuthenticated) {
    return (
      <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
        <p className="-mt-1 text-caption text-text-secondary">
          Sign in first, so your spot and your check-in QR are saved on your KHELO account.
        </p>
        {error && (
          <p role="alert" className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-caption text-error">
            {error}
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {hasGoogle && isOpen && (
            <GoogleSignInButton
              onSuccess={() => trackAction('challenge_signin_done', { challenge: challenge.slug, method: 'google' })}
              onError={setError}
              inAppKeeps="The link opens on this same page."
            />
          )}
          <Button variant={hasGoogle ? 'secondary' : 'primary'} fullWidth onClick={() => router.push(`/login?redirect=${backHere()}`)}>
            Sign in with email
          </Button>
          <Button variant="ghost" fullWidth onClick={() => router.push(`/register?redirect=${backHere()}`)}>
            New to KHELO? Create an account
          </Button>
        </div>
        <p className="mt-3 text-center text-[11px] leading-snug text-text-secondary">
          By continuing you agree to our{' '}
          <Link href="/terms" target="_blank" className="font-semibold underline">Terms</Link> and{' '}
          <Link href="/privacy" target="_blank" className="font-semibold underline">Privacy Policy</Link>.
        </p>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={submit} noValidate className="relative flex flex-col gap-3">
        {trap}
        <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} required />
        <Input
          label="Mobile number"
          hint="We'll WhatsApp you about the challenge. Never shown publicly."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98765 43210"
          maxLength={14}
          required
        />
        <Input
          label="Gamer tag (optional)"
          hint="Shown on the bracket. Otherwise we show your first name and last initial."
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={40}
        />
        <Input label={`Who's your main? (optional)`} value={main} onChange={(e) => setMain(e.target.value)} maxLength={60} />

        <fieldset className="mt-1 flex flex-col gap-2.5">
          <legend className="sr-only">Agreements</legend>
          <Tick checked={rules} onChange={setRules}>
            I agree to the{' '}
            <Link href={`/challenge/${challenge.slug}/rules`} target="_blank" className="font-semibold underline">
              rules
            </Link>
            . <span className="text-text-secondary">(required)</span>
          </Tick>
          <Tick checked={age} onChange={setAge}>
            I&apos;m {challenge.minAge} or older. <span className="text-text-secondary">(required)</span>
          </Tick>
          <Tick checked={filming} onChange={setFilming}>
            It&apos;s OK to film me for KHELO videos. <span className="text-text-secondary">(optional)</span>
          </Tick>
          <Tick checked={updates} onChange={setUpdates}>
            Tell me about future challenges. <span className="text-text-secondary">(optional)</span>
          </Tick>
        </fieldset>

        {error && (
          <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-caption text-error">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" size="lg" fullWidth isLoading={busy} loadingText="Saving your spot…">
          {challenge.spotsLeft > 0 ? 'Get my spot' : 'Join the waitlist'}
        </Button>
        <p className="text-center text-[11px] text-text-secondary">Free. Nothing to pay.</p>
      </form>
    </BottomSheet>
  );
}

function Tick({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 text-caption leading-snug text-text-primary">
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

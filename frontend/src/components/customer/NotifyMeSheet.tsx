'use client';

import { useCallback, useState } from 'react';
import { CheckCircle2, MessageCircle, Phone, Mail, Share2, Gift } from 'lucide-react';
import { BottomSheet, Button } from '@/components/ui';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { getPublicEnv } from '@/lib/runtimeEnv';
import { setWaitlistPlayTime, setWaitlistDetails, type PlayTime, type ContactMethod } from '@/lib/api/waitlist';

const REACH_OPTIONS: { key: ContactMethod; label: string; icon: typeof Phone }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'call', label: 'Call', icon: Phone },
  { key: 'email', label: 'Email', icon: Mail },
];

const PLAY_TIMES: { key: PlayTime; label: string }[] = [
  { key: 'weekday_evenings', label: 'Weekday evenings' },
  { key: 'weekends', label: 'Weekends' },
  { key: 'late_nights', label: 'Late nights' },
];

export type NotifyStep = 'signin' | 'contact' | 'done';

interface NotifyMeSheetProps {
  isOpen: boolean;
  step: NotifyStep;
  onStepChange: (step: NotifyStep) => void;
  onClose: () => void;
  cafeId: string;
  cafeName: string;
  /** Joins the list (as whoever is signed in now, or with this contact). */
  onJoin: (contact?: string) => Promise<void>;
  onShare: () => void;
  shareCopied: boolean;
  /** Requests so far and the target, for the "N more to go" nudge. */
  count?: number;
  goal?: number;
}

/**
 * "Notify me" for a café that isn't taking bookings yet.
 *
 * Signed-out visitors get one-tap Google first: it signs them in and joins
 * in the same tap, and gives us a real inbox for the launch email. Typing a
 * phone or email stays available one tap away. Signed-in visitors skip
 * straight to the confirmation.
 */
export function NotifyMeSheet({
  isOpen,
  step,
  onStepChange,
  onClose,
  cafeId,
  cafeName,
  onJoin,
  onShare,
  shareCopied,
  count = 0,
  goal = 30,
}: NotifyMeSheetProps) {
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [playTime, setPlayTime] = useState<PlayTime | null>(null);
  const [gaveEmail, setGaveEmail] = useState(true);
  const [gavePhone, setGavePhone] = useState(false);
  const [reachOn, setReachOn] = useState<ContactMethod | null>(null);
  const [phone, setPhone] = useState('');
  const [phoneSaved, setPhoneSaved] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [knowsOwner, setKnowsOwner] = useState(false);
  const googleEnabled = Boolean(getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID'));
  const current = step === 'signin' && !googleEnabled ? 'contact' : step;

  const join = useCallback(
    async (value?: string) => {
      setIsJoining(true);
      setError(null);
      try {
        await onJoin(value);
        setGaveEmail(value === undefined || value.includes('@'));
        setGavePhone(value !== undefined && !value.includes('@'));
        onStepChange('done');
      } catch {
        setError("Couldn't add you just now. Please try again.");
      } finally {
        setIsJoining(false);
      }
    },
    [onJoin, onStepChange],
  );

  const handleGoogle = useCallback(() => {
    void join();
  }, [join]);

  const choosePlayTime = (key: PlayTime) => {
    setPlayTime(key);
    // Optional and fire-and-forget: a failed answer never blocks anything.
    setWaitlistPlayTime(cafeId, key).catch(() => {});
  };

  // Optional and fire-and-forget like the play-time answer, except the
  // number: that one says if it didn't save, since it's how we'd reach them.
  const chooseReach = (key: ContactMethod) => {
    setReachOn(key);
    setWaitlistDetails(cafeId, { contactMethod: key }).catch(() => {});
  };

  const toggleKnowsOwner = () => {
    const next = !knowsOwner;
    setKnowsOwner(next);
    setWaitlistDetails(cafeId, { knowsOwner: next }).catch(() => {});
  };

  const savePhone = async () => {
    setPhoneError(null);
    try {
      await setWaitlistDetails(cafeId, { phone: phone.trim() });
      setPhoneSaved(true);
    } catch {
      setPhoneError('Check the number and try again.');
    }
  };

  const needsPhone = (reachOn === 'whatsapp' || reachOn === 'call') && !gavePhone;
  const phoneLooksValid = phone.replace(/\D/g, '').length >= 10;
  const remaining = Math.max(0, goal - count);

  const trimmed = contact.trim();
  const looksValid = trimmed.includes('@') ? /^\S+@\S+\.\S+$/.test(trimmed) : trimmed.replace(/\D/g, '').length >= 10;

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      {current === 'signin' && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-h2 text-text-primary">Get notified when {cafeName} opens bookings</h2>
            <p className="text-body text-text-secondary">One email on the day it goes live. Nothing else.</p>
          </div>
          <GoogleSignInButton onSuccess={handleGoogle} onError={setError} />
          {isJoining && <p className="text-center text-caption text-text-secondary">Adding you to the list…</p>}
          {error && <p className="text-center text-caption text-error">{error}</p>}
          <button
            type="button"
            onClick={() => onStepChange('contact')}
            className="mx-auto min-h-[44px] text-caption font-semibold text-text-secondary underline-offset-2 hover:underline"
          >
            Use phone or email instead
          </button>
        </div>
      )}

      {current === 'contact' && (
        <form
          className="flex flex-col gap-3 pb-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (looksValid) void join(trimmed);
          }}
        >
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-h2 text-text-primary">Where should we tell you?</h2>
            <p className="text-body text-text-secondary">
              We&apos;ll let you know when {cafeName} starts taking bookings.
            </p>
          </div>
          <input
            type="text"
            inputMode="email"
            autoComplete="email"
            autoFocus
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="Email or phone number"
            aria-label="Email or phone number to notify you on"
            className="min-h-input w-full rounded-xl border border-border bg-card px-3 text-body text-text-primary placeholder:text-text-secondary/70 focus:border-primary focus:outline-none"
          />
          {error && <p className="text-caption text-error">{error}</p>}
          <Button type="submit" variant="primary" size="lg" fullWidth disabled={!looksValid} isLoading={isJoining}>
            Notify me
          </Button>
          {googleEnabled && (
            <button
              type="button"
              onClick={() => onStepChange('signin')}
              className="mx-auto min-h-[44px] text-caption font-semibold text-text-secondary hover:underline"
            >
              Use Google instead
            </button>
          )}
        </form>
      )}

      {current === 'done' && (
        <div className="flex flex-col gap-5 pb-2">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 flex-shrink-0 text-success" aria-hidden />
            <div className="flex flex-col gap-0.5">
              <h2 className="font-heading text-h2 text-text-primary">You&apos;re on the list</h2>
              <p className="text-body text-text-secondary">
                {gaveEmail
                  ? "We'll email you the day bookings open."
                  : "We'll reach out the day bookings open."}
              </p>
            </div>
          </div>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-caption font-semibold text-text-primary">
              How should we reach you? <span className="font-normal text-text-secondary">Optional</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {REACH_OPTIONS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={reachOn === key}
                  onClick={() => chooseReach(key)}
                  className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-caption font-semibold transition-colors ${
                    reachOn === key
                      ? 'border-secondary bg-secondary text-white'
                      : 'border-border bg-card text-text-primary hover:bg-surface'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
            {needsPhone && (
              phoneSaved ? (
                <p className="text-caption text-success">Got it — we&apos;ll {reachOn === 'call' ? 'call' : 'WhatsApp'} you.</p>
              ) : (
                <div className="flex flex-col gap-1">
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Your number"
                      aria-label="Phone number to reach you on"
                      className="min-h-input min-w-0 flex-1 rounded-xl border border-border bg-card px-3 text-body text-text-primary placeholder:text-text-secondary/70 focus:border-primary focus:outline-none"
                    />
                    <Button type="button" variant="secondary" size="md" disabled={!phoneLooksValid} onClick={() => void savePhone()}>
                      Save
                    </Button>
                  </div>
                  {phoneError && <p className="text-caption text-error">{phoneError}</p>}
                </div>
              )
            )}
          </fieldset>

          <label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card p-3">
            <input
              type="checkbox"
              checked={knowsOwner}
              onChange={toggleKnowsOwner}
              className="mt-0.5 h-4 w-4 flex-shrink-0 accent-[var(--primary)]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-caption font-semibold text-text-primary">I know the owner or staff at {cafeName}</span>
              <span className="text-caption text-text-secondary">Happy for KHEL-O to ask you for an intro.</span>
            </span>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-caption font-semibold text-text-primary">
              When would you usually play? <span className="font-normal text-text-secondary">Optional</span>
            </legend>
            <div className="flex flex-wrap gap-2">
              {PLAY_TIMES.map(({ key, label }) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={playTime === key}
                  onClick={() => choosePlayTime(key)}
                  className={`min-h-[40px] rounded-full border px-3.5 text-caption font-semibold transition-colors ${
                    playTime === key
                      ? 'border-secondary bg-secondary text-white'
                      : 'border-border bg-card text-text-primary hover:bg-surface'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <p className="flex items-start gap-2 rounded-xl bg-primary/[0.06] p-3 text-caption text-text-primary">
              <Gift className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" aria-hidden />
              <span>
                {remaining > 0 ? (
                  <>
                    <strong>{remaining} more request{remaining === 1 ? '' : 's'}</strong> to hit the goal. Hit it and we&apos;ll
                    push {cafeName} for an exclusive launch deal for everyone on the list.
                  </>
                ) : (
                  <>Goal reached! We&apos;re pushing {cafeName} for an exclusive launch deal for everyone on the list.</>
                )}
              </span>
            </p>
            <Button variant="primary" size="lg" fullWidth onClick={onShare}>
              <Share2 className="h-4 w-4" aria-hidden />
              {shareCopied ? 'Link copied' : 'Get friends to request it too'}
            </Button>
            <Button variant="ghost" size="lg" fullWidth onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

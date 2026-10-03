'use client';

import { useCallback, useState } from 'react';
import { BottomSheet, Button } from '@/components/ui';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { getPublicEnv } from '@/lib/runtimeEnv';
import { setWaitlistPlayTime, type PlayTime } from '@/lib/api/waitlist';

const PLAY_TIMES: { key: PlayTime; label: string }[] = [
  { key: 'weekday_evenings', label: 'Weekday evenings 🌆' },
  { key: 'weekends', label: 'Weekends 🎉' },
  { key: 'late_nights', label: 'Late nights 🦉' },
];

/** 'invite' is what a friend sees landing on a shared vote link. */
export type NotifyStep = 'invite' | 'signin' | 'contact' | 'done';

interface NotifyMeSheetProps {
  isOpen: boolean;
  step: NotifyStep;
  onStepChange: (step: NotifyStep) => void;
  onClose: () => void;
  cafeId: string;
  cafeName: string;
  isAuthenticated: boolean;
  /** Live vote count and goal, refetched after a vote lands. */
  votes: number;
  goal: number;
  /** Votes (as whoever is signed in now, or with this contact). */
  onJoin: (contact?: string) => Promise<void>;
  onShare: () => void;
  shareCopied: boolean;
  onKnowOwner: () => void;
}

const quietLink =
  'mx-auto flex min-h-[44px] items-center text-caption font-semibold text-text-secondary underline-offset-2 hover:underline';

/**
 * Voting for a café that isn't on KHEL-O yet (stored as the café's
 * "Notify me" waitlist — the count is what we pitch the owner with).
 *
 * The voice is deliberately playful and grateful: a vote costs the player
 * nothing and helps us, so we ask nicely and say thank you like we mean it.
 * Signed-out visitors get one-tap Google first (real inbox for the launch
 * email); phone or email stays one tap away.
 */
export function NotifyMeSheet({
  isOpen,
  step,
  onStepChange,
  onClose,
  cafeId,
  cafeName,
  isAuthenticated,
  votes,
  goal,
  onJoin,
  onShare,
  shareCopied,
  onKnowOwner,
}: NotifyMeSheetProps) {
  const [contact, setContact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [playTime, setPlayTime] = useState<PlayTime | null>(null);
  const [gaveEmail, setGaveEmail] = useState(true);
  const googleEnabled = Boolean(getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID'));
  const current = step === 'signin' && !googleEnabled ? 'contact' : step;
  const left = Math.max(goal - votes, 0);

  const join = useCallback(
    async (value?: string) => {
      setIsJoining(true);
      setError(null);
      try {
        await onJoin(value);
        setGaveEmail(value === undefined || value.includes('@'));
        onStepChange('done');
      } catch {
        setError("Oops, that vote didn't go through. Try once more? 🙏");
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

  const trimmed = contact.trim();
  const looksValid = trimmed.includes('@') ? /^\S+@\S+\.\S+$/.test(trimmed) : trimmed.replace(/\D/g, '').length >= 10;

  const signInOptions = (
    <>
      <GoogleSignInButton onSuccess={handleGoogle} onError={setError} />
      {isJoining && <p className="text-center text-caption text-text-secondary">Locking in your vote…</p>}
      {error && <p className="text-center text-caption text-error">{error}</p>}
      <button type="button" onClick={() => onStepChange('contact')} className={quietLink}>
        Use phone or email instead
      </button>
    </>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      {current === 'invite' && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-[44px] leading-none" aria-hidden>👀</span>
            <h2 className="font-heading text-h2 text-text-primary">Your friend wants {cafeName} on KHEL-O</h2>
            <p className="text-body text-text-secondary">
              Add your vote? It takes one tap and it genuinely helps 🥹
              {votes > 0 && ` ${votes} gamer${votes === 1 ? ' has' : 's have'} already voted.`}
            </p>
          </div>
          {isAuthenticated || !googleEnabled ? (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              isLoading={isJoining}
              onClick={() => (isAuthenticated ? void join() : onStepChange('contact'))}
            >
              Vote 🙏
            </Button>
          ) : (
            signInOptions
          )}
          {isAuthenticated && error && <p className="text-center text-caption text-error">{error}</p>}
          <button type="button" onClick={onClose} className={quietLink}>
            Maybe later
          </button>
        </div>
      )}

      {current === 'signin' && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-h2 text-text-primary">Pls pls pls vote for {cafeName} 🥺</h2>
            <p className="text-body text-text-secondary">
              Every vote is one more reason for the owner to say yes. We&apos;ll ping you once, the day it goes live. No
              spam, pinky promise 🤙
            </p>
          </div>
          {signInOptions}
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
            <h2 className="font-heading text-h2 text-text-primary">Where do we send the good news? 📬</h2>
            <p className="text-body text-text-secondary">
              One message the day {cafeName} starts taking bookings. That&apos;s it.
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
            Lock in my vote 🗳️
          </Button>
          {googleEnabled && (
            <button type="button" onClick={() => onStepChange('signin')} className={quietLink}>
              Use Google instead
            </button>
          )}
        </form>
      )}

      {current === 'done' && (
        <div className="flex flex-col gap-5 pb-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="khelo-heart-pop text-[48px] leading-none" aria-hidden>
              🫶
            </span>
            <h2 className="font-heading text-h2 text-text-primary">You&apos;re a legend</h2>
            <p className="max-w-sm text-body text-text-secondary">
              {votes > 0 ? `Vote #${votes} locked in. ` : 'Vote locked in. '}
              {left > 0
                ? `${left} more and we go pitch ${cafeName} in person 🚪`
                : `Goal smashed 🎉 we're talking to ${cafeName} now.`}{' '}
              {gaveEmail ? "We'll email you the day it's live." : "We'll message you the day it's live."}
            </p>
          </div>

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
            <Button variant="primary" size="lg" fullWidth onClick={onShare}>
              {shareCopied ? 'Link copied ✓' : 'Rally the squad 📣'}
            </Button>
            <p className="-mt-0.5 text-center text-caption text-text-secondary">
              Every friend who votes gets {cafeName} closer. Thank you, seriously 🙏
            </p>
            <button type="button" onClick={onKnowOwner} className={quietLink}>
              Know the owner? Introduce us 👀
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}

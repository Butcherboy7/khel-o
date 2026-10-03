'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BottomSheet, Button } from '@/components/ui';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { HelperEmblem, HELPER_BADGE_COPY, isHelperBadgeKey } from '@/components/customer/HelperEmblem';
import { getPublicEnv } from '@/lib/runtimeEnv';
import { setWaitlistPlayTime, type PlayTime, type UnlockedBadge } from '@/lib/api/waitlist';

const PLAY_TIMES: { key: PlayTime; label: string }[] = [
  { key: 'weekday_evenings', label: 'Weekday evenings' },
  { key: 'weekends', label: 'Weekends' },
  { key: 'late_nights', label: 'Late nights' },
];

/** 'invite' is what a friend sees landing on a shared vote link. */
export type NotifyStep = 'invite' | 'signin' | 'done';

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
  /** The badge this vote just earned, if it was the first. */
  unlocked: UnlockedBadge | null;
  /** Casts the vote for whoever is signed in now. */
  onJoin: () => Promise<void>;
  onShare: () => void;
  shareCopied: boolean;
  onKnowOwner: () => void;
}

const quietLink =
  'mx-auto flex min-h-[44px] items-center text-caption font-semibold text-text-secondary underline-offset-2 hover:underline';

/**
 * Voting for a café that isn't on KHEL-O yet (stored as the café's waitlist:
 * the count is what we pitch the owner with).
 *
 * Sign-in is required, because a vote earns a badge and XP and the count has
 * to be real people. One-tap Google signs in and votes in the same tap; email
 * sign-in sends them to the login page and back.
 *
 * The voice is deliberately playful and grateful: a vote costs the player
 * nothing and helps us, so we ask nicely and say thank you like we mean it.
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
  unlocked,
  onJoin,
  onShare,
  shareCopied,
  onKnowOwner,
}: NotifyMeSheetProps) {
  const pathname = usePathname();
  const [error, setError] = useState<string | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [playTime, setPlayTime] = useState<PlayTime | null>(null);
  const googleEnabled = Boolean(getPublicEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID'));
  const left = Math.max(goal - votes, 0);

  const join = useCallback(async () => {
    setIsJoining(true);
    setError(null);
    try {
      await onJoin();
      onStepChange('done');
    } catch {
      setError("Oops, that vote didn't go through. Try once more?");
    } finally {
      setIsJoining(false);
    }
  }, [onJoin, onStepChange]);

  const choosePlayTime = (key: PlayTime) => {
    setPlayTime(key);
    // Optional and fire-and-forget: a failed answer never blocks anything.
    setWaitlistPlayTime(cafeId, key).catch(() => {});
  };

  const loginHref = `/login?redirect=${encodeURIComponent(pathname || '/')}`;

  const signInOptions = (
    <>
      {googleEnabled && <GoogleSignInButton onSuccess={() => void join()} onError={setError} />}
      {isJoining && <p className="text-center text-caption text-text-secondary">Locking in your vote…</p>}
      {error && <p className="text-center text-caption text-error">{error}</p>}
      <Link href={loginHref} className={quietLink}>
        {googleEnabled ? 'Sign in with email instead' : 'Sign in to vote'}
      </Link>
    </>
  );

  const reward = (
    <div className="flex items-center gap-3 rounded-2xl bg-surface px-3.5 py-2.5">
      <HelperEmblem badge="day_one" size={36} />
      <span className="flex min-w-0 flex-col">
        <span className="text-caption font-semibold text-text-primary">Vote and unlock the Early Voter badge</span>
        <span className="text-[11px] text-text-secondary">Shows on your profile · +{HELPER_BADGE_COPY.day_one.xp} XP</span>
      </span>
    </div>
  );

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose}>
      {step === 'invite' && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="text-[44px] leading-none" aria-hidden>👀</span>
            <h2 className="font-heading text-h2 text-text-primary">Your friend wants {cafeName} on KHEL-O</h2>
            <p className="text-body text-text-secondary">
              Add your vote? It takes one tap and it genuinely helps.
              {votes > 0 && ` ${votes} gamer${votes === 1 ? ' has' : 's have'} already voted.`}
            </p>
          </div>
          {reward}
          {isAuthenticated ? (
            <Button variant="primary" size="lg" fullWidth isLoading={isJoining} onClick={() => void join()}>
              Vote
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

      {step === 'signin' && (
        <div className="flex flex-col gap-4 pb-2">
          <div className="flex flex-col gap-1">
            <h2 className="font-heading text-h2 text-text-primary">Vote for {cafeName}</h2>
            <p className="text-body text-text-secondary">
              Every vote is one more reason for the owner to say yes, and your aura goes up. We&apos;ll ping you once,
              the day it goes live. No spam, pinky promise.
            </p>
          </div>
          {reward}
          {signInOptions}
        </div>
      )}

      {step === 'done' && (
        <div className="flex flex-col gap-5 pb-2">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="khelo-heart-pop text-[48px] leading-none" aria-hidden>
              🫶
            </span>
            <h2 className="font-heading text-h2 text-text-primary">You&apos;re a legend</h2>
            <p className="max-w-sm text-body text-text-secondary">
              {votes > 0 ? `Vote #${votes} locked in. ` : 'Vote locked in. '}
              {left > 0
                ? `${left} more and we go knock on their door 🚪`
                : `Goal smashed, we're talking to ${cafeName} now.`}{' '}
              We&apos;ll email you the day it&apos;s live. Your aura just went up 🫶
            </p>
          </div>

          {unlocked && isHelperBadgeKey(unlocked.key) && (
            <div className="flex items-center gap-4 rounded-2xl bg-surface p-4">
              <HelperEmblem badge={unlocked.key} size={64} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-heading text-h3 font-bold text-text-primary">{unlocked.title} unlocked</span>
                <span className="text-caption text-text-secondary">It&apos;s on your profile now. Go flex it.</span>
              </span>
              <span className="flex-shrink-0 rounded-full bg-secondary px-3 py-1.5 font-data text-caption font-bold text-white">
                +{unlocked.xp} XP
              </span>
            </div>
          )}

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
              {shareCopied ? 'Link copied ✓' : 'Rally the squad'}
            </Button>
            <p className="-mt-0.5 text-center text-caption text-text-secondary">
              Every friend who votes gets {cafeName} closer. Thank you, seriously.
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

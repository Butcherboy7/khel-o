'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QrCode, Swords } from 'lucide-react';
import { getMyChallenges, type MyChallengeSummary } from '@/lib/api/challenges';
import { challengeDay, challengeTime } from '@/lib/challenge';
import { FEATURED_CHALLENGE_SLUG } from '@/lib/challenge';
import { markChallengeSeen, useChallengeToNudge } from '@/lib/challengeNudge';
import { useAuthStore } from '@/store/authStore';
import { ChallengeTeaser } from '@/components/customer/ChallengeTeaser';
import { CommunityInviteCard } from '@/components/customer/CommunityInvite';
import { Card, CardContent, ErrorState, SkeletonCard } from '@/components/ui';

/** The plain-words state of one sign-up. */
function stateOf(c: MyChallengeSummary): { text: string; tone: string } {
  if (c.entryStatus === 'withdrawn') return { text: 'You dropped out', tone: 'text-text-secondary' };
  if (c.entryStatus === 'no_show') return { text: 'Marked as not there', tone: 'text-text-secondary' };
  if (c.status === 'cancelled') return { text: 'Called off', tone: 'text-text-secondary' };
  if (c.status === 'finished') {
    return { text: c.place ? `Finished ${c.place === 1 ? '1st' : c.place === 2 ? '2nd' : c.place === 3 ? '3rd' : `${c.place}th`}` : 'Finished', tone: 'text-text-primary' };
  }
  if (c.entryStatus === 'waitlist') return { text: `Waitlist #${c.rank}`, tone: 'text-warning' };
  if (c.coming === 'yes') return { text: `Confirmed #${c.rank} · you said you're coming`, tone: 'text-success' };
  return { text: `Confirmed #${c.rank} · tell us if you're coming`, tone: 'text-success' };
}

function Row({ c }: { c: MyChallengeSummary }) {
  const state = stateOf(c);
  const live = c.upcoming && (c.entryStatus === 'confirmed' || c.entryStatus === 'waitlist') && c.status !== 'cancelled';
  return (
    <Card elevation="resting">
      <CardContent className="flex items-center gap-3 p-3.5">
        <Link href={`/challenge/${c.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Swords className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-heading text-body-emphasis font-bold text-text-primary">{c.title}</span>
            <span className="block truncate text-caption text-text-secondary">
              {c.status === 'live' ? 'On now' : `${challengeDay(c.startsAt)}, ${challengeTime(c.startsAt)}`} · {c.cafeName}
            </span>
            <span className={`block truncate text-caption font-semibold ${state.tone}`}>{state.text}</span>
          </span>
        </Link>
        {live && (
          <Link
            href={`/challenge/${c.slug}/me`}
            className="inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl bg-primary px-3 text-caption font-semibold text-white hover:opacity-90"
          >
            <QrCode className="h-4 w-4" aria-hidden /> My QR
          </Link>
        )}
      </CardContent>
    </Card>
  );
}

/** Open to everyone: your own sign-ups (when signed in), the challenge you
 *  could still join, and the WhatsApp Community where new ones drop first. */
export default function MyChallengesPage() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['challenges', 'mine', 'all'],
    queryFn: getMyChallenges,
    staleTime: 0,
    enabled: isAuthenticated,
  });
  const openToJoin = useChallengeToNudge();
  useEffect(() => markChallengeSeen(FEATURED_CHALLENGE_SLUG), []);

  const coming = (data ?? []).filter((c) => c.upcoming);
  const past = (data ?? []).filter((c) => !c.upcoming);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="font-heading text-h1 font-bold text-text-primary">My challenges</h1>

      {isAuthenticated && isLoading && <SkeletonCard />}
      {isError && <ErrorState title="Couldn’t load your challenges" message={(error as Error)?.message ?? 'Try again.'} onRetry={() => refetch()} />}

      {(!isAuthenticated || (data && data.length === 0)) && (
        <Card elevation="resting">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary">
              <Swords className="h-5 w-5" aria-hidden />
            </span>
            <span>
              <span className="block font-heading text-body-emphasis font-bold text-text-primary">
                You&apos;re not signed up for any challenge yet
              </span>
              <span className="block text-caption text-text-secondary">
                {openToJoin ? 'There’s one open right now. Have a look 👇' : 'When you sign up for one, your spot and check-in QR show here.'}
                {!isAuthenticated && (
                  <>
                    {' '}Already signed up?{' '}
                    <Link href="/login?redirect=/my-challenges" className="font-semibold text-primary underline">Log in</Link>
                  </>
                )}
              </span>
            </span>
          </CardContent>
        </Card>
      )}

      {coming.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Coming up">
          <h2 className="font-heading text-h3 font-semibold text-text-primary">Coming up</h2>
          {coming.map((c) => <Row key={c.slug} c={c} />)}
        </section>
      )}
      {openToJoin && (
        <section className="flex flex-col gap-2" aria-label="Open challenges">
          <h2 className="font-heading text-h3 font-semibold text-text-primary">Open now</h2>
          <ChallengeTeaser where="my_challenges" className="w-full" />
        </section>
      )}

      <section className="flex flex-col gap-2" aria-label="WhatsApp Community">
        {!openToJoin && <h2 className="font-heading text-h3 font-semibold text-text-primary">Next challenge</h2>}
        <CommunityInviteCard where="my_challenges" />
      </section>

      {past.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Past">
          <h2 className="font-heading text-h3 font-semibold text-text-primary">Past</h2>
          {past.map((c) => <Row key={c.slug} c={c} />)}
        </section>
      )}
    </div>
  );
}

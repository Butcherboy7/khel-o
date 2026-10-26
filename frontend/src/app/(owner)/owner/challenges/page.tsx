'use client';

import { useQuery } from '@tanstack/react-query';
import { CalendarDays, CheckCircle2, ExternalLink, Gift, ListChecks, MonitorPlay, Swords, Users } from 'lucide-react';
import { Card, CardContent, EmptyState, SkeletonCard } from '@/components/ui';
import { OwnerPageHeader } from '@/components/owner/OwnerPageHeader';
import { OwnerLoadError } from '@/components/owner/OwnerLoadError';
import { SimpleMarkdown } from '@/components/challenge/SimpleMarkdown';
import { getHostingChallenges, type HostedChallenge } from '@/lib/api/challenges';
import { challengeDay, challengeTime, challengeTimeRange, isUpcoming } from '@/lib/challenge';

/** What the café has to do on the day, from the challenge's own details. */
function checklist(ch: HostedChallenge): string[] {
  const setup = ch.setupLine || 'the setup used for the challenge';
  return [
    `Keep ${setup.charAt(0).toLowerCase()}${setup.slice(1)} off KHEL-O bookings from ${challengeTimeRange(ch.startsAt, ch.endsAt)}. Everything else runs as normal.`,
    `Check-in is ${challengeTime(ch.checkinOpensAt)} to ${challengeTime(ch.checkinClosesAt)}. KHEL-O checks players in at the door.`,
    ...(ch.visitorOffer ? [`Tell your staff: ${ch.visitorOffer}.`] : []),
    'Anyone can come and watch. No sign-up needed to watch.',
    'Open the live bracket on your laptop once the draw is made. It updates by itself.',
    "Winners' rewards come in as normal KHEL-O bookings with the discount already applied.",
  ];
}

function Players({ ch }: { ch: HostedChallenge }) {
  const confirmed = ch.players.filter((p) => p.status === 'confirmed');
  const waitlist = ch.players.filter((p) => p.status === 'waitlist');
  if (!ch.players.length) return <p className="text-caption text-text-secondary">No sign-ups yet.</p>;
  return (
    <div className="flex flex-col gap-3">
      {[['Playing', confirmed], ['Waitlist', waitlist]].map(([label, list]) =>
        (list as HostedChallenge['players']).length ? (
          <div key={label as string}>
            <p className="text-overline font-semibold uppercase tracking-wide text-text-secondary">{label as string}</p>
            <ul className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {(list as HostedChallenge['players']).map((p) => (
                <li key={`${p.status}-${p.rank}`} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2 text-body">
                  <span className="truncate">
                    <span className="mr-2 text-caption text-text-secondary">#{p.rank}</span>
                    {p.name}
                  </span>
                  {p.present && (
                    <span className="flex items-center gap-1 text-caption font-semibold text-success">
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Here
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null,
      )}
    </div>
  );
}

function ChallengeCard({ ch }: { ch: HostedChallenge }) {
  const upcoming = isUpcoming(ch);
  return (
    <Card elevation="resting">
      <CardContent className="flex flex-col gap-5 p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Swords className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-overline font-semibold uppercase tracking-wide text-primary">
              {ch.status === 'live' ? 'On now' : upcoming ? 'Coming up' : ch.status === 'cancelled' ? 'Called off' : 'Finished'} · {ch.game}
            </p>
            <h2 className="font-heading text-h2 font-bold text-text-primary">{ch.title}</h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-body text-text-secondary">
              <CalendarDays className="h-4 w-4" aria-hidden />
              {challengeDay(ch.startsAt)}, {challengeTimeRange(ch.startsAt, ch.endsAt)}
            </p>
            {ch.setupLine && (
              <p className="mt-0.5 flex items-center gap-1.5 text-body text-text-secondary">
                <MonitorPlay className="h-4 w-4" aria-hidden /> {ch.setupLine}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Playing', `${ch.confirmed}/${ch.capacity}`],
            ['Spots left', String(ch.spotsLeft)],
            ['Waitlist', String(ch.waitlist)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl bg-surface px-2 py-3">
              <p className="font-heading text-h2 font-bold text-text-primary">{value}</p>
              <p className="text-caption text-text-secondary">{label}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <a
            href={`/challenge/${ch.slug}/bracket`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-body font-semibold text-white hover:bg-primary-dark"
          >
            <MonitorPlay className="h-4 w-4" aria-hidden /> Open live bracket
          </a>
          <a
            href={`/challenge/${ch.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-border px-4 text-body font-semibold text-text-primary hover:bg-surface"
          >
            <ExternalLink className="h-4 w-4" aria-hidden /> See the public page
          </a>
        </div>

        {upcoming && (
          <section>
            <h3 className="flex items-center gap-2 font-heading text-h3 font-semibold text-text-primary">
              <ListChecks className="h-4 w-4 text-primary" aria-hidden /> For the day
            </h3>
            <ul className="mt-2 flex flex-col gap-1.5">
              {checklist(ch).map((line) => (
                <li key={line} className="flex gap-2 text-body text-text-primary">
                  <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary" aria-hidden />
                  {line}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="flex items-center gap-2 font-heading text-h3 font-semibold text-text-primary">
            <Gift className="h-4 w-4 text-primary" aria-hidden /> What your café has promised
          </h3>
          {ch.visitorOffer && <p className="mt-2 text-body text-text-primary">Everyone who comes: {ch.visitorOffer}.</p>}
          {ch.prizesMd && <SimpleMarkdown text={ch.prizesMd} className="mt-2 text-body text-text-primary" />}
        </section>

        <section>
          <h3 className="flex items-center gap-2 font-heading text-h3 font-semibold text-text-primary">
            <Users className="h-4 w-4 text-primary" aria-hidden /> Who&apos;s signed up
          </h3>
          <p className="mb-2 text-caption text-text-secondary">Names as shown on the bracket. KHEL-O has their contact details.</p>
          <Players ch={ch} />
        </section>
      </CardContent>
    </Card>
  );
}

/** Read-only: the challenge at this owner's café. KHEL-O runs sign-ups, check-in and results. */
export default function OwnerChallengesPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['owner', 'hosting-challenges'],
    queryFn: getHostingChallenges,
    refetchInterval: 30_000,
  });
  const list = data ?? [];
  const upcoming = list.filter(isUpcoming).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = list.filter((c) => !isUpcoming(c));

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <OwnerPageHeader
        title="Challenges"
        description="KHEL-O challenges at your café: who's playing, what to get ready, and what you've promised. KHEL-O runs sign-ups, check-in and results."
      />
      {isLoading && <SkeletonCard />}
      {isError && <OwnerLoadError error={error} title="Couldn’t load your challenges" onRetry={() => refetch()} />}
      {data && list.length === 0 && (
        <EmptyState icon={<Swords className="h-8 w-8" />} title="No challenges at your café yet" description="When KHEL-O sets one up with you, it shows here." />
      )}
      {upcoming.map((ch) => <ChallengeCard key={ch.slug} ch={ch} />)}
      {past.length > 0 && (
        <>
          <h2 className="font-heading text-h3 font-semibold text-text-primary">Past</h2>
          {past.map((ch) => <ChallengeCard key={ch.slug} ch={ch} />)}
        </>
      )}
    </div>
  );
}

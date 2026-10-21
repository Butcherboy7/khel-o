'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trophy } from 'lucide-react';
import { adminListChallenges } from '@/lib/api/challenges';
import { challengeDay, challengeTimeRange } from '@/lib/challenge';
import { Card, CardContent, EmptyState, ErrorState, PageSpinner } from '@/components/ui';

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-surface text-text-secondary',
  open: 'bg-success/15 text-success',
  closed: 'bg-warning/15 text-warning',
  live: 'bg-primary/15 text-primary',
  finished: 'bg-surface text-text-secondary',
};

export default function AdminChallengesPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin', 'challenges'],
    queryFn: adminListChallenges,
    staleTime: 15_000,
  });

  if (isLoading) return <PageSpinner label="Loading challenges" />;
  if (isError || !data) return <ErrorState message={(error as Error)?.message} onRetry={() => refetch()} />;

  return (
    <div className="flex flex-col gap-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-h1 text-text-primary">
            <Trophy className="h-6 w-6 text-primary" /> Challenges
          </h1>
          <p className="mt-0.5 text-body text-text-secondary">Free in-person challenges at partner cafés: sign-ups, waitlist and who&apos;s coming.</p>
        </div>
        <Link
          href="/admin/challenges/new"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-caption font-semibold text-white hover:bg-primary-dark"
        >
          <Plus className="h-4 w-4" /> New challenge
        </Link>
      </div>

      {data.length === 0 ? (
        <EmptyState title="No challenges yet" description="Create one; it stays a draft (invisible) until you open it." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((c) => (
            <Link key={c.id} href={`/admin/challenges/${c.id}`}>
              <Card className="transition-colors hover:border-text-secondary">
                <CardContent className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-heading text-h2 text-text-primary">{c.title}</p>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[c.status]}`}>{c.status}</span>
                  </div>
                  <p className="text-caption text-text-secondary">
                    {c.cafe.name} · {challengeDay(c.startsAt)}, {challengeTimeRange(c.startsAt, c.endsAt)}
                  </p>
                  <p className="text-body text-text-primary">
                    <span className="font-semibold tabular-nums">{c.confirmed}/{c.capacity}</span> confirmed ·{' '}
                    <span className="font-semibold tabular-nums">{c.waitlist}</span> waitlist
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Swords } from 'lucide-react';
import { listMyTournaments } from '@/lib/api/tournaments';
import { fmtWhen } from '@/lib/tournament';

/** Upcoming tournament entries, shown above booking passes. Nothing when there are none. */
export function MyTournamentPasses() {
  const { data } = useQuery({ queryKey: ['my-tournaments'], queryFn: listMyTournaments });
  const upcoming = (data ?? []).filter((x) => ['published', 'live'].includes(x.tournament.status));
  if (!upcoming.length) return null;
  return (
    <section aria-label="Tournament passes" className="flex flex-col gap-2">
      {upcoming.map(({ tournament: t, entry }) => (
        <Link
          key={entry.id}
          href={`/tournaments/${t.slug}/pass`}
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 transition hover:border-primary"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: t.game.colour }}>
            <Swords className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-semibold text-text-primary">{t.title}</span>
            <span className="text-caption text-text-secondary">
              {t.status === 'live' ? 'Live now' : fmtWhen(t.startsAt)} · {t.cafe?.name}
            </span>
          </span>
          <span className="shrink-0 text-caption font-bold text-primary">
            {entry.status === 'waitlist' ? 'Waitlist' : entry.status === 'held' ? 'Pay now' : 'Tournament pass'}
          </span>
        </Link>
      ))}
    </section>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Crown, Medal, Swords, Ticket } from 'lucide-react';
import { getHostMe, getLeaderboard, listGames, listMyTournaments, listTournaments } from '@/lib/api/tournaments';
import { TournamentCard } from '@/components/tournaments/TournamentCard';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { fmtWhen } from '@/lib/tournament';
import { cn } from '@/lib/cn';

export default function TournamentsPage() {
  const [game, setGame] = useState<string>('');
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const games = useQuery({ queryKey: ['tournament-games'], queryFn: listGames, staleTime: 3600_000 });
  const upcoming = useQuery({ queryKey: ['tournaments', { game }], queryFn: () => listTournaments({ game: game || undefined }) });
  const past = useQuery({ queryKey: ['tournaments', 'past'], queryFn: () => listTournaments({ past: true }) });
  const board = useQuery({ queryKey: ['tournament-leaderboard'], queryFn: () => getLeaderboard() });
  const mine = useQuery({ queryKey: ['my-tournaments'], queryFn: listMyTournaments, enabled: isAuthenticated });
  const activeRole = useAuthStore((s) => s.activeRole);
  // Company organisers have no portal of their own; their console lives at /host.
  const host = useQuery({ queryKey: ['host-me'], queryFn: getHostMe, enabled: isAuthenticated && activeRole === 'gamer', staleTime: 300_000 });
  const hostsCompany = host.data?.organisers.some((o) => o.kind === 'company');

  const myUpcoming = (mine.data ?? []).filter((x) => ['published', 'live'].includes(x.tournament.status));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 pb-16">
      <header className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1.5 text-overline uppercase text-primary">
          <Swords className="h-3.5 w-3.5" aria-hidden /> Compete
        </span>
        <h1 className="font-heading text-display text-text-primary">Tournaments</h1>
        <p className="max-w-xl text-body text-text-secondary">
          Knockout nights at cafés near you. Register in a minute, check in at the counter, and play for real prizes.
        </p>
        {hostsCompany && (
          <Link href="/host" className="mt-2 w-fit rounded-xl border border-border bg-card px-4 py-2 text-caption font-bold text-text-primary hover:border-primary">
            Open host console →
          </Link>
        )}
      </header>

      {myUpcoming.length > 0 && (
        <section aria-labelledby="my-t" className="flex flex-col gap-3">
          <h2 id="my-t" className="font-heading text-h2 text-text-primary">Your passes</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {myUpcoming.map(({ tournament: t, entry }) => (
              <Link
                key={entry.id}
                href={`/tournaments/${t.slug}/pass`}
                className="flex min-w-[16rem] items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-3 transition hover:border-primary"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
                  <Ticket className="h-5 w-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-semibold text-text-primary">{t.title}</span>
                  <span className="text-caption text-text-secondary">
                    {entry.status === 'waitlist' ? 'Waitlist' : entry.status === 'held' ? 'Finish payment' : fmtWhen(t.startsAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="up-t" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="up-t" className="font-heading text-h2 text-text-primary">Coming up</h2>
          <div className="flex max-w-full gap-2 overflow-x-auto scrollbar-hide" role="group" aria-label="Filter by game">
            {[{ key: '', short: 'All games' }, ...(games.data?.games ?? []).filter((g) => g.key !== 'custom')].map((g) => (
              <button
                key={g.key || 'all'}
                type="button"
                onClick={() => setGame(g.key)}
                aria-pressed={game === g.key}
                className={cn(
                  'shrink-0 rounded-full px-3.5 py-1.5 text-caption font-bold transition active:scale-95',
                  game === g.key ? 'bg-text-primary text-card' : 'border border-border bg-card text-text-secondary hover:text-text-primary',
                )}
              >
                {g.short}
              </button>
            ))}
          </div>
        </div>
        {upcoming.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-2xl" />)}
          </div>
        ) : upcoming.isError ? (
          <ErrorState title="Couldn't load tournaments" onRetry={() => upcoming.refetch()} />
        ) : upcoming.data && upcoming.data.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.data.map((t) => <TournamentCard key={t.id} t={t} />)}
          </div>
        ) : (
          <EmptyState
            icon={<Swords className="h-8 w-8" aria-hidden />}
            title={game ? 'Nothing for this game yet' : 'No tournaments announced yet'}
            description="New nights are added every week. Turn on notifications and we'll tell you when one opens near you."
          />
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-labelledby="past-t" className="flex flex-col gap-3">
          <h2 id="past-t" className="font-heading text-h2 text-text-primary">Recent results</h2>
          {past.data && past.data.length ? (
            <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
              {past.data.slice(0, 8).map((t) => (
                <li key={t.id}>
                  <Link href={`/tournaments/${t.slug}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface">
                    <span className="h-9 w-1.5 shrink-0 rounded-full" style={{ background: t.game.colour }} aria-hidden />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-semibold text-text-primary">{t.title}</span>
                      <span className="text-caption text-text-secondary">{t.cafe?.name} · {fmtWhen(t.startsAt)}</span>
                    </span>
                    <span className="text-caption font-bold text-primary">Results</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-body text-text-secondary">
              Results from finished tournaments show up here.
            </p>
          )}
        </section>

        <section aria-labelledby="lb-t" className="flex flex-col gap-3">
          <h2 id="lb-t" className="font-heading text-h2 text-text-primary">Leaderboard</h2>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            {board.data && board.data.length ? (
              <ol>
                {board.data.slice(0, 10).map((r) => (
                  <li key={r.userId} className="flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0">
                    <span
                      className={cn(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-data text-caption font-bold',
                        r.rank === 1 ? 'bg-amber-400 text-[#0b0b12]' : r.rank <= 3 ? 'bg-surface text-text-primary' : 'text-text-secondary',
                      )}
                    >
                      {r.rank === 1 ? <Crown className="h-3.5 w-3.5" aria-label="1st" /> : r.rank}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-text-primary">{r.name}</span>
                    {r.wins > 0 && (
                      <span className="inline-flex items-center gap-0.5 text-caption text-text-secondary" title={`${r.wins} wins`}>
                        <Medal className="h-3.5 w-3.5" aria-hidden /> {r.wins}
                      </span>
                    )}
                    <span className="w-12 text-right font-data text-body font-bold text-text-primary">{r.points}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="p-6 text-center text-body text-text-secondary">Play a tournament to get on the board.</p>
            )}
            <p className="border-t border-border bg-surface px-4 py-2.5 text-caption text-text-secondary">
              Points: win 100 · final 70 · semi 45 · quarter 25 · played 10
            </p>
          </div>
        </section>
      </div>

      <aside className="flex flex-col items-start gap-3 rounded-2xl bg-text-primary p-6 text-card sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="font-heading text-h2">Run a café or a brand?</h2>
          <p className="text-body opacity-80">Host a tournament on KHEL-O: registration, payments, check-in and a live bracket in one place.</p>
        </div>
        <Link href="/partner" className="shrink-0 rounded-xl bg-card px-5 py-3 font-semibold text-text-primary transition hover:opacity-90">
          Host a tournament
        </Link>
      </aside>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Plus, Radio, Swords, Users } from 'lucide-react';
import { getHostMe, listHostTournaments, type HostListItem } from '@/lib/api/tournaments';
import { Button, ErrorState, Skeleton } from '@/components/ui';
import { PHASE, fmtWhen, rupees } from '@/lib/tournament';
import { cn } from '@/lib/cn';

function Row({ t, base }: { t: HostListItem; base: string }) {
  const phase = t.status === 'draft' ? PHASE.draft : PHASE[t.phase];
  return (
    <li>
      <Link href={`${base}/${t.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition hover:bg-surface">
        <span className="h-10 w-1.5 shrink-0 rounded-full" style={{ background: t.game.colour }} aria-hidden />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold text-text-primary">{t.title}</span>
          <span className="text-caption text-text-secondary">
            {t.game.short} · {fmtWhen(t.startsAt)} · {t.cafe?.name}
          </span>
        </span>
        <span className="flex items-center gap-4 text-caption">
          <span className="inline-flex items-center gap-1 font-data text-text-primary" title="Registered">
            <Users className="h-3.5 w-3.5 text-text-secondary" aria-hidden /> {t.taken}/{t.maxTeams}
          </span>
          {t.entryFee > 0 && <span className="w-16 text-right font-data text-text-primary">{rupees(t.collected)}</span>}
          <span className={cn('rounded-full px-2 py-0.5 font-bold', phase.tone)}>{phase.label}</span>
        </span>
      </Link>
    </li>
  );
}

export function HostHome({ base, title = 'Tournaments' }: { base: string; title?: string }) {
  const me = useQuery({ queryKey: ['host-me'], queryFn: getHostMe });
  const list = useQuery({ queryKey: ['host-tournaments'], queryFn: listHostTournaments });

  if (me.isLoading || list.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (me.isError || list.isError) return <ErrorState onRetry={() => { void me.refetch(); void list.refetch(); }} />;

  const items = list.data ?? [];
  const groups: { key: string; label: string; icon: typeof Radio; rows: HostListItem[] }[] = [
    { key: 'live', label: 'Live now', icon: Radio, rows: items.filter((t) => t.status === 'live') },
    { key: 'up', label: 'Upcoming', icon: CalendarClock, rows: items.filter((t) => t.status === 'published').reverse() },
    { key: 'draft', label: 'Drafts', icon: Swords, rows: items.filter((t) => t.status === 'draft') },
    { key: 'past', label: 'Past', icon: Swords, rows: items.filter((t) => ['completed', 'cancelled'].includes(t.status)) },
  ];
  const canHost = (me.data?.organisers.length ?? 0) > 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-h1 text-text-primary">{title}</h1>
          <p className="max-w-xl text-body text-text-secondary">
            Create a knockout night, share the link, check players in at the counter and run the bracket from here.
          </p>
        </div>
        {canHost && (
          <Link href={`${base}/new`}>
            <Button>
              <Plus className="mr-1.5 h-4 w-4" aria-hidden /> New tournament
            </Button>
          </Link>
        )}
      </div>

      {!canHost ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-body text-text-secondary">
          Your account isn&apos;t set up to host tournaments yet. Ask KHEL-O to add you to an organiser.
        </p>
      ) : items.length === 0 ? (
        <div className="grid gap-4 rounded-2xl border border-border bg-card p-6 md:grid-cols-[1fr_1fr]">
          <div className="flex flex-col gap-2">
            <h2 className="font-heading text-h2 text-text-primary">Your first tournament night</h2>
            <p className="text-body text-text-secondary">
              Tournaments bring in groups who stay, order food and come back. You set the game, the number of players and how many
              stations to use; KHEL-O holds those stations off normal bookings for the evening.
            </p>
            <Link href={`${base}/new`} className="mt-2 w-fit">
              <Button>Create a tournament</Button>
            </Link>
          </div>
          <div className="rounded-xl bg-surface p-4 text-caption text-text-secondary">
            <p className="mb-2 font-semibold text-text-primary">How many players fit?</p>
            <ul className="flex flex-col gap-1.5">
              <li><strong className="text-text-primary">4 consoles, FC (15 min matches):</strong> 32 players in about 3 hours</li>
              <li><strong className="text-text-primary">2 consoles:</strong> 16 players in under 3 hours</li>
              <li><strong className="text-text-primary">100 sign-ups, 4 consoles:</strong> split into qualifier nights of up to 32, then a finals night for the top 4 of each</li>
            </ul>
            <p className="mt-2">The form works this out for you as you type.</p>
          </div>
        </div>
      ) : (
        groups
          .filter((g) => g.rows.length)
          .map((g) => (
            <section key={g.key} className="flex flex-col gap-2">
              <h2 className="inline-flex items-center gap-1.5 text-overline uppercase text-text-secondary">
                <g.icon className={cn('h-3.5 w-3.5', g.key === 'live' && 'text-error')} aria-hidden /> {g.label}
              </h2>
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {g.rows.map((t) => <Row key={t.id} t={t} base={base} />)}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}

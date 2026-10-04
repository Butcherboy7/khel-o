import Link from 'next/link';
import { MapPin, Trophy, Users } from 'lucide-react';
import type { TournamentCard as Card } from '@/lib/api/tournaments';
import { PHASE, dateBlock, feeLabel, fmtTime, formatLabel } from '@/lib/tournament';
import { cn } from '@/lib/cn';

/** The game's colour as a poster band; the only place game colour is used at full strength. */
export function GamePoster({ t, className, children }: { t: Card; className?: string; children?: React.ReactNode }) {
  const c = t.game.colour;
  return (
    <div
      className={cn('relative overflow-hidden text-white', className)}
      style={{ background: `linear-gradient(135deg, ${c} 0%, ${c}cc 45%, #0b0b12 120%)` }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.12]"
        style={{ backgroundImage: 'repeating-linear-gradient(-45deg, #fff 0 2px, transparent 2px 14px)' }}
      />
      {children}
    </div>
  );
}

export function SpotsBar({ t }: { t: Pick<Card, 'taken' | 'maxTeams' | 'spotsLeft' | 'teamSize' | 'waitlist'> }) {
  const pct = Math.min(100, Math.round((t.taken / Math.max(1, t.maxTeams)) * 100));
  const unit = t.teamSize > 1 ? 'teams' : 'players';
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-caption">
        <span className="font-data text-text-primary">
          {t.taken}/{t.maxTeams} {unit}
        </span>
        <span className={cn('font-semibold', t.spotsLeft === 0 ? 'text-error' : t.spotsLeft <= 3 ? 'text-warning' : 'text-text-secondary')}>
          {t.spotsLeft === 0 ? (t.waitlist ? `${t.waitlist} on waitlist` : 'Full') : `${t.spotsLeft} left`}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface" role="presentation">
        <div
          className={cn('h-full rounded-full transition-all', pct >= 100 ? 'bg-error' : pct >= 75 ? 'bg-warning' : 'bg-primary')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function TournamentCard({ t, href }: { t: Card; href?: string }) {
  const d = dateBlock(t.startsAt);
  const phase = PHASE[t.phase];
  const topPrize = t.prizes[0];
  return (
    <Link
      href={href ?? `/tournaments/${t.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card transition-all hover:-translate-y-0.5 hover:shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <GamePoster t={t} className="flex h-28 items-start justify-between p-4">
        <div className="relative flex flex-col gap-1">
          <span className="text-overline uppercase tracking-widest text-white/80">{t.game.platform || 'Tournament'}</span>
          <span className="font-heading text-[1.6rem] font-bold leading-none tracking-tight">{t.game.short}</span>
          <span className="mt-1 inline-flex w-fit rounded-full bg-black/25 px-2 py-0.5 text-[11px] font-bold">{formatLabel(t)}</span>
        </div>
        <div className="relative flex w-14 flex-col items-center rounded-xl bg-white/95 py-1.5 text-center text-[#0b0b12] shadow-card">
          <span className="text-[10px] font-bold tracking-wider text-[#0b0b12]/60">{d.weekday}</span>
          <span className="font-heading text-xl font-bold leading-none">{d.day}</span>
          <span className="text-[10px] font-bold tracking-wider">{d.month}</span>
        </div>
        {t.phase === 'live' && (
          <span className="absolute bottom-3 left-4 inline-flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-bold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" /> LIVE
          </span>
        )}
      </GamePoster>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-h3 text-text-primary [text-wrap:balance] group-hover:text-primary">{t.title}</h3>
          {t.cafe && (
            <p className="flex items-center gap-1 text-caption text-text-secondary">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden /> <span className="truncate">{t.cafe.name}</span>
              <span aria-hidden>·</span> <span className="shrink-0">{fmtTime(t.startsAt)}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-caption">
          <span className={cn('rounded-full px-2 py-0.5 font-bold', t.entryFee ? 'bg-surface text-text-primary' : 'bg-success/10 text-success')}>
            {feeLabel(t)}
          </span>
          {topPrize && (
            <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 font-bold text-accent">
              <Trophy className="h-3 w-3" aria-hidden /> {topPrize.prize}
            </span>
          )}
          <span className={cn('ml-auto rounded-full px-2 py-0.5 font-bold', phase.tone)}>{phase.label}</span>
        </div>
        {['open', 'filling', 'full', 'closed'].includes(t.phase) ? (
          <SpotsBar t={t} />
        ) : (
          <p className="flex items-center gap-1 text-caption text-text-secondary">
            <Users className="h-3.5 w-3.5" aria-hidden /> {t.taken} {t.teamSize > 1 ? 'teams' : 'players'}
          </p>
        )}
      </div>
    </Link>
  );
}

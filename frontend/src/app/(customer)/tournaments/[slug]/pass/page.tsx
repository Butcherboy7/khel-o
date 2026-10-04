'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, BellRing, CalendarPlus, CheckCircle2, MapPin, PartyPopper } from 'lucide-react';
import { cancelMyEntry, getMyPass } from '@/lib/api/tournaments';
import { GamePoster } from '@/components/tournaments/TournamentCard';
import { BracketView } from '@/components/tournaments/BracketView';
import { Button, ErrorState, Skeleton } from '@/components/ui';
import { downloadIcs, fmtDay, fmtTime, formatLabel, placeLabel, rupees } from '@/lib/tournament';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';

export default function TournamentPassPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const isNew = useSearchParams().get('new') === '1';
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['tournament-pass', slug],
    queryFn: () => getMyPass(slug),
    refetchInterval: (q) => (q.state.data?.tournament.status === 'live' ? 15_000 : false),
  });

  if (isLoading) return <Skeleton className="mx-auto h-[32rem] w-full max-w-md rounded-3xl" />;
  if (isError || !data) {
    return <ErrorState title="No pass found" message="You aren't registered for this tournament." onRetry={() => refetch()} />;
  }

  const { tournament: t, entry: e, bracket } = data;
  const qr = e.code ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=0&data=${encodeURIComponent(`KHELO-T:${e.code}`)}` : null;

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await cancelMyEntry(slug);
      await qc.invalidateQueries({ queryKey: ['tournament', slug] });
      await qc.invalidateQueries({ queryKey: ['my-tournaments'] });
      router.replace(`/tournaments/${slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel. Try again.');
      setBusy(false);
    }
  }

  const called = e.nextMatch?.status === 'called';

  return (
    <div className="mx-auto flex max-w-md flex-col gap-5 pb-16">
      <Link href={`/tournaments/${slug}`} className="inline-flex items-center gap-1 text-caption font-semibold text-text-secondary hover:text-text-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Tournament page
      </Link>

      {isNew && e.status === 'confirmed' && (
        <div className="flex items-center gap-3 rounded-2xl bg-success/10 p-4 text-success" role="status">
          <PartyPopper className="h-6 w-6 shrink-0" aria-hidden />
          <p className="text-body font-semibold">You&apos;re in! Show this pass at the counter on the day.</p>
        </div>
      )}

      {called && (
        <div className="flex items-center gap-3 rounded-2xl bg-error p-4 text-white" role="alert">
          <BellRing className="h-6 w-6 shrink-0 animate-pulse" aria-hidden />
          <p className="text-body font-semibold">
            Your match is on now{e.nextMatch?.station ? ` at station ${e.nextMatch.station}` : ''}. Opponent: {e.nextMatch?.opponent}.
          </p>
        </div>
      )}

      <article className="overflow-hidden rounded-3xl border border-border bg-card shadow-float" aria-label="Tournament pass">
        <GamePoster t={t} className="flex flex-col gap-1 p-5">
          <span className="relative text-overline uppercase tracking-widest text-white/80">{t.game.short} · {formatLabel(t)}</span>
          <h1 className="relative font-heading text-h1 [text-wrap:balance]">{t.title}</h1>
          <span className="relative text-caption text-white/85">{fmtDay(t.startsAt)} · {fmtTime(t.startsAt)}</span>
        </GamePoster>

        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-overline uppercase text-text-secondary">{t.teamSize > 1 ? 'Team' : 'Player'}</span>
              <span className="truncate font-heading text-h2 text-text-primary">{e.teamName || e.gamerTag}</span>
              {e.teammates.length > 0 && <span className="text-caption text-text-secondary">{[e.gamerTag, ...e.teammates].join(' · ')}</span>}
            </div>
            {e.entryNumber && (
              <div className="flex flex-col items-end">
                <span className="text-overline uppercase text-text-secondary">Entry</span>
                <span className="font-data text-h2 text-text-primary">#{e.entryNumber}</span>
              </div>
            )}
          </div>

          {e.place ? (
            <div className="rounded-2xl bg-amber-400/15 p-4 text-center">
              <span className="text-overline uppercase text-text-secondary">Final result</span>
              <p className="font-heading text-h1 text-text-primary">{placeLabel(e.place)}</p>
              <p className="text-caption text-text-secondary">+{e.points} leaderboard points</p>
            </div>
          ) : e.status === 'waitlist' ? (
            <p className="rounded-2xl bg-warning/10 p-4 text-body text-text-primary">
              You&apos;re on the waitlist. We&apos;ll notify you the moment a spot opens; the first to register gets it.
            </p>
          ) : e.status === 'held' ? (
            <p className="rounded-2xl bg-primary/5 p-4 text-body text-text-primary">
              Payment pending. <Link className="font-semibold text-primary underline" href={`/tournaments/${slug}`}>Pay {rupees(e.amount)}</Link> to confirm your spot.
            </p>
          ) : (
            <>
              {/* Tear line */}
              <div className="relative -mx-5 border-t-2 border-dashed border-border" aria-hidden>
                <span className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-surface" />
                <span className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-surface" />
              </div>
              <div className="flex flex-col items-center gap-3 text-center">
                {e.checkedIn ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-caption font-bold text-success">
                    <CheckCircle2 className="h-4 w-4" aria-hidden /> Checked in
                  </span>
                ) : (
                  <span className="text-caption text-text-secondary">Show this at the counter from {fmtTime(t.checkInOpensAt)}</span>
                )}
                {qr && !e.checkedIn && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qr} alt={`QR code for check-in code ${e.code}`} width={168} height={168} className="rounded-xl bg-white p-2" />
                )}
                <div className="flex flex-col">
                  <span className="text-overline uppercase text-text-secondary">Check-in code</span>
                  <span className={cn('font-data text-[2.25rem] font-bold tracking-[0.3em] text-text-primary', e.checkedIn && 'opacity-50')}>{e.code}</span>
                </div>
                {e.nextMatch && !called && (
                  <p className="rounded-xl bg-surface px-3 py-2 text-caption text-text-primary">
                    Next: <strong>{e.nextMatch.round}</strong> vs {e.nextMatch.opponent}. We&apos;ll notify you when it&apos;s called.
                  </p>
                )}
              </div>
            </>
          )}

          {t.cafe && (
            <div className="flex items-start gap-2 rounded-2xl bg-surface p-3 text-caption">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
              <span className="min-w-0 flex-1">
                <strong className="text-text-primary">{t.cafe.name}</strong>
                <span className="block text-text-secondary">{t.cafe.address}</span>
              </span>
              {t.cafe.mapsUrl && (
                <a href={t.cafe.mapsUrl} target="_blank" rel="noreferrer" className="shrink-0 font-semibold text-primary">
                  Directions
                </a>
              )}
            </div>
          )}
        </div>
      </article>

      {e.status === 'confirmed' && ['published', 'live'].includes(t.status) && (
        <Button variant="secondary" fullWidth onClick={() => downloadIcs(t, e.code)}>
          <CalendarPlus className="mr-2 h-4 w-4" aria-hidden /> Add to calendar
        </Button>
      )}

      {bracket.rounds.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-h2 text-text-primary">Bracket</h2>
          <BracketView bracket={bracket} myEntryId={e.id} />
        </section>
      )}

      {t.status === 'published' && !e.paid && (
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          {confirmCancel ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-error/30 p-4">
              <p className="text-body text-text-primary">Give up your spot? Someone on the waitlist will get it.</p>
              {error && <p role="alert" className="text-caption text-error">{error}</p>}
              <div className="flex gap-2">
                <Button variant="destructive" isLoading={busy} onClick={cancel}>Yes, cancel</Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)}>Keep my spot</Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmCancel(true)} className="self-center text-caption font-semibold text-text-secondary underline hover:text-error">
              {e.status === 'waitlist' ? 'Leave the waitlist' : "Can't make it? Cancel my entry"}
            </button>
          )}
        </div>
      )}
      {e.paid && t.status === 'published' && (
        <p className="text-center text-caption text-text-secondary">Paid entries are refunded only if the organiser cancels.</p>
      )}
    </div>
  );
}

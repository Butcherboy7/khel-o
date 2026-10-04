'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CalendarPlus,
  Clock,
  Gamepad2,
  MapPin,
  Share2,
  ShieldCheck,
  Ticket,
  Trophy,
  Users,
} from 'lucide-react';
import { getTournament, type MyEntry, type TournamentDetail } from '@/lib/api/tournaments';
import { GamePoster, SpotsBar } from '@/components/tournaments/TournamentCard';
import { BracketView, MatchBox } from '@/components/tournaments/BracketView';
import { RegisterSheet } from '@/components/tournaments/RegisterSheet';
import { LoginRequiredDialog } from '@/components/auth/LoginRequiredDialog';
import { Button, ErrorState, Skeleton } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import {
  PHASE,
  downloadIcs,
  feeLabel,
  fmtDay,
  fmtTime,
  formatLabel,
  minutesLabel,
  placeLabel,
  rupees,
  untilLabel,
} from '@/lib/tournament';
import { cn } from '@/lib/cn';

function Fact({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-text-secondary">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="text-overline uppercase text-text-secondary">{label}</span>
        <span className="font-semibold text-text-primary">{value}</span>
        {sub && <span className="text-caption text-text-secondary">{sub}</span>}
      </div>
    </div>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="font-heading text-h2 text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

function MyEntryCard({ t, e }: { t: TournamentDetail; e: MyEntry }) {
  if (e.status === 'waitlist') {
    return (
      <div className="rounded-2xl border border-warning/40 bg-warning/10 p-4">
        <p className="font-semibold text-text-primary">You&apos;re on the waitlist</p>
        <p className="text-caption text-text-secondary">If a spot opens we&apos;ll notify you right away. First to register gets it.</p>
      </div>
    );
  }
  if (e.status === 'held') {
    return (
      <div className="rounded-2xl border border-primary/40 bg-primary/5 p-4">
        <p className="font-semibold text-text-primary">Your spot is held</p>
        <p className="text-caption text-text-secondary">Pay {rupees(e.amount)} to confirm it. The hold runs out {untilLabel(e.holdExpiresAt!)}.</p>
      </div>
    );
  }
  return (
    <Link
      href={`/tournaments/${t.slug}/pass`}
      className="flex items-center gap-4 rounded-2xl border border-success/40 bg-success/10 p-4 transition hover:border-success"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-success text-white">
        <Ticket className="h-6 w-6" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-semibold text-text-primary">
          {e.place ? `You finished: ${placeLabel(e.place)}` : `You're in${e.entryNumber ? ` · #${e.entryNumber}` : ''}`}
        </span>
        <span className="text-caption text-text-secondary">
          {e.nextMatch
            ? e.nextMatch.status === 'called'
              ? `Your match is on now${e.nextMatch.station ? ` at station ${e.nextMatch.station}` : ''} vs ${e.nextMatch.opponent}`
              : `Next: ${e.nextMatch.round} vs ${e.nextMatch.opponent}`
            : e.checkedIn
              ? 'Checked in. Wait for your match to be called.'
              : `Check-in code ${e.code} · open your pass at the counter`}
        </span>
      </span>
      <span className="text-caption font-bold text-success">Pass</span>
    </Link>
  );
}

export function TournamentDetailClient({ slug, initial }: { slug: string; initial: TournamentDetail | null }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [sheet, setSheet] = useState(false);
  const [askLogin, setAskLogin] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: t, isLoading, isError, refetch } = useQuery({
    queryKey: ['tournament', slug, isAuthenticated],
    queryFn: () => getTournament(slug),
    initialData: isAuthenticated ? undefined : initial ?? undefined,
    refetchInterval: (q) => (q.state.data?.status === 'live' ? 15_000 : false),
  });

  if (isLoading) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <Skeleton className="h-56 rounded-3xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }
  if (isError || !t) {
    return <ErrorState title="Tournament not found" message="The link may be wrong or the event was removed." onRetry={() => refetch()} />;
  }

  const phase = PHASE[t.phase];
  const mine = t.myEntry;
  const unit = t.teamSize > 1 ? 'teams' : 'players';
  const canRegister = t.registrationOpen && (!mine || mine.status === 'held');

  function onCta() {
    if (mine && mine.status !== 'held') {
      router.push(`/tournaments/${t!.slug}/pass`);
      return;
    }
    if (!isAuthenticated) {
      setAskLogin(true);
      return;
    }
    setSheet(true);
  }

  async function share() {
    const url = `${window.location.origin}/tournaments/${t!.slug}`;
    const text = `${t!.title}: ${t!.game.short} ${formatLabel(t!)} at ${t!.cafe?.name}, ${fmtDay(t!.startsAt)} ${fmtTime(t!.startsAt)}. ${feeLabel(t!)}.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: t!.title, text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* dismissed */
    }
  }

  const ctaLabel = mine
    ? mine.status === 'held'
      ? `Pay ${rupees(mine.amount)}`
      : mine.status === 'waitlist'
        ? 'On the waitlist'
        : 'View my pass'
    : !t.registrationOpen
      ? t.status === 'completed'
        ? 'See results'
        : t.status === 'live'
          ? 'Live now'
          : t.status === 'cancelled'
            ? 'Cancelled'
            : 'Registration closed'
      : t.spotsLeft === 0
        ? 'Join waitlist'
        : t.entryFee
          ? `Register · ${rupees(t.entryFee)}`
          : 'Register free';
  const ctaDisabled = (!mine && !canRegister) || mine?.status === 'waitlist';

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 pb-40">
      <div className="flex items-center justify-between">
        <Link href="/tournaments" className="inline-flex items-center gap-1 text-caption font-semibold text-text-secondary hover:text-text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden /> All tournaments
        </Link>
        <button type="button" onClick={share} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-caption font-semibold text-text-primary hover:bg-surface">
          <Share2 className="h-3.5 w-3.5" aria-hidden /> {copied ? 'Link copied' : 'Share'}
        </button>
      </div>

      <GamePoster t={t} className="flex min-h-[14rem] flex-col justify-end gap-3 rounded-3xl p-6 md:p-8">
        <div className="relative flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">{t.game.name}</span>
          <span className="rounded-full bg-black/30 px-2.5 py-0.5 text-[11px] font-bold">{formatLabel(t)} knockout</span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-[11px] font-bold', t.phase === 'live' ? 'bg-white text-error' : 'bg-white/90 text-[#0b0b12]')}>
            {phase.label}
          </span>
        </div>
        <h1 className="relative font-heading text-[2rem] font-bold leading-[1.05] tracking-tight [text-wrap:balance] md:text-[2.75rem]">{t.title}</h1>
        <p className="relative text-body text-white/85">
          Hosted by <strong className="text-white">{t.organiser?.name}</strong>
          {t.sponsor && (
            <>
              {' '}· Powered by <strong className="text-white">{t.sponsor.name}</strong>
            </>
          )}
        </p>
      </GamePoster>

      {mine && <MyEntryCard t={t} e={mine} />}

      <div className="grid gap-5 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2">
        <Fact icon={Clock} label="When" value={`${fmtDay(t.startsAt)}, ${fmtTime(t.startsAt)}`} sub={`Check-in from ${fmtTime(t.checkInOpensAt)} · ends around ${fmtTime(t.endsAt)}`} />
        <Fact icon={MapPin} label="Where" value={t.cafe?.name ?? ''} sub={t.cafe?.address} />
        <Fact icon={Gamepad2} label="Format" value={`${formatLabel(t)} · single elimination`} sub={`About ${t.matchMinutes} min a match on ${t.stations} station${t.stations > 1 ? 's' : ''}`} />
        <Fact
          icon={Ticket}
          label="Entry"
          value={feeLabel(t)}
          sub={t.entryFee ? 'Covers your play time. Refunded if the organiser cancels.' : 'Cancel any time from your pass'}
        />
        <div className="sm:col-span-2">
          <SpotsBar t={t} />
          <p className="mt-1.5 text-caption text-text-secondary">
            Registration {t.registrationOpen ? `closes ${fmtDay(t.registrationClosesAt)}, ${fmtTime(t.registrationClosesAt)}` : 'is closed'}
          </p>
        </div>
      </div>

      {t.prizes.length > 0 && (
        <Section title="Prizes" id="prizes">
          <ul className="grid gap-3 sm:grid-cols-3">
            {t.prizes.map((p, i) => (
              <li
                key={i}
                className={cn(
                  'flex items-center gap-3 rounded-2xl border p-4',
                  i === 0 ? 'border-amber-400/60 bg-amber-400/10' : 'border-border bg-card',
                )}
              >
                <Trophy className={cn('h-6 w-6 shrink-0', i === 0 ? 'text-amber-500' : 'text-text-secondary')} aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="text-overline uppercase text-text-secondary">{p.place}</span>
                  <span className="font-heading text-h3 text-text-primary">{p.prize}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="text-caption text-text-secondary">Prizes are fixed by the organiser and don&apos;t depend on how many people enter.</p>
        </Section>
      )}

      {t.status === 'completed' && t.results.length > 0 && (
        <Section title="Results" id="results">
          <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {t.results.slice(0, 8).map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className={cn('w-20 shrink-0 text-caption font-bold', r.place === 1 ? 'text-amber-500' : 'text-text-secondary')}>{placeLabel(r.place)}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-text-primary">{r.name}</span>
                <span className="font-data text-caption text-text-secondary">+{r.points} pts</span>
              </li>
            ))}
          </ol>
        </Section>
      )}

      {t.status === 'live' && (t.bracket.nowPlaying.length > 0 || t.bracket.upNext.length > 0) && (
        <Section title="On now" id="live">
          <div className="flex gap-3 overflow-x-auto pb-1">
            {[...t.bracket.nowPlaying, ...t.bracket.upNext.slice(0, 4)].map((m) => (
              <div key={m.id} className="flex shrink-0 flex-col gap-1">
                <span className="text-overline uppercase text-text-secondary">{m.status === 'called' ? 'Playing' : 'Up next'} · {m.name}</span>
                <MatchBox m={m} myEntryId={mine?.id} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {t.bracket.rounds.length > 0 && (
        <Section title="Bracket" id="bracket">
          <BracketView bracket={t.bracket} myEntryId={mine?.id} />
        </Section>
      )}

      <Section title="How it works" id="how">
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ['Register', t.entryFee ? `Pay ${rupees(t.entryFee)} to lock your spot. You get a pass with a check-in code.` : 'Takes a minute. You get a pass with a check-in code.'],
            ['Check in', `At the counter from ${fmtTime(t.checkInOpensAt)}. Only checked-in ${unit} go in the bracket.`],
            ['Play when called', "We notify you when your match is up and which station to go to. Win and you move on."],
          ].map(([h, b], i) => (
            <li key={h} className="flex flex-col gap-1 rounded-2xl border border-border bg-card p-4">
              <span className="font-data text-caption font-bold text-primary">0{i + 1}</span>
              <span className="font-semibold text-text-primary">{h}</span>
              <span className="text-caption text-text-secondary">{b}</span>
            </li>
          ))}
        </ol>
      </Section>

      {t.players.length > 0 && t.status !== 'completed' && (
        <Section title={`Who's in (${t.players.length})`} id="players">
          <ul className="flex flex-wrap gap-2">
            {t.players.map((p) => (
              <li key={p.id} className={cn('rounded-full border px-3 py-1 text-caption font-semibold', p.id === mine?.id ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-card text-text-primary')}>
                {p.name}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {t.about && (
        <Section title="About" id="about">
          <p className="whitespace-pre-line text-body text-text-secondary">{t.about}</p>
        </Section>
      )}

      <Section title="Rules" id="rules">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          {t.rules && (
            <div className="flex flex-col gap-1">
              <h3 className="font-heading text-h4 text-text-primary">{t.game.short}</h3>
              <ul className="list-disc pl-5 text-body text-text-secondary">
                {t.rules.split('\n').filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <h3 className="inline-flex items-center gap-1.5 font-heading text-h4 text-text-primary">
              <ShieldCheck className="h-4 w-4" aria-hidden /> On the night
            </h3>
            <ul className="list-disc pl-5 text-body text-text-secondary">
              {t.houseRules.split('\n').filter(Boolean).map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        </div>
      </Section>

      {t.cafe && (
        <Section title="Venue" id="venue">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-5">
            <div className="flex min-w-0 flex-col">
              <span className="font-semibold text-text-primary">{t.cafe.name}</span>
              <span className="text-caption text-text-secondary">{t.cafe.address}</span>
            </div>
            <div className="flex gap-2">
              {t.cafe.mapsUrl && (
                <a href={t.cafe.mapsUrl} target="_blank" rel="noreferrer" className="rounded-xl border border-border px-3 py-2 text-caption font-semibold text-text-primary hover:bg-surface">
                  Directions
                </a>
              )}
              <Link href={`/cafe/${t.cafe.slug ?? t.cafe.id}`} className="rounded-xl border border-border px-3 py-2 text-caption font-semibold text-text-primary hover:bg-surface">
                Café page
              </Link>
            </div>
          </div>
        </Section>
      )}

      {/* Sticky action bar, BookMyShow style: price and seats left on the left, one action on the right. */}
      <div className="fixed bottom-[calc(var(--bottom-nav-height)_+_env(safe-area-inset-bottom))] left-0 right-0 z-overlay border-t border-border bg-card p-4 shadow-overlay md:bottom-0">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <div className="flex min-w-0 flex-col">
            <span className="font-heading text-h3 text-text-primary">{t.entryFee ? rupees(t.entryFee) : 'Free'}</span>
            <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {t.registrationOpen ? (t.spotsLeft ? `${t.spotsLeft} of ${t.maxTeams} spots left` : 'Full · waitlist open') : `${t.taken} ${unit}`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {mine?.status === 'confirmed' && (
              <Button variant="secondary" size="icon" aria-label="Add to calendar" onClick={() => downloadIcs(t, mine.code)}>
                <CalendarPlus className="h-5 w-5" aria-hidden />
              </Button>
            )}
            <Button
              size="lg"
              disabled={ctaDisabled && t.status !== 'completed'}
              onClick={() => (t.status === 'completed' && !mine ? document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }) : onCta())}
            >
              {ctaLabel}
            </Button>
          </div>
        </div>
      </div>

      {sheet && (
        <RegisterSheet
          t={t}
          open={sheet}
          onClose={() => setSheet(false)}
          onDone={(entry) => {
            setSheet(false);
            void qc.invalidateQueries({ queryKey: ['tournament', slug] });
            void qc.invalidateQueries({ queryKey: ['my-tournaments'] });
            if (entry.status === 'confirmed') router.push(`/tournaments/${t.slug}/pass?new=1`);
          }}
        />
      )}
      <LoginRequiredDialog
        isOpen={askLogin}
        onCancel={() => setAskLogin(false)}
        onLogin={() => router.push(`/login?redirect=${encodeURIComponent(pathname)}`)}
        onRegister={() => router.push(`/register?redirect=${encodeURIComponent(pathname)}`)}
        title="Sign in to register"
        description="Your pass, check-in code and match alerts live in your KHEL-O account."
      />
    </div>
  );
}

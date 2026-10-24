'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, CheckCircle2, Circle, Clock, Dices, ExternalLink, Flag, Gift, Lock, Projector, RotateCcw, Search, Swords, Trash2 } from 'lucide-react';
import {
  adminClearResult, adminCloseCheckin, adminDraw, adminEntryAction, adminFinish, adminGetBracket, adminGetChallenge, adminReopen,
  adminRecordResult, adminSetChampionPhoto, adminUploadChampionPhoto,
  type AdminChallengeDetail, type AdminEntry, type Bracket, type BracketMatch,
} from '@/lib/api/challenges';
import { challengePlan, challengeTime, hoursAndMinutes } from '@/lib/challenge';
import { BracketView, Podium } from '@/components/challenge/BracketView';
import { Button, Card, CardContent, ErrorState, Modal, PageSpinner } from '@/components/ui';
import { HostTour, HostTutorialButton, useHostTour } from '@/components/challenge/admin/HostTour';
import { DAY_PAGE_STEPS } from '@/components/challenge/admin/hostTourSteps';

/** Everything for the day itself, top to bottom in the order it happens:
 *  check people in, close check-in, draw, enter results, finish. */
export default function ChallengeDayPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const detailKey = ['admin', 'challenge', id];
  const bracketKey = ['admin', 'challenge', id, 'bracket'];
  const detail = useQuery({ queryKey: detailKey, queryFn: () => adminGetChallenge(id), refetchInterval: 10_000 });
  const bracket = useQuery({ queryKey: bracketKey, queryFn: () => adminGetBracket(id), refetchInterval: 10_000 });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [drawOpen, setDrawOpen] = useState(false);
  const [picked, setPicked] = useState<BracketMatch | null>(null);
  const tour = useHostTour('day', Boolean(detail.data && bracket.data));

  const setDetail = (d: AdminChallengeDetail) => qc.setQueryData(detailKey, d);
  const setBracket = (b: Bracket) => {
    qc.setQueryData(bracketKey, b);
    qc.invalidateQueries({ queryKey: detailKey });
  };

  const run = async <T,>(what: string, fn: () => Promise<T>, done?: (v: T) => void) => {
    setBusy(what);
    setFlash(null);
    try {
      const v = await fn();
      done?.(v);
      return v;
    } catch (e) {
      setFlash((e as Error).message || 'That didn’t work. Try again.');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const players = useMemo(() => {
    const rows = (detail.data?.entries ?? []).filter((e) => e.status === 'confirmed' || e.status === 'waitlist');
    const needle = q.trim().toLowerCase();
    return rows.filter((e) => !needle || [e.name, e.displayName ?? '', e.phone].some((v) => v.toLowerCase().includes(needle)));
  }, [detail.data, q]);

  if (detail.isLoading || bracket.isLoading) return <PageSpinner label="Loading the challenge day" />;
  if (detail.isError || !detail.data || !bracket.data) {
    return <ErrorState message={(detail.error as Error)?.message} onRetry={() => detail.refetch()} />;
  }

  const c = detail.data.challenge;
  const b = bracket.data;
  const all = detail.data.entries;
  const confirmed = all.filter((e) => e.status === 'confirmed');
  const here = confirmed.filter((e) => e.present).length;
  const waitlistHere = all.filter((e) => e.status === 'waitlist' && e.present).length;
  const resultsIn = [...b.rounds.flatMap((r) => r.matches), ...(b.thirdPlace ? [b.thirdPlace] : [])].some((m) => m.winner && !m.bye);
  const champion = b.standings.find((s) => s.place === 1);
  const finished = c.status === 'finished';
  // Who the estimate is for: the bracket once drawn, else who's here, else everyone confirmed.
  const drawnPlayers = b.rounds[0]?.matches.reduce((n, m) => n + (m.a ? 1 : 0) + (m.b ? 1 : 0), 0) ?? 0;
  const playerCount = b.drawn ? drawnPlayers : c.checkinClosedAt || here >= 2 ? here : confirmed.length;

  const toggle = (e: AdminEntry) =>
    run(`p:${e.id}`, () => adminEntryAction(id, e.id, e.present ? 'uncheckin' : 'checkin'), setDetail);

  return (
    <div className="flex flex-col gap-5 pb-16">
      <div>
        <Link href={`/admin/challenges/${id}`} className="text-caption font-semibold text-text-secondary hover:text-text-primary">
          ← {c.title}
        </Link>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <h1 className="font-heading text-h1 text-text-primary">Challenge day</h1>
          <HostTutorialButton onClick={tour.start} />
        </div>
        <div className="mt-2 flex flex-wrap gap-2" data-host-tour="screens">
          <a href={`/challenge/${c.slug}/bracket?projector=1`} target="_blank" rel="noopener noreferrer" className={linkBtn}>
            <Projector className="h-4 w-4" /> Bracket on projector
          </a>
          <a href={`/challenge/${c.slug}/rules?projector=1`} target="_blank" rel="noopener noreferrer" className={linkBtn}>
            <Projector className="h-4 w-4" /> Rules on projector
          </a>
          <a href={`/challenge/${c.slug}/bracket`} target="_blank" rel="noopener noreferrer" className={linkBtn}>
            <ExternalLink className="h-4 w-4" /> Public bracket
          </a>
          <Link href={`/admin/challenges/${id}/rewards`} className={linkBtn}>
            <Gift className="h-4 w-4" /> Rewards
          </Link>
        </div>
      </div>

      {flash && (
        <button type="button" onClick={() => setFlash(null)} className="rounded-xl bg-primary/10 px-3 py-2 text-left text-caption text-text-primary">
          {flash} <span className="text-text-secondary">(tap to hide)</span>
        </button>
      )}

      {/* 1. Check-in */}
      <Step n={1} title="Check people in" done={Boolean(c.checkinClosedAt)} tour="checkin">
        <p className="text-caption text-text-secondary">
          Scan each player’s QR with your phone camera (signed in to KHEL-O), or tap their name here. Check-in time on their page:{' '}
          {challengeTime(c.checkinOpensAt)}–{challengeTime(c.checkinClosesAt)}.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Mini label="Confirmed here" value={`${here}/${confirmed.length}`} />
          <Mini label="Waitlist here" value={waitlistHere} />
          <Mini label="Spots" value={c.capacity} />
        </div>
        <label className="relative mt-3 block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, tag, phone"
            className="h-10 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-caption text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </label>
        <div className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border">
          {players.length === 0 && <p className="p-4 text-center text-caption text-text-secondary">Nobody to check in.</p>}
          {players.map((e) => (
            <button
              key={e.id}
              type="button"
              disabled={busy === `p:${e.id}`}
              onClick={() => toggle(e)}
              className="flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface disabled:opacity-50"
            >
              {e.present ? <CheckCircle2 className="h-6 w-6 text-success" /> : <Circle className="h-6 w-6 text-text-secondary" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-text-primary">
                  {e.name}
                  {e.displayName && <span className="font-normal text-text-secondary"> · {e.displayName}</span>}
                </span>
                <span className="text-xs text-text-secondary">
                  {e.status === 'confirmed' ? `Confirmed #${e.rank}` : `Waitlist #${e.rank}`}
                  {e.present && e.checkedInAt ? ` · here since ${challengeTime(e.checkedInAt)}` : ''}
                </span>
              </span>
              <span className={`text-caption font-semibold ${e.present ? 'text-success' : 'text-text-secondary'}`}>
                {e.present ? 'Here' : 'Tap when here'}
              </span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between" data-host-tour="close-checkin">
          <p className="text-caption text-text-secondary">
            {c.checkinClosedAt
              ? `Closed at ${challengeTime(c.checkinClosedAt)}. Late arrival? Put them back on the main page, tick them here, then close again.`
              : 'Closing marks confirmed people who aren’t here as no-shows. Waitlist people who are here take those spots, in order.'}
          </p>
          <Button variant={c.checkinClosedAt ? 'outline' : 'primary'} size="sm" onClick={() => setCloseOpen(true)}>
            <Lock className="h-4 w-4" /> {c.checkinClosedAt ? 'Close again' : 'Close check-in'}
          </Button>
        </div>
      </Step>

      <PlanCard id={id} players={playerCount} bestOf={c.bestOf} finalBestOf={c.finalBestOf} drawn={b.drawn} />

      {/* 2. Draw */}
      <Step n={2} title="Make the draw" done={b.drawn} tour="draw">
        <p className="text-caption text-text-secondary">
          Shuffles the {here} confirmed players who are here into the bracket. If the numbers are uneven, some get a bye into round 2.
          {b.drawn && !resultsIn ? ' You can redo it until the first result is in.' : ''}
        </p>
        <div className="mt-3">
          <Button
            variant={b.drawn ? 'outline' : 'primary'}
            size="sm"
            disabled={resultsIn || here < 2}
            onClick={() => (b.drawn || !c.checkinClosedAt ? setDrawOpen(true) : run('draw', () => adminDraw(id), setBracket))}
            isLoading={busy === 'draw'}
          >
            <Dices className="h-4 w-4" /> {b.drawn ? 'Redo the draw' : 'Make the draw'}
          </Button>
        </div>
      </Step>

      {/* 3. Results */}
      <Step n={3} title="Play and enter results" done={Boolean(champion)}>
        {!b.drawn ? (
          <p className="text-caption text-text-secondary" data-host-tour="ready">
            After the draw, the matches ready to play show up here, with the whole bracket below.
          </p>
        ) : (
          <>
            <div data-host-tour="ready">
              <p className="text-caption text-text-secondary">
                Send the top match to whichever setup is free. When it ends, tap it and enter who won. You can fix a result until the
                next match has one.
              </p>
              <ReadyList matches={b.ready} onPick={setPicked} />
            </div>
            <div className="mt-3 rounded-2xl bg-[#0E0F13] p-3 text-[#F4F1EC]" data-host-tour="bracket">
              {b.standings.length > 0 && (
                <div className="mb-3">
                  <Podium bracket={b} />
                </div>
              )}
              <BracketView bracket={b} onPick={setPicked} />
            </div>
          </>
        )}
      </Step>

      {/* 4. Finish */}
      <Step n={4} title="Finish and celebrate" done={finished} tour="finish">
        <p className="text-caption text-text-secondary">
          Finishing shows the results on the public page and makes the podium rewards and badges in the same step. If one can’t be made,
          nothing changes and you can try again.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant={finished ? 'outline' : 'primary'}
            size="sm"
            disabled={!champion || finished}
            isLoading={busy === 'finish'}
            onClick={async () => {
              const r = await run('finish', () => adminFinish(id), setBracket);
              if (r?.settlement) {
                const s = r.settlement;
                const bits = [
                  s.made.length ? `${s.made.length} reward${s.made.length === 1 ? '' : 's'} made` : null,
                  s.replaced.length ? `${s.replaced.length} replaced after the correction` : null,
                  s.badges ? `${s.badges} badge${s.badges === 1 ? '' : 's'} given` : null,
                  s.badgesMoved ? `${s.badgesMoved} badge${s.badgesMoved === 1 ? '' : 's'} moved` : null,
                ].filter(Boolean);
                setFlash(`Finished. ${bits.length ? bits.join(', ') + '.' : 'Nothing new to make.'}${
                  s.needsFinancialReview.length ? ' A replacement for a reward that was already used is KHEL-O-funded: see Admin → Payouts.' : ''}`);
              }
            }}
          >
            <Flag className="h-4 w-4" /> {finished ? 'Finished' : 'Finish the challenge'}
          </Button>
          {finished && (
            <Link href={`/admin/challenges/${id}/rewards`} className={linkBtn}>
              <Gift className="h-4 w-4" /> See the podium rewards
            </Link>
          )}
          {finished && (
            <Button variant="outline" size="sm" onClick={() => { setReopenReason(''); setReopenOpen(true); }}>
              <RotateCcw className="h-4 w-4" /> Reopen to correct a result
            </Button>
          )}
        </div>
        {champion && <ChampionPhoto id={id} slug={c.slug} url={c.championPhotoUrl} onSaved={() => detail.refetch()} />}
      </Step>

      <Modal isOpen={reopenOpen} onClose={() => setReopenOpen(false)} title="Reopen to correct a result?" size="sm">
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">
            Nothing is undone: rewards that were used stay used, bookings stay booked and badges stay put. Fix the result, then Finish again.
            If a place changes hands, its reward is replaced (a replacement for a used reward is paid for by KHEL-O and flagged in Payouts).
          </p>
          <label className="flex flex-col gap-1 text-caption font-semibold text-text-primary">
            Why are you reopening it?
            <input
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              maxLength={500}
              placeholder="e.g. the final was entered the wrong way round"
              className="h-11 rounded-xl border border-border bg-surface px-3 font-normal text-text-primary"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReopenOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              disabled={reopenReason.trim().length < 5}
              isLoading={busy === 'reopen'}
              onClick={async () => {
                const r = await run('reopen', () => adminReopen(id, reopenReason.trim()), setBracket);
                if (r) {
                  setReopenOpen(false);
                  setFlash('Reopened. Correct the result, then press Finish again. Rewards and badges stay as they are until then.');
                }
              }}
            >
              Reopen
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={closeOpen} onClose={() => setCloseOpen(false)} title="Close check-in?" size="sm">
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">
            {confirmed.length - here} confirmed {confirmed.length - here === 1 ? 'person isn’t' : 'people aren’t'} checked in. They become
            no-shows, and up to {waitlistHere} waitlist {waitlistHere === 1 ? 'person' : 'people'} who are here take the free spots, in order.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCloseOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              isLoading={busy === 'close'}
              onClick={async () => {
                const d = await run('close', () => adminCloseCheckin(id), setDetail);
                setCloseOpen(false);
                if (d) setFlash(`Check-in closed: ${d.noShows ?? 0} no-shows, ${d.movedUp ?? 0} moved up from the waitlist.`);
              }}
            >
              Close check-in
            </Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={drawOpen} onClose={() => setDrawOpen(false)} title={b.drawn ? 'Redo the draw?' : 'Draw before closing check-in?'} size="sm">
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">
            {b.drawn
              ? 'The players are shuffled again into a new bracket.'
              : 'Check-in is still open, so only the people checked in so far are drawn. Usually you close check-in first.'}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              isLoading={busy === 'draw'}
              onClick={async () => {
                await run('draw', () => adminDraw(id), setBracket);
                setDrawOpen(false);
              }}
            >
              {b.drawn ? 'Redo the draw' : 'Draw anyway'}
            </Button>
          </div>
        </div>
      </Modal>

      <ResultModal
        match={picked}
        goals={c.resultType === 'goals'}
        busy={busy === 'result'}
        onClose={() => setPicked(null)}
        onSave={async (body) => {
          if (!picked) return;
          const r = await run('result', () => adminRecordResult(id, picked.id, body), setBracket);
          if (r) setPicked(null);
        }}
        onClear={async () => {
          if (!picked) return;
          const r = await run('result', () => adminClearResult(id, picked.id), setBracket);
          if (r) setPicked(null);
        }}
      />

      <HostTour steps={DAY_PAGE_STEPS} open={tour.open} onClose={tour.close} />
    </div>
  );
}

const linkBtn =
  'inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-card px-3 text-caption font-semibold text-text-primary hover:bg-surface';

function Step({ n, title, done, tour, children }: { n: number; title: string; done: boolean; tour?: string; children: React.ReactNode }) {
  return (
    <Card data-host-tour={tour}>
      <CardContent className="p-4">
        <h2 className="flex items-center gap-2 font-heading text-h3 text-text-primary">
          <span className={`flex h-7 w-7 items-center justify-center rounded-full text-caption font-bold ${done ? 'bg-success/15 text-success' : 'bg-surface text-text-secondary'}`}>
            {done ? '✓' : n}
          </span>
          {title}
        </h2>
        <div className="mt-2">{children}</div>
      </CardContent>
    </Card>
  );
}

/** Every match that can start now. The café sends the top one to whichever
 *  setup is free; tapping a match enters its result. */
function ReadyList({ matches, onPick }: { matches: BracketMatch[]; onPick: (m: BracketMatch) => void }) {
  if (matches.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
        <Swords className="h-3.5 w-3.5" /> Ready to play · {matches.length}
      </p>
      {matches.map((m, i) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onPick(m)}
          className={`flex items-center gap-3 rounded-xl border p-3 text-left ${i === 0 ? 'border-primary/50 bg-primary/5' : 'border-border hover:bg-surface'}`}
        >
          <span
            className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-caption font-bold ${
              i === 0 ? 'bg-primary text-white' : 'bg-surface text-text-secondary'
            }`}
          >
            {i + 1}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-semibold text-text-secondary">
              {m.name} · best of {m.bestOf}
            </span>
            <span className="block truncate font-heading text-body-emphasis font-bold text-text-primary">
              {m.a?.name} vs {m.b?.name}
            </span>
          </span>
          <span className="flex-shrink-0 text-caption font-semibold text-primary-dark">Enter result</span>
        </button>
      ))}
    </div>
  );
}

/** Rounds, matches and a rough time, from the number of setups the café can
 *  use. The setups number is only for this estimate (kept on this device). */
function PlanCard({
  id, players, bestOf, finalBestOf, drawn,
}: { id: string; players: number; bestOf: number; finalBestOf: number; drawn: boolean }) {
  const key = `khelo.challenge.setups.${id}`;
  const [setups, setSetups] = useState('1');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved) setSetups(saved);
    } catch {
      /* 1 is fine */
    }
  }, [key]);
  const change = (v: string) => {
    const clean = v.replace(/\D/g, '').slice(0, 2);
    setSetups(clean);
    try {
      if (clean) localStorage.setItem(key, clean);
    } catch {
      /* ignore */
    }
  };
  const n = Math.max(1, Number(setups) || 1);
  const plan = challengePlan(players, bestOf, finalBestOf, n);
  return (
    <Card data-host-tour="plan">
      <CardContent className="p-4">
        <h2 className="flex items-center gap-2 font-heading text-h3 text-text-primary">
          <Clock className="h-5 w-5 text-text-secondary" /> How long it takes
        </h2>
        <label className="mt-2 flex items-center gap-2 text-caption text-text-primary">
          Setups you can use
          <input
            inputMode="numeric"
            value={setups}
            onChange={(e) => change(e.target.value)}
            className="h-10 w-16 rounded-xl border border-border bg-surface text-center text-text-primary"
          />
        </label>
        {plan ? (
          <p className="mt-2 text-body text-text-primary" data-testid="plan">
            {plan.players} players · best of {bestOf}
            {finalBestOf !== bestOf ? ` (final best of ${finalBestOf})` : ''} → {plan.rounds} {plan.rounds === 1 ? 'round' : 'rounds'},{' '}
            {plan.matches} {plan.matches === 1 ? 'match' : 'matches'} · <b>about {hoursAndMinutes(plan.minutes)}</b> with {n}{' '}
            {n === 1 ? 'setup' : 'setups'}
          </p>
        ) : (
          <p className="mt-2 text-caption text-text-secondary">Needs at least 2 players.</p>
        )}
        <p className="mt-1 text-xs text-text-secondary">
          {drawn ? 'For the players in the bracket. ' : 'For the players here so far (or everyone confirmed before anyone checks in). '}
          About 8 min a best-of-3 match and 13 min a best-of-5, with the 3rd-place match and the final one after the other. Breaks not
          included.
        </p>
      </CardContent>
    </Card>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl bg-surface p-3">
      <p className="text-xs font-semibold text-text-secondary">{label}</p>
      <p className="font-heading text-h2 tabular-nums text-text-primary">{value}</p>
    </div>
  );
}

type ResultBody = {
  winner: 'a' | 'b'; scoreA: number | null; scoreB: number | null;
  tiebreak: 'penalties' | null; tiebreakA: number | null; tiebreakB: number | null;
};

/** What the server will refuse, said before Save. The server checks it again. */
function resultProblem(goals: boolean, bestOf: number, b: ResultBody): string | null {
  const { winner, scoreA, scoreB } = b;
  if ((scoreA === null) !== (scoreB === null)) return 'Enter both scores, or leave both empty.';
  if (scoreA === null || scoreB === null) return null;
  const [win, lose] = winner === 'a' ? [scoreA, scoreB] : [scoreB, scoreA];
  if (!goals) {
    const need = Math.floor(bestOf / 2) + 1;
    return win === need && lose < need ? null : `In a best of ${bestOf} the winner wins ${need}, like ${need}–${need - 1}.`;
  }
  if (win < lose) return 'The winner can’t have fewer goals.';
  if (win > lose) return null;
  if (b.tiebreakA === null || b.tiebreakB === null) return 'Level on goals: enter the penalty shoot-out.';
  const [pw, pl] = winner === 'a' ? [b.tiebreakA, b.tiebreakB] : [b.tiebreakB, b.tiebreakA];
  return pw > pl ? null : 'The winner must have scored more penalties.';
}

function ResultModal({
  match, goals, busy, onClose, onSave, onClear,
}: {
  match: BracketMatch | null;
  goals: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (body: ResultBody) => void;
  onClear: () => void;
}) {
  const [winner, setWinner] = useState<'a' | 'b' | null>(null);
  const [scoreA, setScoreA] = useState('');
  const [scoreB, setScoreB] = useState('');
  const [penA, setPenA] = useState('');
  const [penB, setPenB] = useState('');
  const [forId, setForId] = useState<string | null>(null);
  if (match && match.id !== forId) {
    setForId(match.id);
    setWinner(match.winner);
    setScoreA(match.scoreA?.toString() ?? '');
    setScoreB(match.scoreB?.toString() ?? '');
    setPenA(match.tiebreakA?.toString() ?? '');
    setPenB(match.tiebreakB?.toString() ?? '');
  }
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  const level = goals && scoreA !== '' && scoreA === scoreB;
  const body: ResultBody | null = winner
    ? {
        winner, scoreA: num(scoreA), scoreB: num(scoreB),
        tiebreak: level ? 'penalties' : null, tiebreakA: level ? num(penA) : null, tiebreakB: level ? num(penB) : null,
      }
    : null;
  const problem = match && body ? resultProblem(goals, match.bestOf, body) : null;
  const maxLen = goals ? 2 : 1;

  return (
    <Modal isOpen={!!match} onClose={onClose} title={match ? (goals ? `${match.name} · one game` : `${match.name} · best of ${match.bestOf}`) : ''} size="sm">
      {match && (
        <div className="flex flex-col gap-3">
          <p className="text-caption text-text-secondary">Who won?</p>
          {(['a', 'b'] as const).map((s) => {
            const side = s === 'a' ? match.a : match.b;
            return (
              <div key={s} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setWinner(s)}
                  className={`h-12 flex-1 truncate rounded-xl border px-3 text-left font-semibold ${
                    winner === s ? 'border-success bg-success/10 text-success' : 'border-border text-text-primary'
                  }`}
                >
                  {winner === s ? '🏆 ' : ''}
                  {side?.name}
                </button>
                <input
                  inputMode="numeric"
                  aria-label={`${goals ? 'Goals' : 'Games won'} by ${side?.name}`}
                  placeholder={goals ? 'Goals' : 'Games'}
                  value={s === 'a' ? scoreA : scoreB}
                  onChange={(e) => (s === 'a' ? setScoreA : setScoreB)(e.target.value.replace(/\D/g, '').slice(0, maxLen))}
                  className="h-12 w-20 rounded-xl border border-border bg-surface text-center text-text-primary"
                />
              </div>
            );
          })}
          {level && (
            <div className="rounded-xl bg-surface p-3" data-penalties>
              <p className="text-caption font-semibold text-text-primary">Level on goals: penalty shoot-out</p>
              <div className="mt-2 flex items-center gap-2">
                {(['a', 'b'] as const).map((s) => (
                  <input
                    key={s}
                    inputMode="numeric"
                    aria-label={`Penalties scored by ${(s === 'a' ? match.a : match.b)?.name}`}
                    placeholder={`${(s === 'a' ? match.a : match.b)?.name ?? ''} pens`}
                    value={s === 'a' ? penA : penB}
                    onChange={(e) => (s === 'a' ? setPenA : setPenB)(e.target.value.replace(/\D/g, '').slice(0, 2))}
                    className="h-11 min-w-0 flex-1 rounded-xl border border-border bg-card px-2 text-center text-text-primary"
                  />
                ))}
              </div>
            </div>
          )}
          <p className="text-xs text-text-secondary">
            {goals ? 'Goals are optional. A level score needs the penalties.' : 'Games won is optional.'}
          </p>
          {problem && <p className="text-caption font-semibold text-error" role="alert">{problem}</p>}
          <div className="flex justify-between gap-2">
            {match.winner ? (
              <Button variant="ghost" onClick={onClear} disabled={busy}>
                <Trash2 className="h-4 w-4" /> Clear
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose}>Cancel</Button>
              <Button variant="primary" disabled={!body || !!problem} isLoading={busy} onClick={() => body && onSave(body)}>
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Wave 3: the champion's photo for their page. Upload, or paste a link. */
function ChampionPhoto({ id, slug, url, onSaved }: { id: string; slug: string; url: string | null; onSaved: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      await adminUploadChampionPhoto(id, file);
      onSaved();
    } catch (e) {
      setError((e as Error).message || 'Upload failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await adminSetChampionPhoto(id, null);
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-xl border border-border p-3">
      <p className="font-semibold text-text-primary">Champion photo</p>
      <p className="text-caption text-text-secondary">Shown on the champion’s page. A portrait photo works best.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element -- admin preview of our own upload
          <img src={url} alt="Champion" className="h-20 w-16 rounded-lg object-cover" />
        )}
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = '';
          }}
        />
        <Button variant="secondary" size="sm" isLoading={busy} onClick={() => input.current?.click()}>
          <Camera className="h-4 w-4" /> {url ? 'Change photo' : 'Upload photo'}
        </Button>
        {url && (
          <>
            <a href={`/challenge/${slug}/champion`} target="_blank" rel="noopener noreferrer" className={linkBtn}>
              <ExternalLink className="h-4 w-4" /> Champion page
            </a>
            <Button variant="ghost" size="sm" onClick={remove} disabled={busy}>
              Remove
            </Button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-caption text-error">{error}</p>}
    </div>
  );
}

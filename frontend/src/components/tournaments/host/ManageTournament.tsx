'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  ExternalLink,
  Megaphone,
  Monitor,
  Pencil,
  Play,
  RotateCcw,
  Shuffle,
  UserPlus,
  X,
} from 'lucide-react';
import {
  addWalkIn,
  callMatch,
  cancelTournament,
  checkInEntry,
  closeRegistration,
  getHostTournament,
  makeBracket,
  publishTournament,
  removeEntry,
  reportScore,
  type BracketMatch,
  type HostEntry,
  type HostTournament,
} from '@/lib/api/tournaments';
import { BracketView } from '@/components/tournaments/BracketView';
import { Button, ErrorState, Input, Skeleton } from '@/components/ui';
import { PHASE, feeLabel, fmtTime, fmtWhen, placeLabel, rupees } from '@/lib/tournament';
import { ApiError } from '@/lib/api/errors';
import { cn } from '@/lib/cn';

type Tab = 'overview' | 'players' | 'checkin' | 'run';

function useAct(id: string) {
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const m = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onMutate: () => setError(''),
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'entries' in (data as object)) {
        qc.setQueryData(['host-tournament', id], data);
      } else {
        void qc.invalidateQueries({ queryKey: ['host-tournament', id] });
      }
      void qc.invalidateQueries({ queryKey: ['host-tournaments'] });
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'),
  });
  return { run: m.mutate, pending: m.isPending, error, setError };
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-4">
      <span className="text-overline uppercase text-text-secondary">{label}</span>
      <span className="font-heading text-h1 text-text-primary">{value}</span>
      {sub && <span className="text-caption text-text-secondary">{sub}</span>}
    </div>
  );
}

function ErrorLine({ error }: { error: string }) {
  if (!error) return null;
  return <p role="alert" className="rounded-xl bg-error/10 px-3 py-2 text-caption text-error">{error}</p>;
}

/* ── Overview ─────────────────────────────────────────────────── */

function Overview({ t, base, go }: { t: HostTournament; base: string; go: (tab: Tab) => void }) {
  const { run, pending, error } = useAct(t.id);
  const [copied, setCopied] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const url = typeof window !== 'undefined' ? `${window.location.origin}/tournaments/${t.slug}` : '';
  const waitlist = t.entries.filter((e) => e.status === 'waitlist').length;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked */
    }
  }

  const steps: { done: boolean; label: string; action?: React.ReactNode }[] = [
    { done: t.status !== 'draft', label: 'Publish so players can register' },
    { done: t.taken > 0, label: 'Share the link on WhatsApp and Instagram' },
    { done: t.checkedIn >= 2, label: `On the day: check players in from ${fmtTime(t.checkInOpensAt)}`, action: <button type="button" className="font-semibold text-primary" onClick={() => go('checkin')}>Open check-in</button> },
    { done: t.bracket.rounds.length > 0, label: 'Make the bracket from checked-in players', action: <button type="button" className="font-semibold text-primary" onClick={() => go('run')}>Bracket</button> },
    { done: t.status === 'completed', label: 'Call matches and enter scores until the final' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t.teamSize > 1 ? 'Teams' : 'Players'} value={`${t.taken}/${t.maxTeams}`} sub={waitlist ? `${waitlist} on waitlist` : undefined} />
        <Stat label="Checked in" value={String(t.checkedIn)} sub={`from ${fmtTime(t.checkInOpensAt)}`} />
        <Stat label="Collected online" value={rupees(t.money.collected)} sub={t.money.atCounter ? `${rupees(t.money.atCounter)} at counter` : feeLabel(t)} />
        <Stat label="Est. finish" value={fmtTime(t.endsAt)} sub={`${t.stations} station${t.stations > 1 ? 's' : ''} held`} />
      </div>

      {t.money.refundDue > 0 && (
        <p className="rounded-2xl bg-warning/10 p-4 text-body text-text-primary">
          <strong>{rupees(t.money.refundDue)} to refund.</strong> Refund these from the Razorpay dashboard (Payments → search the player&apos;s payment → Refund).
          Players marked &ldquo;Refund due&rdquo; are listed under Players.
        </p>
      )}

      {t.status !== 'draft' && t.status !== 'cancelled' && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h3 className="inline-flex items-center gap-2 font-heading text-h3 text-text-primary"><Megaphone className="h-5 w-5 text-primary" aria-hidden /> Share link</h3>
          <div className="flex flex-wrap gap-2">
            <code className="min-w-0 flex-1 truncate rounded-xl bg-surface px-3 py-2.5 font-data text-caption text-text-primary">{url}</code>
            <Button variant="secondary" onClick={copy}><Copy className="mr-1.5 h-4 w-4" aria-hidden /> {copied ? 'Copied' : 'Copy'}</Button>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${t.title} · ${fmtWhen(t.startsAt)} at ${t.cafe?.name}. ${feeLabel(t)}. Register: ${url}`)}`} target="_blank" rel="noreferrer">
              <Button variant="secondary">WhatsApp</Button>
            </a>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <h3 className="font-heading text-h3 text-text-primary">Run sheet</h3>
        <ol className="flex flex-col gap-2.5">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3 text-body">
              <span className={cn('mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', s.done ? 'bg-success text-white' : 'bg-surface text-text-secondary')}>
                {s.done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={cn('flex-1', s.done ? 'text-text-secondary line-through decoration-text-secondary/40' : 'text-text-primary')}>{s.label}</span>
              {!s.done && s.action && <span className="text-caption">{s.action}</span>}
            </li>
          ))}
        </ol>
      </div>

      <ErrorLine error={error} />
      <div className="flex flex-wrap gap-2">
        {t.status === 'draft' && <Button isLoading={pending} onClick={() => run(() => publishTournament(t.id))}>Publish</Button>}
        {['draft', 'published'].includes(t.status) && (
          <Link href={`${base}/${t.id}/edit`}><Button variant="secondary"><Pencil className="mr-1.5 h-4 w-4" aria-hidden /> Edit</Button></Link>
        )}
        {t.status === 'published' && t.registrationOpen && (
          <Button variant="secondary" isLoading={pending} onClick={() => run(() => closeRegistration(t.id))}>Close registration now</Button>
        )}
        {t.status !== 'draft' && (
          <Link href={`/tournaments/${t.slug}`} target="_blank"><Button variant="ghost"><ExternalLink className="mr-1.5 h-4 w-4" aria-hidden /> Public page</Button></Link>
        )}
        {['published', 'live'].includes(t.status) && (
          <Link href={`/tv/${t.slug}`} target="_blank"><Button variant="ghost"><Monitor className="mr-1.5 h-4 w-4" aria-hidden /> TV screen</Button></Link>
        )}
        {!['completed', 'cancelled'].includes(t.status) && (
          <Button variant="destructive-outline" className="ml-auto" onClick={() => setCancelOpen((v) => !v)}>Cancel tournament</Button>
        )}
      </div>
      {cancelOpen && (
        <div className="flex flex-col gap-3 rounded-2xl border border-error/30 p-4">
          <p className="text-body text-text-primary">
            Everyone registered gets a notification and email.{t.money.collected > 0 && ' Paid entries are marked for refund.'} This can&apos;t be undone.
          </p>
          <Input label="Reason (shown to players)" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          <div className="flex gap-2">
            <Button variant="destructive" isLoading={pending} onClick={() => run(() => cancelTournament(t.id, reason))}>Cancel tournament</Button>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>Keep it</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Players ──────────────────────────────────────────────────── */

const STATUS_TONE: Record<string, string> = {
  confirmed: 'bg-success/10 text-success',
  held: 'bg-primary/10 text-primary',
  waitlist: 'bg-warning/15 text-warning',
  cancelled: 'bg-surface text-text-secondary',
  removed: 'bg-surface text-text-secondary',
};

function Players({ t }: { t: HostTournament }) {
  const { run, pending, error } = useAct(t.id);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [walkIn, setWalkIn] = useState({ gamerTag: '', phone: '', teamName: '', paidAtCounter: t.entryFee > 0 });
  const rows = t.entries.filter((e) => showAll || ['confirmed', 'held', 'waitlist'].includes(e.status) || e.refundDue);

  return (
    <div className="flex flex-col gap-5">
      <ErrorLine error={error} />
      {['published', 'live'].includes(t.status) && (
        <form
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => addWalkIn(t.id, walkIn), {
              onSuccess: () => setWalkIn({ gamerTag: '', phone: '', teamName: '', paidAtCounter: t.entryFee > 0 }),
            });
          }}
        >
          <h3 className="inline-flex items-center gap-2 font-heading text-h4 text-text-primary"><UserPlus className="h-4 w-4" aria-hidden /> Add a walk-in</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input aria-label="Gamer tag" placeholder="Gamer tag" value={walkIn.gamerTag} onChange={(e) => setWalkIn({ ...walkIn, gamerTag: e.target.value })} required maxLength={40} />
            {t.teamSize > 1 && <Input aria-label="Team name" placeholder="Team name" value={walkIn.teamName} onChange={(e) => setWalkIn({ ...walkIn, teamName: e.target.value })} maxLength={60} />}
            <Input aria-label="Phone" placeholder="Phone (optional)" value={walkIn.phone} onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} maxLength={20} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {t.entryFee > 0 ? (
              <label className="flex items-center gap-2 text-caption text-text-primary">
                <input type="checkbox" className="h-4 w-4" checked={walkIn.paidAtCounter} onChange={(e) => setWalkIn({ ...walkIn, paidAtCounter: e.target.checked })} />
                Paid {rupees(t.entryFee)} at the counter
              </label>
            ) : <span className="text-caption text-text-secondary">Walk-ins are checked in straight away.</span>}
            <Button type="submit" size="sm" isLoading={pending}>Add</Button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[40rem] text-left text-caption">
          <thead className="border-b border-border bg-surface text-overline uppercase text-text-secondary">
            <tr>
              <th className="px-4 py-2.5 font-semibold">#</th>
              <th className="px-4 py-2.5 font-semibold">{t.teamSize > 1 ? 'Team' : 'Player'}</th>
              <th className="px-4 py-2.5 font-semibold">Status</th>
              <th className="px-4 py-2.5 font-semibold">Code</th>
              <th className="px-4 py-2.5 font-semibold">Phone</th>
              <th className="px-4 py-2.5 text-right font-semibold">Paid</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((e, i) => (
              <tr key={e.id} className="align-middle">
                <td className="px-4 py-2.5 font-data text-text-secondary">{i + 1}</td>
                <td className="px-4 py-2.5">
                  <span className="font-semibold text-text-primary">{e.name}</span>
                  {e.teammates.length > 0 && <span className="block text-text-secondary">{[e.gamerTag, ...e.teammates].join(', ')}</span>}
                  {e.source === 'walk_in' && <span className="ml-1.5 rounded bg-surface px-1.5 py-0.5 text-[10px] font-bold text-text-secondary">WALK-IN</span>}
                </td>
                <td className="px-4 py-2.5">
                  <span className={cn('rounded-full px-2 py-0.5 font-bold', STATUS_TONE[e.status])}>{e.status === 'held' ? 'paying' : e.status}</span>
                  {e.checkedInAt && <span className="ml-1.5 font-bold text-success">✓ in</span>}
                  {e.refundDue && <span className="ml-1.5 font-bold text-warning">Refund due</span>}
                  {e.place && <span className="ml-1.5 font-bold text-text-primary">{placeLabel(e.place)}</span>}
                </td>
                <td className="px-4 py-2.5 font-data text-text-primary">{e.status === 'confirmed' ? e.code : '–'}</td>
                <td className="px-4 py-2.5 text-text-secondary">{e.phone ? <a className="hover:text-primary" href={`tel:${e.phone}`}>{e.phone}</a> : '–'}</td>
                <td className="px-4 py-2.5 text-right font-data text-text-primary">{e.amount ? rupees(e.amount) : 'Free'}</td>
                <td className="px-4 py-2.5 text-right">
                  {['confirmed', 'waitlist', 'held'].includes(e.status) && e.seed == null && (
                    confirmId === e.id ? (
                      <span className="inline-flex gap-1">
                        <Button size="sm" variant="destructive" isLoading={pending} onClick={() => run(() => removeEntry(t.id, e.id))}>Remove</Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmId(null)}>Keep</Button>
                      </span>
                    ) : (
                      <Button size="icon-sm" variant="ghost" aria-label={`Remove ${e.name}`} onClick={() => setConfirmId(e.id)}><X className="h-4 w-4" aria-hidden /></Button>
                    )
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-text-secondary">No one has registered yet. Share the link from Overview.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <button type="button" className="self-start text-caption font-semibold text-text-secondary underline" onClick={() => setShowAll((v) => !v)}>
        {showAll ? 'Hide cancelled and removed' : 'Show cancelled and removed'}
      </button>
    </div>
  );
}

/* ── Check-in desk ────────────────────────────────────────────── */

function CheckIn({ t }: { t: HostTournament }) {
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [flash, setFlash] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const confirmed = t.entries.filter((e) => e.status === 'confirmed');
  const shown = confirmed.filter((e) => !filter || `${e.name} ${e.gamerTag} ${e.code}`.toLowerCase().includes(filter.toLowerCase()));

  async function submit(body: { code?: string; entryId?: string; undo?: boolean }) {
    setBusy(true);
    try {
      const r = await checkInEntry(t.id, body);
      setFlash({ ok: true, text: r.checkedIn ? `${r.name} is checked in` : `${r.name} un-checked` });
      setCode('');
      await qc.invalidateQueries({ queryKey: ['host-tournament', t.id] });
    } catch (e) {
      setFlash({ ok: false, text: e instanceof ApiError ? e.message : 'Could not check in' });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[22rem_1fr]">
      <div className="flex flex-col gap-3">
        <form
          className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim().length >= 4) void submit({ code });
          }}
        >
          <label htmlFor="ci-code" className="font-heading text-h3 text-text-primary">Enter the code on their pass</label>
          <input
            id="ci-code"
            ref={inputRef}
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
            className="rounded-2xl border-2 border-border bg-surface px-4 py-3 text-center font-data text-[2rem] font-bold tracking-[0.35em] text-text-primary focus:border-primary focus:outline-none"
            placeholder="ABC123"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <Button type="submit" size="lg" fullWidth isLoading={busy} disabled={code.length < 6}>Check in</Button>
          {flash && (
            <p role="status" className={cn('rounded-xl px-3 py-2 text-center text-body font-semibold', flash.ok ? 'bg-success/10 text-success' : 'bg-error/10 text-error')}>
              {flash.text}
            </p>
          )}
        </form>
        <div className="rounded-2xl bg-surface p-4 text-center">
          <span className="font-heading text-display text-text-primary">{t.checkedIn}</span>
          <span className="text-body text-text-secondary"> / {confirmed.length} checked in</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <Input aria-label="Search players" placeholder="Search by name or code" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {shown.map((e: HostEntry) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-text-primary">{e.name}</span>
                <span className="font-data text-caption text-text-secondary">{e.code}{e.phone ? ` · ${e.phone}` : ''}</span>
              </span>
              {e.checkedInAt ? (
                <span className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-caption font-bold text-success"><CheckCircle2 className="h-4 w-4" aria-hidden /> In</span>
                  {e.seed == null && (
                    <Button size="icon-sm" variant="ghost" aria-label={`Undo check-in for ${e.name}`} onClick={() => submit({ entryId: e.id, undo: true })}>
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    </Button>
                  )}
                </span>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => submit({ entryId: e.id })}>Check in</Button>
              )}
            </li>
          ))}
          {!shown.length && <li className="px-4 py-8 text-center text-caption text-text-secondary">No confirmed players{filter ? ' match' : ' yet'}.</li>}
        </ul>
      </div>
    </div>
  );
}

/* ── Bracket & run ────────────────────────────────────────────── */

function ScorePanel({ t, m, onDone }: { t: HostTournament; m: BracketMatch; onDone: () => void }) {
  const { run, pending, error } = useAct(t.id);
  const [a, setA] = useState(m.scoreA != null ? String(m.scoreA) : '');
  const [b, setB] = useState(m.scoreB != null ? String(m.scoreB) : '');
  const busyStations = new Set(t.bracket.nowPlaying.filter((x) => x.id !== m.id).map((x) => x.station));
  const free = Array.from({ length: t.stations }, (_, i) => i + 1).filter((s) => !busyStations.has(s));
  const [station, setStation] = useState<number | null>(m.station ?? free[0] ?? null);

  useEffect(() => {
    setA(m.scoreA != null ? String(m.scoreA) : '');
    setB(m.scoreB != null ? String(m.scoreB) : '');
    setStation(m.station ?? free[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  const opts = { onSuccess: onDone };
  return (
    <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary/40 bg-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-overline uppercase text-text-secondary">{m.name}</span>
        <button type="button" aria-label="Close" onClick={onDone} className="text-text-secondary hover:text-text-primary"><X className="h-4 w-4" aria-hidden /></button>
      </div>
      {m.status !== 'done' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-caption font-semibold text-text-primary">Station</span>
          {Array.from({ length: t.stations }, (_, i) => i + 1).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStation(s)}
              disabled={busyStations.has(s)}
              aria-pressed={station === s}
              className={cn(
                'h-9 w-9 rounded-lg border text-caption font-bold transition disabled:opacity-30',
                station === s ? 'border-primary bg-primary text-white' : 'border-border bg-card text-text-primary',
              )}
            >
              {s}
            </button>
          ))}
          <Button size="sm" variant={m.status === 'called' ? 'secondary' : 'primary'} isLoading={pending} onClick={() => run(() => callMatch(t.id, m.id, station))}>
            <Megaphone className="mr-1.5 h-4 w-4" aria-hidden /> {m.status === 'called' ? 'Call again' : 'Call players'}
          </Button>
        </div>
      )}
      <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
        {[
          { side: m.a, v: a, set: setA, key: 'a' as const },
          null,
          { side: m.b, v: b, set: setB, key: 'b' as const },
        ].map((x, i) =>
          x ? (
            <label key={x.key} className="flex flex-col gap-1.5">
              <span className="truncate text-center font-semibold text-text-primary">{x.side?.name}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={999}
                value={x.v}
                onChange={(e) => x.set(e.target.value)}
                className="rounded-xl border-2 border-border bg-surface py-3 text-center font-data text-[1.75rem] font-bold text-text-primary focus:border-primary focus:outline-none"
              />
            </label>
          ) : (
            <span key={i} className="pb-4 font-heading text-h3 text-text-secondary">–</span>
          ),
        )}
      </div>
      <ErrorLine error={error} />
      <Button
        size="lg"
        fullWidth
        isLoading={pending}
        disabled={a === '' || b === '' || a === b}
        onClick={() => run(() => reportScore(t.id, m.id, { scoreA: Number(a), scoreB: Number(b) }), opts)}
      >
        {a !== '' && a === b ? 'No draws: play extra time' : m.status === 'done' ? 'Correct result' : 'Save result'}
      </Button>
      <div className="flex flex-wrap items-center gap-2 text-caption text-text-secondary">
        No-show? Walkover to
        <Button size="sm" variant="ghost" onClick={() => run(() => reportScore(t.id, m.id, { walkoverWinner: 'a' }), opts)}>{m.a?.name}</Button>
        <Button size="sm" variant="ghost" onClick={() => run(() => reportScore(t.id, m.id, { walkoverWinner: 'b' }), opts)}>{m.b?.name}</Button>
      </div>
    </div>
  );
}

function Run({ t }: { t: HostTournament }) {
  const { run, pending, error } = useAct(t.id);
  const [selected, setSelected] = useState<BracketMatch | null>(null);
  const [seeding, setSeeding] = useState<'random' | 'check_in'>('random');
  const hasBracket = t.bracket.rounds.length > 0;
  const started = t.bracket.rounds.some((r) => r.matches.some((m) => m.status === 'called' || (m.status === 'done' && !m.bye)));
  const n = t.checkedIn;
  const size = n >= 2 ? 2 ** Math.ceil(Math.log2(n)) : 0;

  // Keep the open panel in sync with fresh data.
  const all = useMemo(() => [...t.bracket.rounds.flatMap((r) => r.matches), ...(t.bracket.thirdPlace ? [t.bracket.thirdPlace] : [])], [t.bracket]);
  const current = selected ? all.find((m) => m.id === selected.id) ?? null : null;

  if (t.status === 'completed') {
    return (
      <div className="flex flex-col gap-5">
        <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
          {t.results.slice(0, 8).map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className={cn('w-24 text-caption font-bold', r.place === 1 ? 'text-amber-500' : 'text-text-secondary')}>{placeLabel(r.place)}</span>
              <span className="flex-1 font-semibold text-text-primary">{r.name}</span>
              <span className="font-data text-caption text-text-secondary">+{r.points}</span>
            </li>
          ))}
        </ol>
        <BracketView bracket={t.bracket} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <ErrorLine error={error} />
      {(!hasBracket || !started) && (
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
          <h3 className="font-heading text-h3 text-text-primary">{hasBracket ? 'Bracket ready' : 'Make the bracket'}</h3>
          <p className="text-body text-text-secondary">
            {n < 2
              ? 'Check in at least 2 players first. Only checked-in players go in the bracket.'
              : `${n} checked in → a bracket of ${size}${size > n ? ` with ${size - n} bye${size - n > 1 ? 's' : ''} (top seeds skip round 1)` : ''}. You can redraw until the first match is called.`}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" aria-pressed={seeding === 'random'} onClick={() => setSeeding('random')} className={cn('rounded-xl border px-3 py-2 text-caption font-bold', seeding === 'random' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary')}>
              Random draw
            </button>
            <button type="button" aria-pressed={seeding === 'check_in'} onClick={() => setSeeding('check_in')} className={cn('rounded-xl border px-3 py-2 text-caption font-bold', seeding === 'check_in' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary')}>
              In check-in order
            </button>
            <Button className="ml-auto" disabled={n < 2} isLoading={pending} onClick={() => run(() => makeBracket(t.id, seeding))}>
              <Shuffle className="mr-1.5 h-4 w-4" aria-hidden /> {hasBracket ? 'Redraw' : 'Make bracket'}
            </Button>
          </div>
        </div>
      )}

      {hasBracket && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="flex flex-col gap-2">
              <h3 className="text-overline uppercase text-error">Playing now ({t.bracket.nowPlaying.length}/{t.stations})</h3>
              {t.bracket.nowPlaying.length ? (
                t.bracket.nowPlaying.map((m) => (
                  <button key={m.id} type="button" onClick={() => setSelected(m)} className="flex items-center gap-3 rounded-2xl border border-error/40 bg-card p-3 text-left hover:border-error">
                    <span className="flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl bg-error text-white">
                      <span className="text-[9px] font-bold leading-none">STN</span>
                      <span className="font-data text-body font-bold leading-none">{m.station ?? '–'}</span>
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-text-primary">{m.a?.name} vs {m.b?.name}</span>
                    <span className="text-caption font-bold text-primary">Score</span>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-4 text-caption text-text-secondary">No match on. Call one from Up next.</p>
              )}
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-overline uppercase text-text-secondary">Up next</h3>
              {t.bracket.upNext.length ? (
                t.bracket.upNext.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-text-primary">{m.a?.name} vs {m.b?.name}</span>
                      <span className="text-caption text-text-secondary">{m.name}</span>
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => setSelected(m)}><Play className="mr-1 h-3.5 w-3.5" aria-hidden /> Open</Button>
                  </div>
                ))
              ) : (
                <p className="rounded-2xl border border-dashed border-border p-4 text-caption text-text-secondary">Waiting on results from the current round.</p>
              )}
            </section>
          </div>

          {current && <ScorePanel key={current.id} t={t} m={current} onDone={() => setSelected(null)} />}

          <section className="flex flex-col gap-2">
            <h3 className="text-overline uppercase text-text-secondary">Bracket · tap a match to score or correct it</h3>
            <BracketView bracket={t.bracket} onSelect={setSelected} selectedId={current?.id} />
          </section>
        </>
      )}
    </div>
  );
}

/* ── Page ─────────────────────────────────────────────────────── */

export function ManageTournament({ id, base }: { id: string; base: string }) {
  const justPublished = useSearchParams().get('published') === '1';
  const { data: t, isLoading, isError, refetch } = useQuery({
    queryKey: ['host-tournament', id],
    queryFn: () => getHostTournament(id),
    refetchInterval: (q) => (q.state.data && ['published', 'live'].includes(q.state.data.status) ? 20_000 : false),
  });
  const [tab, setTab] = useState<Tab>('overview');
  const initialised = useRef(false);

  useEffect(() => {
    if (!t || initialised.current) return;
    initialised.current = true;
    if (t.status === 'live') setTab('run');
    else if (t.status === 'published' && Date.now() >= new Date(t.checkInOpensAt).getTime()) setTab('checkin');
  }, [t]);

  if (isLoading) return <Skeleton className="h-[36rem] rounded-2xl" />;
  if (isError || !t) return <ErrorState onRetry={() => refetch()} />;

  const phase = t.status === 'draft' ? PHASE.draft : PHASE[t.phase];
  const tabs: { key: Tab; label: string; badge?: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'players', label: t.teamSize > 1 ? 'Teams' : 'Players', badge: String(t.taken) },
    { key: 'checkin', label: 'Check-in', badge: t.checkedIn ? String(t.checkedIn) : undefined },
    { key: 'run', label: t.status === 'completed' ? 'Results' : 'Bracket & run' },
  ];

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5 pb-16">
      <Link href={base} className="inline-flex w-fit items-center gap-1 text-caption font-semibold text-text-secondary hover:text-text-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All tournaments
      </Link>
      {justPublished && t.status === 'published' && (
        <p role="status" className="rounded-2xl bg-success/10 p-4 text-body font-semibold text-success">
          Published. Share the link below to start filling spots.
        </p>
      )}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: t.game.colour }} aria-hidden />
            <span className="text-caption font-semibold text-text-secondary">{t.game.name} · {t.cafe?.name}</span>
            <span className={cn('rounded-full px-2 py-0.5 text-caption font-bold', phase.tone)}>{phase.label}</span>
          </div>
          <h1 className="font-heading text-h1 text-text-primary [text-wrap:balance]">{t.title}</h1>
          <p className="text-body text-text-secondary">{fmtWhen(t.startsAt)} · {feeLabel(t)}</p>
        </div>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-border" role="tablist">
        {tabs.map((x) => (
          <button
            key={x.key}
            role="tab"
            type="button"
            aria-selected={tab === x.key}
            onClick={() => setTab(x.key)}
            className={cn(
              '-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-body font-semibold transition',
              tab === x.key ? 'border-primary text-primary' : 'border-transparent text-text-secondary hover:text-text-primary',
            )}
          >
            {x.label}
            {x.badge && <span className="rounded-full bg-surface px-1.5 font-data text-[11px] text-text-secondary">{x.badge}</span>}
          </button>
        ))}
      </nav>

      {tab === 'overview' && <Overview t={t} base={base} go={setTab} />}
      {tab === 'players' && <Players t={t} />}
      {tab === 'checkin' && <CheckIn t={t} />}
      {tab === 'run' && <Run t={t} />}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Check, Copy, Download, ExternalLink, Search, Shuffle, Users } from 'lucide-react';
import { getBracket, type Bracket, type BracketMatch } from '@/lib/api/challenges';
import { adminTeams, downloadTeamsCsv, type DeskTeam, type Member, type TeamDesk } from '@/lib/api/teamChallenges';

type Tab = 'teams' | 'solos' | 'waitlist' | 'checkin' | 'draw' | 'removed';

const btn = 'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-border bg-card px-3 text-caption font-semibold text-text-primary hover:bg-surface disabled:opacity-50';
const btnPrimary = 'inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-caption font-semibold text-white hover:bg-primary/90 disabled:opacity-50';
const input = 'h-10 rounded-xl border border-border bg-card px-3 text-body-sm text-text-primary';

function rupees(n: number) {
  return `₹${n.toLocaleString('en-IN')}`;
}

/** The team challenge desk: teams, solos, waitlist, refunds, check-in, draw, times, results. */
export default function TeamDeskPage() {
  const { id } = useParams<{ id: string }>();
  const [desk, setDesk] = useState<TeamDesk | null>(null);
  const [bracket, setBracket] = useState<Bracket | null>(null);
  const [tab, setTab] = useState<Tab>('teams');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await adminTeams.desk(id);
      setDesk(d);
      if (d.challenge.drawnAt) setBracket(await getBracket(d.challenge.slug));
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || 'Could not load the desk.' });
    }
  }, [id]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'teams' in (r as object) && 'stats' in (r as object)) setDesk(r as TeamDesk);
      await load();
      setMsg({ ok: true, text: done });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message || 'That didn’t work.' });
    } finally {
      setBusy(null);
    }
  };

  if (!desk) return <div className="p-6 text-text-secondary">{msg?.text ?? 'Loading the desk…'}</div>;
  const { stats, challenge: c, money } = desk;

  const tabs: [Tab, string][] = [
    ['teams', `Teams ${stats.teams}/${stats.maxTeams}`],
    ['solos', `Solos ${desk.solos.filter((s) => s.status === 'active').length}`],
    ['waitlist', `Waitlist ${desk.waitlist.length + stats.solosWaitlist}`],
    ['checkin', 'Check-in'],
    ['draw', c.drawnAt ? 'Bracket & results' : 'Draw'],
    ['removed', `Removed ${desk.removed.length}`],
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/admin/challenges/${id}`} className="text-caption font-semibold text-text-secondary hover:text-text-primary">← Challenge</Link>
      </div>
      <h1 className="mt-2 font-heading text-h3 font-bold text-text-primary">{c.title}: team desk</h1>
      <p className="text-body-sm text-text-secondary">{c.cafe} · {new Date(c.startsAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} · status {c.status}</p>

      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Stat label="Paid teams" value={`${stats.teams} / ${stats.maxTeams}`} />
        <Stat label="Paying now (held)" value={String(stats.holding)} />
        <Stat label="Solos without team" value={String(stats.solosWaiting)} />
        <Stat label="Waitlist teams" value={String(stats.waitlistTeams)} />
        <Stat label="Money in" value={`${rupees(money.paid)}${money.refunded ? ` (−${rupees(money.refunded)})` : ''}`} />
      </dl>
      {stats.teams < desk.config.minTeams && (
        <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-body-sm text-text-primary">
          {desk.config.minTeams - stats.teams} more teams needed for the minimum of {desk.config.minTeams}. Below that, cancel and refund everyone (bottom of Teams).
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => downloadTeamsCsv(id, c.slug)}><Download className="h-4 w-4" /> CSV</button>
        <a className={btn} href={`/challenge/${c.slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Public page</a>
        <a className={btn} href={`/challenge/${c.slug}/bracket?projector=1`} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /> Projector</a>
      </div>

      <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-border" aria-label="Desk sections">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`min-h-[44px] whitespace-nowrap border-b-2 px-3 text-body-sm font-semibold ${tab === t ? 'border-primary text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>
            {label}
          </button>
        ))}
      </nav>

      {msg && <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-body-sm ${msg.ok ? 'bg-success/10 text-text-primary' : 'bg-error/10 text-error'}`}>{msg.text}</p>}

      <div className="mt-4">
        {tab === 'teams' && (
          <>
            <TeamList list={desk.teams} empty="No paid teams yet." render={(t) => (
              <TeamActions t={t} slug={c.slug} busy={busy} onRefund={(reason) => act(`r${t.id}`, () => adminTeams.refundTeam(id, t.id, reason), `Refunded ${t.name}.`)} />
            )} />
            <CancelAll busy={busy === 'cancel'} onCancel={(reason) => act('cancel', () => adminTeams.cancelAll(id, reason), 'Challenge cancelled. Refunds sent.')} />
          </>
        )}
        {tab === 'solos' && <Solos desk={desk} busy={busy} act={act} id={id} />}
        {tab === 'waitlist' && (
          <>
            <TeamList list={desk.waitlist} empty="No teams on the waitlist." render={(t) => (
              <button type="button" className={t.offered ? btn : btnPrimary} disabled={busy === `o${t.id}` || (!t.offered && stats.spotsLeft <= 0)}
                onClick={() => act(`o${t.id}`, () => adminTeams.offer(id, t.id, !t.offered), t.offered ? 'Offer taken back.' : `Offered a slot to ${t.name}. Message the captain to pay on “My entry”.`)}>
                {t.offered ? 'Take back offer' : 'Offer slot'}
              </button>
            )} />
            {desk.solos.filter((s) => s.status === 'waitlist').length > 0 && (
              <div className="mt-4">
                <h2 className="text-body font-bold text-text-primary">Solos on the waitlist</h2>
                <ul className="mt-2 flex flex-col gap-1">
                  {desk.solos.filter((s) => s.status === 'waitlist').map((s) => <li key={s.id} className="text-body-sm text-text-primary">{s.fullName} · {s.riotId} · {s.phone}</li>)}
                </ul>
              </div>
            )}
          </>
        )}
        {tab === 'checkin' && <CheckinDesk desk={desk} busy={busy} onToggle={(pid, present) => act(`c${pid}`, () => adminTeams.checkin(id, pid, present), present ? 'Checked in.' : 'Check-in undone.')} />}
        {tab === 'draw' && (
          <DrawDesk desk={desk} bracket={bracket} busy={busy}
            onDraw={(redo) => act('draw', () => adminTeams.draw(id, redo), 'Bracket drawn. Times and lobbies are set.')}
            onTime={(mid, at, lobby) => act(`t${mid}`, () => adminTeams.matchTime(id, mid, at, lobby), 'Time saved.')}
            onResult={(mid, w, games) => act(`s${mid}`, () => adminTeams.result(id, mid, w, games), 'Result saved.')} />
        )}
        {tab === 'removed' && <TeamList list={desk.removed} empty="Nobody removed." render={(t) => <span className="text-caption text-text-secondary">{t.refunded ? 'Refunded' : t.status}</span>} />}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2">
      <dt className="text-caption text-text-secondary">{label}</dt>
      <dd className="text-body font-bold tabular-nums text-text-primary">{value}</dd>
    </div>
  );
}

function TeamList({ list, empty, render }: { list: DeskTeam[]; empty: string; render: (t: DeskTeam) => React.ReactNode }) {
  if (!list.length) return <p className="text-body-sm text-text-secondary">{empty}</p>;
  return (
    <ul className="flex flex-col gap-3">
      {list.map((t) => (
        <li key={t.id} className="rounded-2xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-body font-bold text-text-primary">
                #{t.number} {t.name}
                {t.kind === 'solo_group' && <span className="ml-2 rounded-full bg-surface px-2 py-0.5 text-caption font-semibold text-text-secondary">from solos</span>}
                {t.isTest && <span className="ml-2 rounded-full bg-warning/15 px-2 py-0.5 text-caption font-semibold">test</span>}
              </p>
              <p className="text-caption text-text-secondary">
                {t.players}/3 players{t.subs ? ` + ${t.subs} sub` : ''} · {t.paid ? `paid ${rupees(t.amount ?? 0)}` : t.refunded ? 'refunded' : 'not paid'}
                {t.checkedIn ? ` · ${t.checkedIn} checked in` : ''}{t.present ? ' · PRESENT' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">{render(t)}</div>
          </div>
          <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {t.members.map((m) => <MemberLine key={m.id} m={m} />)}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function MemberLine({ m }: { m: Member }) {
  const out = m.status !== 'active' && m.status !== 'waitlist';
  return (
    <li className={`rounded-xl bg-surface px-3 py-2 text-body-sm ${out ? 'opacity-50 line-through' : ''}`}>
      <span className="font-semibold text-text-primary">{m.fullName}</span>
      <span className="ml-1.5 text-caption text-text-secondary">{m.role}{m.checkedIn ? ' · ✓ in' : ''}</span>
      <span className="block text-caption text-text-secondary">
        {m.riotId} · {m.rank ?? '–'} · <a className="underline" href={`https://wa.me/${(m.phone ?? '').replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer">{m.phone}</a>
        {m.instagram ? ` · @${m.instagram}` : ''}{m.addedBy && m.addedBy !== 'self' ? ` · added by ${m.addedBy}` : ''}
      </span>
      <span className="block text-caption text-text-secondary">
        Community {m.tappedCommunity ? '✓' : '–'} · IG Khelo {m.tappedInstaKhelo ? '✓' : '–'} · IG venue {m.tappedInstaVenue ? '✓' : '–'}
      </span>
    </li>
  );
}

function TeamActions({ t, slug, busy, onRefund }: { t: DeskTeam; slug: string; busy: string | null; onRefund: (reason: string) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState(false);
  const link = t.inviteCode ? `${window.location.origin}/challenge/${slug}/invite/${t.inviteCode}` : null;
  return (
    <>
      {link && (
        <button type="button" className={btn} onClick={() => navigator.clipboard?.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} Invite link
        </button>
      )}
      {t.paid && !confirm && <button type="button" className={btn} onClick={() => setConfirm(true)}>Refund team</button>}
      {confirm && (
        <span className="flex flex-wrap items-center gap-2">
          <input className={input} placeholder="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          <button type="button" className={btnPrimary} disabled={!reason.trim() || busy === `r${t.id}`} onClick={() => onRefund(reason.trim())}>Refund {rupees(t.amount ?? 0)}</button>
          <button type="button" className={btn} onClick={() => setConfirm(false)}>No</button>
        </span>
      )}
    </>
  );
}

function CancelAll({ busy, onCancel }: { busy: boolean; onCancel: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [reason, setReason] = useState('');
  return (
    <div className="mt-8 rounded-2xl border border-error/40 p-4">
      <p className="text-body font-bold text-text-primary">Cancel the challenge</p>
      <p className="text-body-sm text-text-secondary">Refunds every payment in full and emails everyone. Use it if fewer than 8 teams joined.</p>
      {!open ? (
        <button type="button" className={`${btn} mt-3 text-error`} onClick={() => setOpen(true)}>Cancel and refund everyone</button>
      ) : (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input className={input} placeholder="Reason (in the email)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <input className={input} placeholder="Type CANCEL" value={word} onChange={(e) => setWord(e.target.value)} />
          <button type="button" className="inline-flex min-h-[40px] items-center rounded-xl bg-error px-3 text-caption font-semibold text-white disabled:opacity-50"
            disabled={word !== 'CANCEL' || !reason.trim() || busy} onClick={() => onCancel(reason.trim())}>Cancel challenge</button>
        </div>
      )}
    </div>
  );
}

function Solos({ desk, busy, act, id }: { desk: TeamDesk; busy: string | null; act: (k: string, fn: () => Promise<unknown>, done: string) => Promise<void>; id: string }) {
  const solos = desk.solos.filter((s) => s.status === 'active');
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [refundFor, setRefundFor] = useState<string | null>(null);
  const [reason, setReason] = useState('No team could be made');
  const short = desk.teams.filter((t) => t.players < desk.config.size);
  const toggle = (pid: string) => setPicked((p) => (p.includes(pid) ? p.filter((x) => x !== pid) : p.length >= desk.config.size ? p : [...p, pid]));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-sm text-text-secondary">
        Pick {desk.config.size} solos to make a team (it gets the next free slot), or put one solo into a team that is short.
        Solos left without a team get a full refund by 4 Dec, 10 AM.
      </p>
      {solos.length === 0 && <p className="text-body-sm text-text-secondary">No solo players waiting.</p>}
      <ul className="flex flex-col gap-2">
        {solos.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
            <input type="checkbox" className="h-5 w-5" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} aria-label={`Pick ${s.fullName}`} />
            <span className="min-w-0 flex-1 text-body-sm">
              <b className="text-text-primary">{s.fullName}</b> <span className="text-text-secondary">· {s.riotId} · {s.rank} · {s.playStyle ?? 'any style'} · {s.phone}</span>
            </span>
            {short.length > 0 && (
              <select className={input} defaultValue="" onChange={(e) => e.target.value && act(`p${s.id}`, () => adminTeams.placeSolo(id, s.id, e.target.value), `${s.fullName} added to the team.`)} aria-label="Put into a team">
                <option value="">Put into team…</option>
                {short.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.players}/{desk.config.size})</option>)}
              </select>
            )}
            {s.paid && refundFor !== s.id && <button type="button" className={btn} onClick={() => setRefundFor(s.id)}>Refund</button>}
            {refundFor === s.id && (
              <span className="flex gap-2">
                <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Reason" />
                <button type="button" className={btnPrimary} disabled={busy === `rs${s.id}`} onClick={() => act(`rs${s.id}`, () => adminTeams.refundSolo(id, s.id, reason), `Refunded ${s.fullName}.`)}>Refund ₹{desk.config.priceSolo}</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {solos.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <input className={input} placeholder="Team name (empty = Solo Squad N)" value={name} onChange={(e) => setName(e.target.value)} />
          <button type="button" className={btnPrimary} disabled={picked.length < 2 || busy === 'mk'}
            onClick={() => act('mk', () => adminTeams.makeTeam(id, picked, name.trim() || undefined), 'Team made from solos.').then(() => { setPicked([]); setName(''); })}>
            <Users className="h-4 w-4" /> Make a team of {picked.length}
          </button>
        </div>
      )}
    </div>
  );
}

function CheckinDesk({ desk, busy, onToggle }: { desk: TeamDesk; busy: string | null; onToggle: (pid: string, present: boolean) => void }) {
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return desk.teams
      .flatMap((t) => t.members.filter((m) => m.status === 'active').map((m) => ({ t, m })))
      .filter(({ t, m }) => !s || [t.name, m.fullName, m.riotId, m.phone ?? ''].some((v) => v.toLowerCase().includes(s)));
  }, [desk, q]);
  const present = desk.teams.filter((t) => t.present).length;
  return (
    <div>
      <p className="text-body-sm text-text-secondary">Scan a QR with the phone camera, or search here. A team counts as present when 2 players are in. {present}/{desk.teams.length} teams present.</p>
      <label className="relative mt-3 block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" aria-hidden />
        <input className={`${input} w-full pl-9`} placeholder="Name, team, Riot ID or phone" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
      </label>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map(({ t, m }) => (
          <li key={m.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-semibold text-text-primary">{m.fullName} <span className="font-normal text-text-secondary">· {m.role}</span></span>
              <span className="block truncate text-caption text-text-secondary">{t.name} · {m.riotId}</span>
            </span>
            <button type="button" disabled={busy === `c${m.id}`} onClick={() => onToggle(m.id, !m.checkedIn)}
              className={`min-h-[44px] min-w-[110px] rounded-xl px-3 text-caption font-bold ${m.checkedIn ? 'bg-success text-white' : 'border border-border bg-surface text-text-primary'}`}>
              {m.checkedIn ? '✓ Checked in' : 'Check in'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(new Date(iso).getTime() + 5.5 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

function fromLocalInput(v: string): string | null {
  return v ? `${v}:00+05:30` : null;
}

function DrawDesk({ desk, bracket, busy, onDraw, onTime, onResult }: {
  desk: TeamDesk; bracket: Bracket | null; busy: string | null;
  onDraw: (redo: boolean) => void;
  onTime: (mid: string, at: string | null, lobby: 'A' | 'B' | null) => void;
  onResult: (mid: string, winner: 'a' | 'b', games: { a: number | null; b: number | null }[]) => void;
}) {
  const drawn = !!desk.challenge.drawnAt;
  const [sure, setSure] = useState(false);
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-body font-bold text-text-primary">{drawn ? 'Bracket is drawn' : `Draw the bracket (${desk.stats.teams} paid teams)`}</p>
        <p className="text-body-sm text-text-secondary">
          Teams are shuffled into a 16-slot bracket; missing teams become byes. Times: 2 lobbies (A/B), first match 12:00.
          {desk.challenge.drawSeed != null && <> Seed: <b className="tabular-nums">{desk.challenge.drawSeed}</b> (saved, so the same draw can be shown again).</>}
        </p>
        {!drawn ? (
          <button type="button" className={`${btnPrimary} mt-3`} disabled={busy === 'draw' || desk.stats.teams < 2} onClick={() => onDraw(false)}><Shuffle className="h-4 w-4" /> Make the draw</button>
        ) : !sure ? (
          <button type="button" className={`${btn} mt-3`} onClick={() => setSure(true)}>Draw again…</button>
        ) : (
          <span className="mt-3 flex gap-2">
            <button type="button" className={btnPrimary} disabled={busy === 'draw'} onClick={() => { onDraw(true); setSure(false); }}>Yes, new draw</button>
            <button type="button" className={btn} onClick={() => setSure(false)}>No</button>
          </span>
        )}
      </div>

      {bracket?.rounds.map((r) => (
        <section key={r.round}>
          <h2 className="text-body font-bold text-text-primary">{r.name}</h2>
          <ul className="mt-2 flex flex-col gap-2">
            {r.matches.map((m) => <MatchRow key={m.id} m={m} busy={busy} onTime={onTime} onResult={onResult} />)}
          </ul>
        </section>
      ))}
    </div>
  );
}

function MatchRow({ m, busy, onTime, onResult }: {
  m: BracketMatch; busy: string | null;
  onTime: (mid: string, at: string | null, lobby: 'A' | 'B' | null) => void;
  onResult: (mid: string, winner: 'a' | 'b', games: { a: number | null; b: number | null }[]) => void;
}) {
  const [at, setAt] = useState(toLocalInput(m.startsAt));
  const [lobby, setLobby] = useState<string>(m.lobby ?? '');
  const n = m.bestOf > 1 ? 3 : 1;
  const [games, setGames] = useState<{ a: string; b: string }[]>(() =>
    Array.from({ length: n }, (_, i) => ({ a: m.games?.[i]?.a?.toString() ?? '', b: m.games?.[i]?.b?.toString() ?? '' })));
  useEffect(() => { setAt(toLocalInput(m.startsAt)); setLobby(m.lobby ?? ''); }, [m.startsAt, m.lobby]);

  if (m.bye) return <li className="rounded-xl bg-surface px-3 py-2 text-body-sm text-text-secondary">{m.a?.name ?? m.b?.name ?? '—'} · bye</li>;
  const both = m.a && m.b;
  const parsed = games.map((g) => ({ a: g.a === '' ? null : Number(g.a), b: g.b === '' ? null : Number(g.b) }));
  const wonA = parsed.filter((g) => g.a === 10 && (g.b ?? 0) < 10).length;
  const wonB = parsed.filter((g) => g.b === 10 && (g.a ?? 0) < 10).length;
  const need = n === 3 ? 2 : 1;
  const winner: 'a' | 'b' | null = wonA >= need ? 'a' : wonB >= need ? 'b' : null;

  return (
    <li className="rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-sm font-semibold text-text-primary">
          <span className={m.winner === 'a' ? 'text-success' : ''}>{m.a?.name ?? 'TBD'}</span> <span className="text-text-secondary">vs</span>{' '}
          <span className={m.winner === 'b' ? 'text-success' : ''}>{m.b?.name ?? 'TBD'}</span>
          <span className="ml-2 text-caption font-normal text-text-secondary">best of {m.bestOf}</span>
        </p>
        <span className="flex flex-wrap items-center gap-2">
          <input type="datetime-local" className={input} value={at} onChange={(e) => setAt(e.target.value)} aria-label="Start time (IST)" />
          <select className={input} value={lobby} onChange={(e) => setLobby(e.target.value)} aria-label="Lobby">
            <option value="">–</option><option value="A">A</option><option value="B">B</option>
          </select>
          <button type="button" className={btn} disabled={busy === `t${m.id}`} onClick={() => onTime(m.id, fromLocalInput(at), (lobby || null) as 'A' | 'B' | null)}>Save time</button>
        </span>
      </div>
      {both && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {games.map((g, i) => (
            <span key={i} className="flex items-center gap-1 text-caption text-text-secondary">
              {n > 1 && `G${i + 1}`}
              <input className={`${input} w-14 tabular-nums`} inputMode="numeric" value={g.a} aria-label={`Game ${i + 1} rounds ${m.a?.name}`} onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, a: e.target.value.replace(/\D/g, '').slice(0, 2) } : x)))} />
              –
              <input className={`${input} w-14 tabular-nums`} inputMode="numeric" value={g.b} aria-label={`Game ${i + 1} rounds ${m.b?.name}`} onChange={(e) => setGames(games.map((x, j) => (j === i ? { ...x, b: e.target.value.replace(/\D/g, '').slice(0, 2) } : x)))} />
            </span>
          ))}
          <button type="button" className={btnPrimary} disabled={!winner || busy === `s${m.id}`}
            onClick={() => winner && onResult(m.id, winner, parsed.filter((g) => g.a !== null || g.b !== null))}>
            {winner ? `Save: ${winner === 'a' ? m.a?.name : m.b?.name} wins` : 'Enter round scores (first to 10)'}
          </button>
        </div>
      )}
    </li>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, Check, Copy, Download, ExternalLink, Mail, ScanLine, Search, Shuffle, Users } from 'lucide-react';
import { getBracket, type Bracket, type BracketMatch } from '@/lib/api/challenges';
import { teamChallengeConfig } from '@/challenges';
import { Roster, TeamBracket, matchNumbers } from '@/components/challenge/team/TeamBracket';
import { adminTeams, downloadTeamsCsv, type DeskTeam, type Member, type TeamDesk } from '@/lib/api/teamChallenges';
import { FunnelPanel } from './FunnelPanel';
import { RefundNeeded } from './RefundNeeded';

type Tab = 'teams' | 'solos' | 'waitlist' | 'checkin' | 'draw' | 'rewards' | 'removed';

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
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.ok ? 4000 : 8000);
    return () => clearTimeout(t);
  }, [msg]);
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

  const act = async (key: string, fn: () => Promise<unknown>, done: string, quietCodes: string[] = []): Promise<string | null> => {
    setBusy(key);
    setMsg(null);
    try {
      const r = await fn();
      if (r && typeof r === 'object' && 'teams' in (r as object) && 'stats' in (r as object)) setDesk(r as TeamDesk);
      await load();
      setMsg({ ok: true, text: done });
      return null;
    } catch (e) {
      const code = (e as { code?: string }).code ?? 'ERROR';
      if (!quietCodes.includes(code)) setMsg({ ok: false, text: (e as Error).message || 'That didn’t work.' });
      return code;
    } finally {
      setBusy(null);
    }
  };

  if (!desk) return <div className="p-6 text-text-secondary">{msg?.text ?? 'Loading the desk…'}</div>;
  const { stats, challenge: c, money } = desk;
  // Count the same teams the challenge list counts: real ones plus practice ones.
  const practiceTeams = stats.teamsWithTest - stats.teams;
  const teamCount = stats.teamsWithTest;

  const tabs: [Tab, string][] = [
    ['teams', stats.maxTeams === null ? `Teams ${teamCount}` : `Teams ${teamCount}/${stats.maxTeams}`],
    ['solos', `Solos ${desk.solos.filter((s) => s.status === 'active').length}`],
    ['waitlist', `Waitlist ${desk.waitlist.length + stats.solosWaitlist}`],
    ['checkin', 'Check-in'],
    ['draw', c.drawnAt ? 'Bracket & results' : 'Draw'],
    ['rewards', 'Rewards'],
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
        <Stat label={practiceTeams > 0 ? `Teams (${practiceTeams} practice)` : 'Paid teams'} value={stats.maxTeams === null ? String(teamCount) : `${teamCount} / ${stats.maxTeams}`} />
        <Stat label="Paying now (held)" value={String(stats.holding)} />
        <Stat label="Solos without team" value={String(stats.solosWaiting)} />
        <Stat label="Waitlist teams" value={String(stats.waitlistTeams)} />
        <Stat label="Money in" value={`${rupees(money.paid)}${money.refunded ? ` (−${rupees(money.refunded)})` : ''}`} />
      </dl>
      {teamCount < desk.config.minTeams && (
        <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2 text-body-sm text-text-primary">
          {desk.config.minTeams - teamCount} more teams needed for the minimum of {desk.config.minTeams}. Below that, cancel and refund everyone (bottom of Teams).
        </p>
      )}

      <RefundNeeded
        rows={desk.refundNeeded}
        busy={busy}
        onResolve={(pid, refundId) => act(`rd${pid}`, () => adminTeams.resolveRefund(id, pid, refundId), 'Marked as refunded. Recorded in the audit log.')}
      />

      <FunnelPanel id={id} />

      {desk.practiceAllowed && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-primary/40 p-3">
          <p className="mr-auto text-body-sm text-text-primary">
            <b>Practice run (dev only).</b>{' '}
            {desk.practicePlayers > 0 ? `${desk.practicePlayers} practice players are in. Run the day, then clear them.` : 'Add made-up teams to rehearse check-in, the draw and rewards.'}
          </p>
          <button type="button" className={btnPrimary} disabled={busy === 'pfill'}
            onClick={() => act('pfill', () => adminTeams.fillPractice(id), 'Added 8 full teams, 1 team of 2 and 2 solo players.')}>Add practice teams</button>
          <button type="button" className={btn} disabled={busy === 'pclear' || desk.practicePlayers === 0}
            onClick={() => act('pclear', () => adminTeams.clearPractice(id), 'Practice teams removed.')}>Clear practice teams</button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={btn} onClick={() => downloadTeamsCsv(id, c.slug)}><Download className="h-4 w-4" /> CSV</button>
        <a className={`${btn} !bg-primary !text-white`} href={`/challenge/${c.slug}/scan`}><ScanLine className="h-4 w-4" /> Scan QR</a>
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

      {msg && (
        <p role="status" className={`fixed bottom-24 left-1/2 z-[400] w-max max-w-[92vw] -translate-x-1/2 rounded-xl px-4 py-2.5 text-body-sm font-semibold shadow-xl md:bottom-8 ${msg.ok ? 'bg-[#17141A] text-white' : 'bg-error text-white'}`}>
          {msg.text}
        </p>
      )}

      <div className="mt-4">
        {tab === 'teams' && (
          <>
            <NeedsAttention desk={desk} busy={busy} id={id} act={act} goSolos={() => setTab('solos')} />
            <TeamList list={desk.teams} empty="No paid teams yet." render={(t) => (
              <TeamActions t={t} slug={c.slug} busy={busy} onRefund={(reason) => act(`r${t.id}`, () => adminTeams.refundTeam(id, t.id, reason), `Refunded ${t.name}.`)} />
            )} />
            <CancelAll busy={busy === 'cancel'} onCancel={(reason) => act('cancel', () => adminTeams.cancelAll(id, reason), 'Challenge cancelled. Refunds sent.')} />
          </>
        )}
        {tab === 'solos' && <Solos desk={desk} busy={busy} act={act} id={id} />}
        {tab === 'rewards' && <RewardsDesk desk={desk} slug={c.slug} />}
        {tab === 'waitlist' && (
          <>
            <TeamList list={desk.waitlist} empty="No teams on the waitlist." render={(t) => (
              <button type="button" className={t.offered ? btn : btnPrimary} disabled={busy === `o${t.id}` || (!t.offered && (stats.spotsLeft ?? 1) <= 0)}
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
            onWin={(m, side) => act(`s${m.id}`, () => adminTeams.result(id, m.id, side, []), `${(side === 'a' ? m.a : m.b)?.name} won. Tap Undo if that was wrong.`)}
            onDraw={(redo, early) => act('draw', () => adminTeams.draw(id, redo, early), 'Bracket drawn. Times and lobbies are set.', ['SIGNUPS_OPEN'])}
            onTime={(mid, at, lobby) => act(`t${mid}`, () => adminTeams.matchTime(id, mid, at, lobby), 'Time saved.')}
            onResult={(mid, w, games) => act(`s${mid}`, () => adminTeams.result(id, mid, w, games), 'Result saved.')}
            onClear={(mid) => act(`c${mid}`, () => adminTeams.clearResult(id, mid), 'Result cleared. Enter it again.')} />
        )}
        {tab === 'removed' && <TeamList list={desk.removed} empty="Nobody removed." render={(t) => <span className="text-caption text-text-secondary">{t.refunded ? 'Refunded' : t.status}</span>} />}
      </div>
    </div>
  );
}

/** Who earned what. The amounts are for the admin only: the public pages say "rewards worth ₹5,000". */
function RewardsDesk({ desk, slug }: { desk: TeamDesk; slug: string }) {
  const cfg = teamChallengeConfig(slug);
  const r = desk.rewards;
  const [top, second] = cfg?.prizes ?? [];
  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <h2 className="text-body font-bold text-text-primary">Rewards (admin only)</h2>
      <p className="mt-1 text-body-sm text-text-secondary">
        Public pages say “exciting rewards worth {rupees(cfg?.prizeTotal ?? 0)}”. Nobody sees the split but you.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-3">
        <li className="rounded-xl bg-surface p-3"><span className="block text-caption text-text-secondary">Top team · {top ? rupees(top.cash) : ''}</span>
          <b className="text-text-primary">{r.ready && r.top ? r.top.name : 'After the final'}</b></li>
        <li className="rounded-xl bg-surface p-3"><span className="block text-caption text-text-secondary">Second team · {second ? rupees(second.cash) : ''}</span>
          <b className="text-text-primary">{r.ready && r.second ? r.second.name : 'After the final'}</b></li>
        <li className="rounded-xl bg-surface p-3"><span className="block text-caption text-text-secondary">Semi-finalists · Khelo coupons</span>
          <b className="text-text-primary">{r.ready && r.semis.length ? r.semis.map((t) => t.name).join(', ') : 'After the semi-finals'}</b></li>
      </ul>
      <p className="mt-3 text-body-sm text-text-secondary">
        {r.ready
          ? 'Pay the two cash rewards by hand and give the coupons from Khelo. Message each team captain from the Teams tab.'
          : 'This fills in by itself when the final has a result (Draw tab → Bracket & results).'}
      </p>
    </section>
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
                {t.players}/{t.size} players{t.subs ? ` + ${t.subs} sub` : ''} · {t.paid ? `paid ${rupees(t.amount ?? 0)}${t.paidAt ? ` on ${new Date(t.paidAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}` : t.refunded ? 'refunded' : 'not paid'}{t.captain?.email ? ` · ${t.captain.email}` : ''}
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
        {m.instagram ? ` · @${m.instagram}` : ''}{m.college ? ` · ${m.college}` : ''}{m.playStyle ? ` · ${m.playStyle}` : ''}{m.email ? ` · ${m.email}` : ''}{m.addedBy && m.addedBy !== 'self' ? ` · added by ${m.addedBy}` : ''}
      </span>
      <span className="block text-caption text-text-secondary">
        Community {m.tappedCommunity ? '✓' : '–'} · IG Khelo {m.tappedInstaKhelo ? '✓' : '–'} · IG venue {m.tappedInstaVenue ? '✓' : '–'}
      </span>
    </li>
  );
}

function ago(iso: string | null) {
  if (!iso) return null;
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000);
  return h < 1 ? 'just now' : h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

/** Teams still short of players: who to chase, and what to do about each. */
function NeedsAttention({ desk, busy, id, act, goSolos }: {
  desk: TeamDesk; busy: string | null; id: string; goSolos: () => void;
  act: (key: string, fn: () => Promise<unknown>, done: string) => Promise<unknown>;
}) {
  const size = desk.config.size;
  const short = desk.teams.filter((t) => t.kind === 'team' && t.paid && t.players < size);
  const [refunding, setRefunding] = useState<string | null>(null);
  const [reason, setReason] = useState('Team did not get enough players');
  const waitingSolos = desk.solos.filter((x) => x.status === 'active' && x.paid).length;
  if (short.length === 0 && waitingSolos === 0) return null;
  return (
    <section className="mb-5 rounded-2xl border border-warning/50 bg-warning/10 p-4" aria-label="Teams that need attention">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-body font-bold text-text-primary">
          <AlertTriangle className="h-5 w-5 text-warning" aria-hidden />{' '}
          {short.length === 0 ? 'Solo players are waiting' : `${short.length} ${short.length === 1 ? 'team needs' : 'teams need'} more players`}
        </h2>
        {short.length > 0 && <button type="button" className={btnPrimary} disabled={busy === 'remind-all'}
          onClick={() => act('remind-all', () => adminTeams.remindCaptains(id), 'Reminder emails sent to the captains (a captain gets one every 6 hours at most).')}>
          <Mail className="h-4 w-4" /> Email all captains
        </button>}
      </div>
      {waitingSolos > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-card px-3 py-2 text-body-sm text-text-primary">
          <b>{waitingSolos} solo {waitingSolos === 1 ? 'player has' : 'players have'} no team yet.</b>
          Put them in a short team, group them into a new one, or refund them by 4 Dec, 10 AM.
          <button type="button" className={btn} onClick={goSolos}>Open Solos</button>
        </p>
      )}
      <p className="mt-1 text-body-sm text-text-secondary">
        Chase them by WhatsApp or email. Still short on match day? Place a paid solo player into the team, let them play a player short (a team is
        here once most of its players check in), or remove the team and refund it.
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {short.map((t) => (
          <li key={t.id} className="rounded-xl bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-body-sm text-text-primary">
                <b>#{t.number} {t.name}</b> · {t.players}/{size} players
                {t.captain && <> · captain {t.captain.name}</>}
                <span className="block text-caption text-text-secondary">
                  {t.lastRemindedAt ? `Last emailed ${ago(t.lastRemindedAt)}` : 'Not emailed yet'}
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                {t.captain && (
                  <a className={btn} target="_blank" rel="noopener noreferrer"
                    href={`https://wa.me/${t.captain.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hi ${t.captain.name.split(' ')[0]}, your team ${t.name} has ${t.players} of ${size} players for the Khelo Valorant challenge. Please send your teammate link so they can join.`)}`}>
                    WhatsApp captain
                  </a>
                )}
                <button type="button" className={btn} disabled={busy === `m${t.id}`}
                  onClick={() => act(`m${t.id}`, () => adminTeams.remindOne(id, t.id), `Emailed the captain of ${t.name}.`)}>
                  <Mail className="h-4 w-4" /> Email
                </button>
                <button type="button" className={btn} onClick={goSolos}>Place a solo</button>
                <button type="button" className={btn} onClick={() => setRefunding(refunding === t.id ? null : t.id)}>Remove &amp; refund</button>
              </div>
            </div>
            {refunding === t.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className={`${input} min-w-0 flex-1`} aria-label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button type="button" className={btnPrimary} disabled={!reason.trim() || busy === `r${t.id}`}
                  onClick={() => act(`r${t.id}`, () => adminTeams.refundTeam(id, t.id, reason.trim()), `Refunded ${t.name}.`).then(() => setRefunding(null))}>
                  Refund {rupees(t.amount ?? 0)}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
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
      <p className="text-body-sm text-text-secondary">Refunds every payment in full and emails everyone. Use it only if too few teams joined to run the day.</p>
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

function Solos({ desk, busy, act, id }: { desk: TeamDesk; busy: string | null; act: (k: string, fn: () => Promise<unknown>, done: string) => Promise<unknown>; id: string }) {
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
      <p className="text-body-sm text-text-secondary">Scan a QR with the phone camera, or search here. A team counts as present when most of its players are in (3 of 5). {present}/{desk.teams.length} teams present.</p>
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

function DrawDesk({ desk, bracket, busy, onWin, onDraw, onTime, onResult, onClear }: {
  desk: TeamDesk; bracket: Bracket | null; busy: string | null;
  onWin: (m: BracketMatch, side: 'a' | 'b') => Promise<string | null>;
  onDraw: (redo: boolean, early: boolean) => Promise<string | null>;
  onTime: (mid: string, at: string | null, lobby: 'A' | 'B' | null) => Promise<string | null>;
  onResult: (mid: string, winner: 'a' | 'b', games: { a: number | null; b: number | null }[]) => Promise<string | null>;
  onClear: (mid: string) => Promise<string | null>;
}) {
  const drawn = !!desk.challenge.drawnAt;
  const [sure, setSure] = useState(false);
  const [early, setEarly] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const picked = bracket?.rounds.flatMap((r) => r.matches).find((m) => m.id === pick) ?? null;
  const nos = bracket ? matchNumbers(bracket) : new Map<string, number>();
  const draw = async (redo: boolean, ok: boolean) => {
    const code = await onDraw(redo, ok);
    setEarly(code === 'SIGNUPS_OPEN');
    if (!code) setSure(false);
  };
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-body font-bold text-text-primary">{drawn ? 'Bracket is drawn' : `Draw the bracket (${desk.stats.teamsWithTest} teams)`}</p>
        <p className="text-body-sm text-text-secondary">
          Teams are shuffled into the bracket; empty spots become byes (that team goes straight to the next round).
          Times use 2 lobbies (A and B) from the first match.
          {desk.challenge.drawSeed != null && <> Seed: <b className="tabular-nums">{desk.challenge.drawSeed}</b>.</>}
        </p>
        {early ? (
          <div className="mt-3 rounded-xl bg-warning/10 p-3">
            <p className="text-body-sm font-semibold text-text-primary">Sign-ups are still open. Drawing now closes them for everyone. Draw anyway?</p>
            <span className="mt-2 flex gap-2">
              <button type="button" className={btnPrimary} disabled={busy === 'draw'} onClick={() => draw(drawn, true)}>Yes, close sign-ups and draw</button>
              <button type="button" className={btn} onClick={() => setEarly(false)}>Not yet</button>
            </span>
          </div>
        ) : !drawn ? (
          <button type="button" className={`${btnPrimary} mt-3`} disabled={busy === 'draw' || desk.stats.teamsWithTest < 2} onClick={() => draw(false, false)}><Shuffle className="h-4 w-4" /> Make the draw</button>
        ) : !sure ? (
          <button type="button" className={`${btn} mt-3`} onClick={() => setSure(true)}>Draw again…</button>
        ) : (
          <span className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-body-sm text-text-secondary">A new draw replaces every match and time. Only before the first result.</span>
            <button type="button" className={btnPrimary} disabled={busy === 'draw'} onClick={() => draw(true, false)}>Yes, new draw</button>
            <button type="button" className={btn} onClick={() => setSure(false)}>No</button>
          </span>
        )}
      </div>

      {bracket?.drawn && (
        <>
          <div className="rounded-2xl border border-border bg-card p-4"><Roster b={bracket} tone="light" /></div>
          <div className="rounded-2xl border border-border bg-surface p-3 md:p-4">
            <p className="mb-3 text-body-sm text-text-secondary">
              <b className="text-text-primary">Tap the team that won.</b> Wrong team? Tap <b className="text-text-primary">Undo</b> on that match.
              The pencil changes the time, lobby or scores.
            </p>
            <TeamBracket b={bracket} tone="light" admin={{
              onWin: (m, side) => { void onWin(m, side); },
              onUndo: (m) => { void onClear(m.id); },
              onEdit: (m) => setPick(m.id),
              busy: busy && (busy.startsWith('s') || busy.startsWith('c')) ? busy.slice(1) : null,
            }} />
          </div>
        </>
      )}

      {picked && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/50 md:items-stretch md:justify-end" onClick={() => setPick(null)}>
          <div role="dialog" aria-modal="true" aria-label={`Match ${nos.get(picked.id)}`}
            className="max-h-[88vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-4 pb-8 shadow-2xl md:max-h-none md:w-[460px] md:rounded-none"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-caption font-semibold uppercase tracking-wider text-text-secondary">M{nos.get(picked.id)} · {picked.name}{picked.bestOf > 1 ? ' · best of 3' : ''}</p>
                <p className="mt-1 text-body font-bold text-text-primary">
                  #{picked.a?.number} {picked.a?.name} <span className="font-normal text-text-secondary">vs</span> #{picked.b?.number} {picked.b?.name}
                </p>
              </div>
              <button type="button" className={btn} onClick={() => setPick(null)}>Close</button>
            </div>
            <ul className="mt-3">
              <MatchRow key={`${picked.id}-${picked.winner ?? 'open'}`} m={picked} busy={busy} onTime={onTime}
                onResult={async (mid, w, games) => { if (!(await onResult(mid, w, games))) setPick(null); }} />
            </ul>
            {picked.winner && (
              <div className="mt-3 rounded-xl border border-border p-3">
                <p className="text-body-sm text-text-secondary">Typed the wrong result? Clear it and enter it again. Only possible while the next match has no result.</p>
                <button type="button" className={`${btn} mt-2`} disabled={busy === `c${picked.id}`} onClick={() => onClear(picked.id)}>Clear result</button>
              </div>
            )}
          </div>
        </div>
      )}
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
  // Walkover: a team didn't turn up in time (rule 13). Tap once to pick, tap again to confirm.
  const [walkover, setWalkover] = useState<'a' | 'b' | null>(null);

  if (m.bye) return <li className="rounded-xl bg-surface px-3 py-2 text-body-sm text-text-secondary">{m.a?.name ?? m.b?.name ?? '—'} · bye</li>;
  const both = m.a && m.b;
  const parsed = games.map((g) => ({ a: g.a === '' ? null : Number(g.a), b: g.b === '' ? null : Number(g.b) }));
  const gameTo = 5; // Swift Play: first to 5 rounds (matches backend gameTo)
  const wonA = parsed.filter((g) => g.a === gameTo && (g.b ?? 0) < gameTo).length;
  const wonB = parsed.filter((g) => g.b === gameTo && (g.a ?? 0) < gameTo).length;
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
            {winner ? `Save: ${winner === 'a' ? m.a?.name : m.b?.name} wins` : `Enter round scores (first to ${gameTo})`}
          </button>
        </div>
      )}
      {both && !m.winner && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-text-secondary">
          <span>Team didn’t show?</span>
          {(['a', 'b'] as const).map((side) => {
            const name = side === 'a' ? m.a?.name : m.b?.name;
            const armed = walkover === side;
            return (
              <button key={side} type="button" className={armed ? btnPrimary : btn} disabled={busy === `s${m.id}`}
                onClick={() => {
                  if (!armed) return setWalkover(side);
                  setWalkover(null);
                  onResult(m.id, side, []);
                }}>
                {armed ? `Tap again: ${name} wins by walkover` : `Walkover to ${name}`}
              </button>
            );
          })}
          {walkover && <button type="button" className={btn} onClick={() => setWalkover(null)}>Cancel</button>}
        </div>
      )}
    </li>
  );
}

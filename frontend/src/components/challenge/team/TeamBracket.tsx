'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Crown, Pencil, Swords, Undo2 } from 'lucide-react';
import type { Bracket, BracketMatch, BracketSide } from '@/lib/api/challenges';
import { fightFont } from '@/components/challenge/ChallengeHero';

/**
 * The team bracket, one component for the public page, the projector and the admin desk.
 * - Every team carries its number (#1..N, fixed at the draw) so it can be found at a glance.
 * - PC: a real tree, rounds left to right, lines joining each match to the next.
 * - Phone: round tabs (opens on the round being played) with big match cards.
 * - Byes never get a full card: the team shows on its next match with a "bye" tag.
 * - Winner: bold with a red edge and a tick. Loser: dimmed and struck through.
 * Admin passes `admin`: tap a team to make it the winner, Undo to take it back, Edit for time/lobby/scores.
 */

type Side = BracketSide & { number?: number | null; withdrawn?: boolean };
export interface AdminActions {
  onWin: (m: BracketMatch, side: 'a' | 'b') => void;
  onUndo: (m: BracketMatch) => void;
  onEdit: (m: BracketMatch) => void;
  busy?: string | null;
}
type Tone = 'dark' | 'light';

const TONES = {
  dark: {
    card: 'bg-[#15121A] border-[#2A2430]', cardReady: 'border-[#D0463C] shadow-[0_0_0_1px_#D0463C,0_0_24px_-6px_#D0463C]',
    text: 'text-[#F4F1EC]', muted: 'text-[#8E8794]', faint: 'text-[#5E5864]', line: '#3A3340', lineWin: '#D0463C',
    badge: 'bg-[#2A2430] text-[#F4F1EC]', badgeWin: 'bg-[#D0463C] text-white', winRow: 'bg-[#D0463C]/12',
    tab: 'bg-[#15121A] text-[#B4B0B8] border-[#2A2430]', tabOn: 'bg-[#F4F1EC] text-[#0A0809] border-[#F4F1EC]',
    chip: 'border-[#2A2430] bg-[#15121A]', ghost: 'border-[#2A2430] text-[#8E8794]', gold: 'text-[#F2C94C]',
  },
  light: {
    card: 'bg-white border-[#E2DDD6]', cardReady: 'border-[#D0463C] shadow-[0_0_0_1px_#D0463C]',
    text: 'text-[#17141A]', muted: 'text-[#6B6570]', faint: 'text-[#A49EA8]', line: '#D5CFC8', lineWin: '#D0463C',
    badge: 'bg-[#EFEBE5] text-[#17141A]', badgeWin: 'bg-[#D0463C] text-white', winRow: 'bg-[#D0463C]/8',
    tab: 'bg-white text-[#6B6570] border-[#E2DDD6]', tabOn: 'bg-[#17141A] text-white border-[#17141A]',
    chip: 'border-[#E2DDD6] bg-white', ghost: 'border-[#E2DDD6] text-[#6B6570]', gold: 'text-[#B8860B]',
  },
};

const time = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : null;

/** Match numbers M1, M2… in playing order (round, then position); byes get none. */
export function matchNumbers(b: Bracket): Map<string, number> {
  const out = new Map<string, number>();
  let n = 0;
  for (const r of b.rounds) for (const m of r.matches) if (!m.bye) out.set(m.id, ++n);
  return out;
}

type RosterState = 'in' | 'out' | 'top' | 'second' | 'withdrawn';
export interface RosterTeam { number: number; name: string; entryId: string; state: RosterState }

/** Every team in number order, with where it stands now. */
export function roster(b: Bracket): RosterTeam[] {
  const seen = new Map<string, RosterTeam>();
  const all = b.rounds.flatMap((r) => r.matches);
  for (const m of all) {
    for (const s of [m.a, m.b] as (Side | null)[]) {
      if (s && !seen.has(s.entryId)) seen.set(s.entryId, { number: s.number ?? 0, name: s.name, entryId: s.entryId, state: s.withdrawn ? 'withdrawn' : 'in' });
    }
  }
  for (const m of all) {
    if (m.bye || !m.winner || !m.a || !m.b) continue;
    const loser = m.winner === 'a' ? m.b : m.a;
    const t = seen.get(loser.entryId);
    if (t && t.state === 'in') t.state = 'out';
  }
  const final = b.rounds[b.rounds.length - 1]?.matches[0];
  if (final?.winner && final.a && final.b) {
    const top = final.winner === 'a' ? final.a : final.b;
    const second = final.winner === 'a' ? final.b : final.a;
    const t1 = seen.get(top.entryId); if (t1) t1.state = 'top';
    const t2 = seen.get(second.entryId); if (t2) t2.state = 'second';
  }
  return Array.from(seen.values()).sort((x, y) => x.number - y.number);
}

function scoreOf(m: BracketMatch, side: 'a' | 'b'): string | null {
  if (!m.winner) return null;
  if (m.bestOf === 1 && m.games?.length) return String(side === 'a' ? m.games[0].a ?? '' : m.games[0].b ?? '');
  const v = side === 'a' ? m.scoreA : m.scoreB;
  return v == null ? null : String(v);
}

function feederNo(b: Bracket, m: BracketMatch, side: 'a' | 'b', nos: Map<string, number>): string {
  const prev = b.rounds[m.round - 1]?.matches.find((x) => x.position === m.position * 2 + (side === 'a' ? 0 : 1));
  const no = prev ? nos.get(prev.id) : undefined;
  return no ? `Waiting for M${no}` : 'To be decided';
}

function TeamRow({ s, won, lost, score, tbd, byeIn, tone, big, onWin }: {
  s: Side | null; won: boolean; lost: boolean; score: string | null; tbd: string; byeIn: boolean; tone: Tone; big: boolean;
  onWin?: () => void;
}) {
  const t = TONES[tone];
  const Tag = onWin ? 'button' : 'div';
  return (
    <Tag
      {...(onWin ? { type: 'button' as const, onClick: onWin, 'aria-label': `${s?.name} won` } : {})}
      className={`group flex w-full items-center gap-2 px-2.5 text-left ${big ? 'h-11' : 'h-9'} ${won ? t.winRow : ''} ${onWin ? 'cursor-pointer hover:bg-[#D0463C]/10 active:bg-[#D0463C]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#D0463C]' : ''}`}>
      <span
        className={`${fightFont.className} inline-flex shrink-0 items-center justify-center rounded-md font-bold tabular-nums ${big ? 'h-7 min-w-[34px] text-[20px]' : 'h-6 min-w-[28px] text-[17px]'} ${s ? (won ? t.badgeWin : t.badge) : `border border-dashed ${t.ghost}`}`}
        aria-label={s?.number ? `Team ${s.number}` : undefined}
      >
        {s?.number ?? '–'}
      </span>
      <span
        title={s?.name}
        className={`min-w-0 flex-1 truncate ${big ? 'text-[17px]' : 'text-[14px]'} ${!s ? `italic ${t.faint}` : won ? `font-bold ${t.text}` : lost ? `${t.faint} line-through` : `font-semibold ${t.text}`} ${s?.withdrawn ? 'line-through' : ''}`}
      >
        {s ? s.name : tbd}
      </span>
      {s?.withdrawn && <span className="shrink-0 rounded bg-[#D0463C]/15 px-1.5 text-[10px] font-bold uppercase text-[#D0463C]">Withdrawn</span>}
      {byeIn && !s?.withdrawn && <span className={`shrink-0 rounded border px-1.5 text-[10px] font-bold uppercase ${t.ghost}`}>bye</span>}
      {score != null && <span className={`${fightFont.className} shrink-0 tabular-nums ${big ? 'text-[22px]' : 'text-[19px]'} ${won ? `font-bold ${t.text}` : t.faint}`}>{score}</span>}
      {won && <Check className={`shrink-0 text-[#D0463C] ${big ? 'h-5 w-5' : 'h-4 w-4'}`} aria-label="Won" />}
      {onWin && <span className="shrink-0 rounded-md border border-[#D0463C]/50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#D0463C] opacity-70 group-hover:bg-[#D0463C] group-hover:text-white group-hover:opacity-100">Won?</span>}
    </Tag>
  );
}

function MatchCard({ b, m, nos, tone, upNext, admin, big = false, width }: {
  b: Bracket; m: BracketMatch; nos: Map<string, number>; tone: Tone; upNext: boolean;
  admin?: AdminActions; big?: boolean; width?: number;
}) {
  const t = TONES[tone];
  const prevRound = b.rounds[m.round - 1]?.matches ?? [];
  const cameByBye = (side: 'a' | 'b') =>
    m.round === 1 && !!prevRound.find((x) => x.position === m.position * 2 + (side === 'a' ? 0 : 1))?.bye;
  const playable = !!(m.a && m.b);
  const canWin = !!admin && playable && !m.winner && admin.busy !== m.id;
  const win = (side: 'a' | 'b') => (canWin ? () => admin!.onWin(m, side) : undefined);
  const head = [`M${nos.get(m.id) ?? ''}`, time(m.startsAt), m.lobby ? `Lobby ${m.lobby}` : null, m.bestOf > 1 ? 'Best of 3' : null]
    .filter(Boolean).join(' · ');
  const body: ReactNode = (
    <>
      <div className={`flex items-center justify-between gap-2 px-2.5 pt-1.5 ${big ? 'text-[12px]' : 'text-[10.5px]'} font-semibold uppercase tracking-[0.08em] ${t.muted}`}>
        <span className="truncate">{head}</span>
        {upNext && !m.winner && !admin && <span className="shrink-0 rounded-full bg-[#D0463C] px-2 py-0.5 text-[10px] font-bold text-white">UP NEXT</span>}
        {admin && playable && (
          <span className="flex shrink-0 items-center gap-1 normal-case tracking-normal">
            {m.winner && (
              <button type="button" onClick={() => admin.onUndo(m)} disabled={admin.busy === m.id}
                className="inline-flex h-6 items-center gap-1 rounded-md bg-[#D0463C] px-2 text-[11px] font-bold text-white hover:bg-[#B83A31] disabled:opacity-50">
                <Undo2 className="h-3.5 w-3.5" aria-hidden /> Undo
              </button>
            )}
            <button type="button" onClick={() => admin.onEdit(m)} aria-label={`Edit match ${nos.get(m.id)}: time, lobby, scores`}
              className={`inline-flex h-6 w-6 items-center justify-center rounded-md border ${t.ghost} hover:opacity-80`}>
              <Pencil className="h-3 w-3" aria-hidden />
            </button>
          </span>
        )}
      </div>
      <TeamRow s={m.a as Side | null} won={m.winner === 'a'} lost={m.winner === 'b'} score={scoreOf(m, 'a')} tbd={feederNo(b, m, 'a', nos)} byeIn={cameByBye('a')} tone={tone} big={big} onWin={win('a')} />
      <div className={`mx-2.5 h-px ${tone === 'dark' ? 'bg-[#2A2430]' : 'bg-[#EFEBE5]'}`} />
      <TeamRow s={m.b as Side | null} won={m.winner === 'b'} lost={m.winner === 'a'} score={scoreOf(m, 'b')} tbd={feederNo(b, m, 'b', nos)} byeIn={cameByBye('b')} tone={tone} big={big} onWin={win('b')} />
    </>
  );
  const cls = `block w-full overflow-hidden rounded-xl border pb-1 text-left transition ${t.card} ${upNext && !m.winner ? t.cardReady : ''} ${admin?.busy === m.id ? 'opacity-60' : ''}`;
  return <div className={cls} style={width ? { width } : undefined}>{body}</div>;
}

/** PC tree. Geometry is computed, so every line meets its card exactly. */
function Tree({ b, tone, admin, big = false }: { b: Bracket; tone: Tone; admin?: AdminActions; big?: boolean }) {
  const t = TONES[tone];
  const nos = useMemo(() => matchNumbers(b), [b]);
  const upNextId = b.upNext?.id;
  const W = big ? 280 : 236, H = big ? 108 : 92, GAP = big ? 18 : 14, COL = big ? 60 : 44, HEAD = 34, GHOST = 30;
  const n0 = b.rounds[0]?.matches.length ?? 0;
  const slot = H + GAP;
  const height = n0 * slot;
  const x = (r: number) => r * (W + COL);
  const cy = (r: number, p: number) => HEAD + (p + 0.5) * 2 ** r * slot;
  const width = b.rounds.length * W + (b.rounds.length - 1) * COL;

  const paths: { d: string; win: boolean; dashed: boolean }[] = [];
  for (const r of b.rounds.slice(0, -1)) {
    for (const m of r.matches) {
      const x1 = x(r.round) + W, y1 = cy(r.round, m.position);
      const x2 = x(r.round + 1), y2 = cy(r.round + 1, Math.floor(m.position / 2));
      const xm = x1 + COL / 2;
      paths.push({ d: `M${x1} ${y1} H${xm} V${y2} H${x2}`, win: !!m.winner && !m.bye, dashed: m.bye });
    }
  }

  return (
    <div className="relative" style={{ width, height: height + HEAD }}>
      <svg className="pointer-events-none absolute inset-0" width={width} height={height + HEAD} aria-hidden>
        {paths.map((p, i) => (
          <path key={i} d={p.d} fill="none" stroke={p.win ? t.lineWin : t.line} strokeWidth={p.win ? 2 : 1.5} strokeDasharray={p.dashed ? '4 4' : undefined} />
        ))}
      </svg>
      {b.rounds.map((r) => (
        <div key={r.round} className="absolute top-0" style={{ left: x(r.round), width: W }}>
          <p className={`${fightFont.className} text-[20px] font-bold uppercase leading-none tracking-[0.06em] ${t.text}`}>
            {r.name}
            <span className={`ml-2 font-sans text-[11px] font-semibold normal-case tracking-normal ${t.muted}`}>
              {r.matches.filter((m) => !m.bye && m.winner).length}/{r.matches.filter((m) => !m.bye).length} played
            </span>
          </p>
        </div>
      ))}
      {b.rounds.map((r) =>
        r.matches.map((m) => {
          const top = cy(r.round, m.position);
          if (m.bye) {
            const s = (m.a ?? m.b) as Side | null;
            return (
              <div key={m.id} className={`absolute flex items-center gap-2 rounded-lg border border-dashed px-2.5 text-[12.5px] ${t.ghost}`}
                style={{ left: x(r.round), top: top - GHOST / 2, width: W, height: GHOST }}>
                <span className={`${fightFont.className} text-[16px] font-bold`}>{s?.number ?? ''}</span>
                <span className="min-w-0 flex-1 truncate">{s?.name}</span>
                <span className="text-[10px] font-bold uppercase">bye →</span>
              </div>
            );
          }
          return (
            <div key={m.id} className="absolute" style={{ left: x(r.round), top: top - H / 2, width: W }}>
              <MatchCard b={b} m={m} nos={nos} tone={tone} upNext={m.id === upNextId} admin={admin} big={big} />
            </div>
          );
        }),
      )}
    </div>
  );
}

/** Phone: one round at a time, opening on the round being played. */
function Rounds({ b, tone, admin }: { b: Bracket; tone: Tone; admin?: AdminActions }) {
  const t = TONES[tone];
  const nos = useMemo(() => matchNumbers(b), [b]);
  const playing = b.upNext?.round ?? b.rounds.findIndex((r) => r.matches.some((m) => !m.bye && !m.winner));
  const [round, setRound] = useState(Math.max(playing, 0));
  useEffect(() => setRound(Math.max(playing, 0)), [playing]);
  const r = b.rounds[round] ?? b.rounds[0];
  const short = (name: string) => ({ 'Quarter-final': 'QF', 'Semi-final': 'Semis', Final: 'Final' } as Record<string, string>)[name] ?? name.replace('Round ', 'R');
  const byes = r.matches.filter((m) => m.bye);
  return (
    <div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Rounds">
        {b.rounds.map((x) => {
          const real = x.matches.filter((m) => !m.bye);
          const done = real.filter((m) => m.winner).length;
          return (
            <button key={x.round} type="button" role="tab" aria-selected={x.round === r.round} onClick={() => setRound(x.round)}
              className={`flex shrink-0 flex-col items-start rounded-xl border px-3.5 py-1.5 ${x.round === r.round ? t.tabOn : t.tab}`}>
              <span className={`${fightFont.className} text-[19px] font-bold uppercase leading-none`}>{short(x.name)}</span>
              <span className="text-[10.5px] font-semibold opacity-75">{done}/{real.length} played</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-2.5">
        {r.matches.filter((m) => !m.bye).map((m) => (
          <MatchCard key={m.id} b={b} m={m} nos={nos} tone={tone} upNext={m.id === b.upNext?.id} admin={admin} />
        ))}
        {byes.length > 0 && (
          <p className={`rounded-xl border border-dashed px-3 py-2 text-[13px] ${t.ghost}`}>
            <b>Byes (go straight to the next round):</b>{' '}
            {byes.map((m) => { const s = (m.a ?? m.b) as Side | null; return s ? `#${s.number ?? ''} ${s.name}` : ''; }).filter(Boolean).join(', ')}
          </p>
        )}
      </div>
    </div>
  );
}

/** All teams by number: who's still in, who's out, the top two. */
export function Roster({ b, tone }: { b: Bracket; tone: Tone }) {
  const t = TONES[tone];
  const list = roster(b);
  const left = list.filter((x) => x.state === 'in').length;
  const label: Record<RosterState, string> = { in: '', out: 'Out', top: 'Top team', second: 'Second team', withdrawn: 'Withdrawn' };
  return (
    <section aria-label="Teams by number">
      <p className={`text-[12px] font-bold uppercase tracking-[0.12em] ${t.muted}`}>
        {list.length} teams{left && left !== list.length ? ` · ${left} still in` : ''}
      </p>
      <ol className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1.5">
        {list.map((x) => (
          <li key={x.entryId} className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 ${t.chip} ${x.state === 'out' || x.state === 'withdrawn' ? 'opacity-50' : ''}`}>
            <span className={`${fightFont.className} inline-flex h-6 min-w-[28px] items-center justify-center rounded-md text-[17px] font-bold ${x.state === 'top' ? 'bg-[#F2C94C] text-[#1A1306]' : x.state === 'in' ? TONES[tone].badge : TONES[tone].badge}`}>{x.number}</span>
            <span className={`min-w-0 flex-1 truncate text-[13.5px] font-semibold ${t.text} ${x.state === 'out' || x.state === 'withdrawn' ? 'line-through' : ''}`} title={x.name}>{x.name}</span>
            {x.state === 'top' && <Crown className={`h-4 w-4 shrink-0 ${t.gold}`} aria-label="Top team" />}
            {label[x.state] && x.state !== 'top' && <span className={`shrink-0 text-[10px] font-bold uppercase ${t.muted}`}>{label[x.state]}</span>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Scales the tree to fit the screen; anything bigger than the screen scrolls. */
function FitToScreen({ children, min = 0.5, max = 1.6 }: { children: ReactNode; min?: number; max?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [s, setS] = useState(1);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const fit = () => {
      if (!outer.current || !inner.current) return;
      const w = inner.current.offsetWidth, h = inner.current.offsetHeight;
      const k = Math.max(min, Math.min(max, outer.current.clientWidth / w, outer.current.clientHeight / h));
      setS(k);
      setSize({ w: w * k, h: h * k });
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [min, max]);
  return (
    <div ref={outer} className="h-full w-full overflow-auto">
      <div style={{ width: size.w || undefined, height: size.h || undefined }}>
        <div ref={inner} style={{ transform: `scale(${s})`, transformOrigin: 'top left', width: 'max-content' }}>{children}</div>
      </div>
    </div>
  );
}

export function TeamBracket({ b, tone = 'dark', mode = 'page', admin }: {
  b: Bracket; tone?: Tone; mode?: 'page' | 'projector'; admin?: AdminActions;
}) {
  if (mode === 'projector') {
    return (
      <FitToScreen>
        <Tree b={b} tone={tone} big />
      </FitToScreen>
    );
  }
  return (
    <>
      <div className="md:hidden"><Rounds b={b} tone={tone} admin={admin} /></div>
      <div className="hidden overflow-x-auto pb-3 md:block"><Tree b={b} tone={tone} admin={admin} /></div>
    </>
  );
}

export function UpNextStrip({ b, tone = 'dark', big = false }: { b: Bracket; tone?: Tone; big?: boolean }) {
  const t = TONES[tone];
  const nos = matchNumbers(b);
  const list = b.ready.slice(0, big ? 3 : 2);
  if (!list.length) return null;
  const side = (s: BracketSide | null) => (s ? `#${(s as Side).number ?? ''} ${s.name}` : 'TBD');
  return (
    <div className={`grid gap-2 ${big ? 'grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
      {list.map((m, i) => (
        <div key={m.id} className={`min-w-0 rounded-xl border ${big ? 'px-[1.2vw] py-[1.2vh]' : 'px-3 py-2'} ${i === 0 ? 'border-[#D0463C] bg-[#D0463C]/10' : t.chip}`}>
          <p className={`flex items-center gap-1.5 font-bold uppercase tracking-wider ${big ? 'text-[min(1vw,1.7vh)]' : 'text-[11px]'} ${i === 0 ? 'text-[#E8675D]' : t.muted}`}>
            <Swords className={big ? 'h-[1.8vh] w-[1.8vh]' : 'h-3.5 w-3.5'} aria-hidden />
            {i === 0 ? 'Up next' : 'Then'} · M{nos.get(m.id)}{m.lobby ? ` · Lobby ${m.lobby}` : ''}{time(m.startsAt) ? ` · ${time(m.startsAt)}` : ''}
          </p>
          <p className={`mt-0.5 font-semibold leading-tight ${t.text} ${big ? 'text-[min(1.7vw,3vh)]' : 'text-[15px]'}`}>
            <span className="block truncate">{side(m.a)}</span>
            <span className={`block truncate ${big ? '' : ''}`}><span className={`${t.muted} font-normal`}>vs</span> {side(m.b)}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

'use client';

import { Trophy } from 'lucide-react';
import type { Bracket, BracketMatch, BracketSide } from '@/lib/api/challenges';

const MEDAL: Record<number, string> = { 1: '#F2C27A', 2: '#C9CBD3', 3: '#D79A6B' };
const PLACE: Record<number, string> = { 1: '1st', 2: '2nd', 3: '3rd' };

/** The bracket: one column per round, the 3rd-place match under the final.
 *  `onPick` makes matches tappable (the admin's result entry). */
export function BracketView({
  bracket,
  onPick,
  big = false,
}: {
  bracket: Bracket;
  onPick?: (m: BracketMatch) => void;
  big?: boolean;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {bracket.rounds.map((r, i) => {
        const last = i === bracket.rounds.length - 1;
        return (
          <div key={r.round} className={`flex flex-shrink-0 flex-col ${big ? 'w-[min(22vw,340px)]' : 'w-56'}`}>
            <p className={`mb-2 font-bold uppercase tracking-[0.14em] text-[#A3A6B1] ${big ? 'text-[min(1.3vw,2vh)]' : 'text-[11px]'}`}>
              {r.name}
            </p>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {r.matches.map((m) => (
                <MatchCard key={m.id} m={m} onPick={onPick} big={big} />
              ))}
              {last && bracket.thirdPlace && (
                <div className="mt-2">
                  <p className={`mb-2 font-bold uppercase tracking-[0.14em] text-[#A3A6B1] ${big ? 'text-[min(1.3vw,2vh)]' : 'text-[11px]'}`}>
                    3rd place
                  </p>
                  <MatchCard m={bracket.thirdPlace} onPick={onPick} big={big} />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MatchCard({ m, onPick, big }: { m: BracketMatch; onPick?: (m: BracketMatch) => void; big: boolean }) {
  const ready = !m.bye && m.a && m.b;
  const clickable = Boolean(onPick && ready);
  const body = (
    <>
      <Row side={m.a} won={m.winner === 'a'} lost={m.winner === 'b'} score={m.scoreA} big={big} bye={m.bye && !m.a} />
      <div className="h-px bg-[#262932]" />
      <Row side={m.b} won={m.winner === 'b'} lost={m.winner === 'a'} score={m.scoreB} big={big} bye={m.bye && !m.b} />
    </>
  );
  const cls = `block w-full overflow-hidden rounded-xl border text-left ${
    m.winner ? 'border-[#262932] bg-[#121318]' : ready ? 'border-[#3A3E4A] bg-[#16181E]' : 'border-dashed border-[#262932] bg-[#121318]'
  }`;
  return clickable ? (
    <button type="button" onClick={() => onPick?.(m)} className={`${cls} hover:border-[#E8675D]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Row({
  side, won, lost, score, big, bye,
}: { side: BracketSide | null; won: boolean; lost: boolean; score: number | null; big: boolean; bye: boolean }) {
  return (
    <div className={`flex items-center gap-2 ${big ? 'px-[1vw] py-[1vh]' : 'px-3 py-2'}`}>
      <span
        className={`flex-1 truncate ${big ? 'text-[min(1.7vw,2.8vh)]' : 'text-sm'} ${
          won ? 'font-bold text-[#F4F1EC]' : lost ? 'text-[#6B6E78] line-through decoration-1' : side ? 'text-[#DADCE3]' : 'text-[#6B6E78]'
        }`}
      >
        {side ? side.name : bye ? 'Bye' : 'To be decided'}
      </span>
      {score !== null && <span className={`tabular-nums ${big ? 'text-[min(1.7vw,2.8vh)]' : 'text-sm'} ${won ? 'font-bold' : 'text-[#A3A6B1]'}`}>{score}</span>}
      {won && <Trophy className={`${big ? 'h-[2.4vh] w-[2.4vh]' : 'h-3.5 w-3.5'} text-[#F2C27A]`} />}
    </div>
  );
}

/** 1st, 2nd, 3rd: only the places already decided. */
export function Podium({ bracket, big = false }: { bracket: Bracket; big?: boolean }) {
  if (bracket.standings.length === 0) return null;
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${bracket.standings.length}, minmax(0, 1fr))` }}>
      {bracket.standings.map((s) => (
        <div key={s.place} className="rounded-2xl border border-[#262932] bg-[#16181E] p-3 text-center">
          <Trophy className={`mx-auto ${big ? 'h-[5vh] w-[5vh]' : 'h-6 w-6'}`} style={{ color: MEDAL[s.place] }} />
          <p className={`mt-1 font-bold uppercase tracking-[0.14em] ${big ? 'text-[min(1.4vw,2.2vh)]' : 'text-[11px]'}`} style={{ color: MEDAL[s.place] }}>
            {PLACE[s.place]}
          </p>
          <p className={`mt-0.5 truncate font-heading font-bold ${big ? 'text-[min(2.6vw,4vh)]' : 'text-lg'}`}>{s.name}</p>
        </div>
      ))}
    </div>
  );
}

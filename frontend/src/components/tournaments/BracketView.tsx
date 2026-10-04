import type { Bracket, BracketMatch, MatchSide } from '@/lib/api/tournaments';
import { cn } from '@/lib/cn';

function SideRow({ side, score, won, done, mine }: { side: MatchSide | null; score: number | null; won: boolean; done: boolean; mine: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 px-2.5 py-1.5 text-caption',
        done && !won && 'text-text-secondary',
        won && 'font-bold text-text-primary',
        mine && 'bg-primary/10',
      )}
    >
      <span className="w-4 shrink-0 text-right font-data text-[10px] text-text-secondary">{side?.seed ?? ''}</span>
      <span className={cn('min-w-0 flex-1 truncate', !side && 'italic text-text-secondary/70')}>{side ? side.name : 'TBD'}</span>
      <span className={cn('w-5 shrink-0 text-right font-data', won && 'text-primary')}>{score ?? (won ? '✓' : '')}</span>
    </div>
  );
}

export function MatchBox({
  m,
  myEntryId,
  onSelect,
  selected,
}: {
  m: BracketMatch;
  myEntryId?: string | null;
  onSelect?: (m: BracketMatch) => void;
  selected?: boolean;
}) {
  const done = m.status === 'done';
  const body = (
    <>
      <SideRow side={m.a} score={m.scoreA} won={done && !!m.a && m.winner === m.a.entryId} done={done} mine={!!myEntryId && m.a?.entryId === myEntryId} />
      <div className="h-px bg-border" />
      <SideRow side={m.b} score={m.scoreB} won={done && !!m.b && m.winner === m.b.entryId} done={done} mine={!!myEntryId && m.b?.entryId === myEntryId} />
      {(m.status === 'called' || (done && m.walkover && !m.bye)) && (
        <div className={cn('px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider', m.status === 'called' ? 'bg-error text-white' : 'bg-surface text-text-secondary')}>
          {m.status === 'called' ? `Playing now${m.station ? ` · Station ${m.station}` : ''}` : 'Walkover'}
        </div>
      )}
    </>
  );
  const cls = cn(
    'w-52 overflow-hidden rounded-xl border bg-card text-left shadow-sm',
    m.status === 'called' ? 'border-error/60' : m.status === 'ready' ? 'border-primary/40' : 'border-border',
    m.bye && 'opacity-60',
    selected && 'ring-2 ring-primary',
  );
  if (onSelect && !m.bye && m.a && m.b) {
    return (
      <button type="button" onClick={() => onSelect(m)} className={cn(cls, 'transition hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary')}>
        {body}
      </button>
    );
  }
  return <div className={cls}>{body}</div>;
}

export function BracketView({
  bracket,
  myEntryId,
  onSelect,
  selectedId,
}: {
  bracket: Bracket;
  myEntryId?: string | null;
  onSelect?: (m: BracketMatch) => void;
  selectedId?: string | null;
}) {
  if (!bracket.rounds.length) return null;
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
      <div className="flex min-w-max gap-6">
        {bracket.rounds.map((r) => (
          <div key={r.round} className="flex w-52 flex-col">
            <h4 className="mb-3 text-overline uppercase text-text-secondary">{r.name}</h4>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {r.matches.map((m) => (
                <MatchBox key={m.id} m={m} myEntryId={myEntryId} onSelect={onSelect} selected={selectedId === m.id} />
              ))}
            </div>
          </div>
        ))}
        {bracket.thirdPlace && (
          <div className="flex w-52 flex-col">
            <h4 className="mb-3 text-overline uppercase text-text-secondary">3rd place</h4>
            <div className="flex flex-1 flex-col justify-end">
              <MatchBox m={bracket.thirdPlace} myEntryId={myEntryId} onSelect={onSelect} selected={selectedId === bracket.thirdPlace.id} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

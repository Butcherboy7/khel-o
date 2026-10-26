import type { CSSProperties } from 'react';
import { Teko } from 'next/font/google';

/** Condensed fight-HUD lettering, self-hosted by Next. Only the challenge page loads it. */
export const fightFont = Teko({ subsets: ['latin'], weight: ['500', '600', '700'], display: 'swap' });

/* Embers: fixed positions so server and browser render the same thing. */
const EMBERS = [
  [6, 0, 5.2], [14, 1.6, 6.4], [23, 0.8, 4.8], [31, 2.9, 7.1], [39, 0.3, 5.6], [47, 2.2, 6.2], [55, 1.1, 4.6],
  [63, 3.4, 6.8], [71, 0.6, 5.4], [79, 2.6, 7.4], [86, 1.4, 5], [93, 3.1, 6.6], [18, 4.2, 5.8], [67, 4.6, 6],
];

/** The fight backdrop: smoke, a broken chain and rising embers. Our own art, CSS only. */
export function FightStage() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="chs-smoke absolute -right-1/3 -top-1/4 h-[90%] w-[120%] bg-[radial-gradient(closest-side,rgba(176,24,44,0.5),transparent)]" />
      <div className="chs-smoke-2 absolute -left-1/2 top-[18%] h-[80%] w-[110%] bg-[radial-gradient(closest-side,rgba(92,34,150,0.38),transparent)]" />
      <Chain className="absolute -left-6 bottom-[8%] w-[78%] rotate-[-24deg] text-[#E8675D] opacity-[0.16]" />
      {EMBERS.map(([left, delay, dur], i) => (
        <span
          key={i}
          className="chs-ember absolute bottom-0 h-[3px] w-[3px] rounded-full bg-[#FF8A4C]"
          style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${dur}s` } as CSSProperties}
        />
      ))}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#0A0809] to-transparent" />
    </div>
  );
}

function Chain({ className }: { className?: string }) {
  // Alternating flat and edge-on links, the last one snapped open.
  const links = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg className={className} viewBox="0 0 520 60" fill="none" stroke="currentColor" strokeWidth="7">
      {links.map((i) =>
        i % 2 === 0 ? (
          <rect key={i} x={i * 52} y={12} width={70} height={36} rx={18} />
        ) : (
          <rect key={i} x={i * 52 + 14} y={24} width={44} height={12} rx={6} />
        ),
      )}
      <path d="M478 18 C 500 14, 512 24, 508 36" />
    </svg>
  );
}

/** In-game HUD: two health bars filling up for a fresh round, VS in the timer box. */
export function FightHud() {
  return (
    <div className={`${fightFont.className} flex items-center gap-2`} aria-hidden>
      <HealthBar side="left" name="You" />
      <span className="flex h-10 w-12 flex-shrink-0 items-center justify-center border-2 border-[#F2C94C]/80 bg-black/60 text-[26px] font-bold leading-none text-[#F2C94C]">
        VS
      </span>
      <HealthBar side="right" name="2P ???" />
    </div>
  );
}

function HealthBar({ side, name }: { side: 'left' | 'right'; name: string }) {
  const right = side === 'right';
  return (
    <div className={`min-w-0 flex-1 ${right ? 'text-right' : ''}`}>
      <div className={`h-3.5 overflow-hidden border border-white/40 bg-black/70 ${right ? 'skew-x-[20deg]' : '-skew-x-[20deg]'}`}>
        <div
          className={`chs-hp h-full bg-gradient-to-r ${right ? 'chs-hp-r ml-auto from-[#E8675D] to-[#F2C94C]' : 'from-[#F2C94C] to-[#E8675D]'}`}
        />
      </div>
      <p className="mt-0.5 text-[17px] font-semibold uppercase leading-none tracking-wide text-white/90">{name}</p>
    </div>
  );
}

/** "ROUND 1 · FIGHT!" once, over the page, after the intro. Never blocks a tap. */
export function RoundFight({ delayMs }: { delayMs: number }) {
  return (
    <div
      className={`${fightFont.className} chs-round pointer-events-none fixed inset-x-0 top-[26%] z-[65] flex flex-col items-center`}
      style={{ '--rf-delay': `${delayMs}ms` } as CSSProperties}
      aria-hidden
    >
      <span className="chs-band absolute inset-x-0 top-[-14px] h-[calc(100%+28px)] bg-black/80 [clip-path:polygon(0_10%,100%_0,100%_90%,0_100%)]" />
      <span className="chs-round-1 relative text-[54px] font-semibold uppercase leading-none tracking-[0.06em] text-white [text-shadow:0_4px_18px_rgba(0,0,0,0.8)]">
        Round 1
      </span>
      <span className="chs-round-fight relative text-[112px] font-bold uppercase italic leading-[0.8] text-[#E8675D] [text-shadow:0_6px_28px_rgba(0,0,0,0.85)]">
        Fight!
      </span>
    </div>
  );
}

/* Fighter busts for the select screen: our own silhouettes, three hair styles. */
const HAIR = [
  'M17 27 L12 7 L21 17 L23 1 L30 14 L37 -1 L39 16 L47 5 L43 27 Z',
  'M18 29 C15 13 26 8 35 11 C44 13 47 23 42 31 L40 22 L34 26 L30 17 L24 26 Z',
  'M19 22 C20 12 40 12 41 22 L41 25 L19 25 Z M41 21 C50 22 54 30 50 40 C48 32 45 28 41 26 Z',
];

function Bust({ variant, lit }: { variant: number; lit: boolean }) {
  return (
    <svg viewBox="0 0 60 72" className="h-full w-full" aria-hidden>
      <g fill={lit ? '#120A0C' : '#1C1A22'}>
        <path d={HAIR[variant % HAIR.length]} />
        <ellipse cx="30" cy="31" rx="11" ry="13" />
        <rect x="25" y="40" width="10" height="10" />
        <path d="M2 72 C4 56 15 49 30 49 C45 49 56 56 58 72 Z" />
      </g>
    </svg>
  );
}

/** The real spots as a fighting-game select screen: taken slots lit, the next one waits for you. */
export function PlayerSelect({ capacity, filled, open }: { capacity: number; filled: number; open: boolean }) {
  return (
    <div className={`${fightFont.className} mt-4 grid grid-cols-5 gap-x-2 gap-y-4`} aria-hidden>
      {Array.from({ length: capacity }, (_, i) => {
        const taken = i < filled;
        const next = open && i === filled;
        return (
          <div key={i} className="chs-tile relative" style={{ animationDelay: `${i * 45}ms` } as CSSProperties}>
            {next && (
              <span className="chs-cursor absolute -top-3 left-1/2 z-10 -translate-x-1/2 bg-[#D0463C] px-1.5 text-[15px] font-bold leading-[1.15] text-white">
                1P
              </span>
            )}
            <div
              className={`chs-chamfer relative aspect-[5/6] overflow-hidden ${
                taken
                  ? 'bg-[radial-gradient(circle_at_50%_30%,#F2C94C_0%,#D0463C_45%,#3A0F14_100%)]'
                  : next
                  ? 'chs-next bg-[#1A0D10]'
                  : 'bg-[#121016]'
              }`}
            >
              <div className="absolute inset-x-1 bottom-0 top-2">
                <Bust variant={i} lit={taken} />
              </div>
              {!taken && (
                <span className={`absolute inset-0 flex items-center justify-center text-[30px] font-bold ${next ? 'text-[#E8675D]' : 'text-[#3A3644]'}`}>
                  ?
                </span>
              )}
            </div>
            <p className={`mt-1 text-center text-[15px] font-semibold uppercase leading-none ${taken ? 'text-white' : next ? 'text-[#E8675D]' : 'text-[#4A4654]'}`}>
              {taken ? `P${i + 1}` : next ? 'You?' : 'Open'}
            </p>
          </div>
        );
      })}
    </div>
  );
}

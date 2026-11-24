'use client';

import Link from 'next/link';
import { MapPin } from 'lucide-react';
import { cafePath } from '@/lib/api/cafes';
import { gamePage, type GameCafe, type GameMatch } from '@/lib/gameSearch';
import { FEATURED_CHALLENGE_SLUG } from '@/lib/challenge';

const MAX_LINES = 6;

/** "Cafés that have Valorant": one calm line per café, the whole line is a link.
 *  `onPick` lets a dropdown close itself when a line is tapped. */
export function GameResults({ matches, onPick, showPage = true }: { matches: GameMatch[]; onPick?: () => void; showPage?: boolean }) {
  if (matches.length === 0) return null;
  // GTA 6 has its own café chooser on the drop page: never say "no café" beside its Reserve button.
  const shownMatches = matches.filter((m) => !(m.game === 'GTA 6' && m.cafes.length === 0));
  if (shownMatches.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" aria-label="Cafés that have this game">
      {shownMatches.slice(0, 2).map((m) => {
        const page = showPage ? gamePage(m.game, FEATURED_CHALLENGE_SLUG) : null;
        const lines = m.cafes.slice(0, MAX_LINES);
        return (
          <section key={m.game} className={showPage ? 'rounded-2xl border border-border bg-card p-3' : 'p-1'}>
            <h3 className="px-1 pb-1.5 font-heading text-body font-bold text-text-primary">
              {m.cafes.length > 0 ? `Cafés that have ${m.game}` : m.game}
            </h3>
            {page && (
              <Link href={page.href} onClick={onPick} className="mb-1 flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-primary/10 px-3 py-2 text-left">
                <span className="min-w-0">
                  <span className="block truncate text-body font-bold text-text-primary">{page.title}</span>
                  <span className="block truncate text-caption text-text-secondary">{page.subtitle}</span>
                </span>
                <span className="flex-none rounded-full bg-primary px-3 py-1 text-[12px] font-bold text-white">{m.game === 'GTA 6' ? 'Reserve' : 'Sign up'}</span>
              </Link>
            )}
            {m.cafes.length === 0 ? (
              <p className="px-1 py-1 text-caption text-text-secondary">
                No café lists {m.game} yet. Know one?{' '}
                <Link href="/community" onClick={onPick} className="font-bold text-primary">Tell us in the community</Link>
              </p>
            ) : (
              <ul className="flex flex-col">
                {lines.map((c) => (
                  <li key={c.id}>
                    <CafeLine cafe={c} game={m.game} onPick={onPick} />
                  </li>
                ))}
                {m.cafes.length > MAX_LINES && <li className="px-1 pt-1 text-caption text-text-secondary">and {m.cafes.length - MAX_LINES} more below</li>}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function CafeLine({ cafe, game, onPick }: { cafe: GameCafe; game: string; onPick?: () => void }) {
  return (
    <Link
      href={cafePath(cafe)}
      onClick={onPick}
      className="flex min-h-[44px] items-center gap-2.5 rounded-xl px-1 py-1.5 transition-colors hover:bg-surface"
    >
      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-lg bg-primary/10 text-primary">
        <MapPin className="h-4 w-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 text-caption text-text-secondary">
        <span className="font-bold text-text-primary">{cafe.name}</span> has {game}
        <span className="block truncate">{cafe.addressLine2 || cafe.city}</span>
      </span>
      {cafe.isLeadListing && <span className="flex-none rounded-full bg-surface px-2 py-0.5 text-[11px] font-bold text-text-secondary">Booking soon</span>}
    </Link>
  );
}

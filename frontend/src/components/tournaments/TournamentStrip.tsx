'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { listTournaments } from '@/lib/api/tournaments';
import { TournamentCard } from './TournamentCard';

/** Home-page row of upcoming tournaments; renders nothing until there is one. */
export function TournamentStrip() {
  const { data } = useQuery({ queryKey: ['tournaments', { game: '' }], queryFn: () => listTournaments(), staleTime: 60_000 });
  if (!data?.length) return null;
  return (
    <section aria-labelledby="home-tournaments" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="home-tournaments" className="font-heading text-h2 text-text-primary">Tournaments near you</h2>
        <Link href="/tournaments" className="text-caption font-bold text-primary hover:underline">See all</Link>
      </div>
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
        {data.slice(0, 6).map((t) => (
          <div key={t.id} className="w-[17rem] shrink-0 snap-start">
            <TournamentCard t={t} />
          </div>
        ))}
      </div>
    </section>
  );
}

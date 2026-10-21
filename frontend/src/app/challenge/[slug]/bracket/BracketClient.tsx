'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Swords, Trophy } from 'lucide-react';
import { getBracket, type BracketMatch } from '@/lib/api/challenges';
import { BracketView, Podium } from '@/components/challenge/BracketView';
import { ShareCardButton } from '@/components/challenge/ShareCardButton';

/** Refreshes on its own every few seconds, so the projector and phones
 *  follow the results as the referee enters them. */
export function BracketClient({ slug, projector }: { slug: string; projector: boolean }) {
  const { data, error } = useQuery({
    queryKey: ['challenge', slug, 'bracket'],
    queryFn: () => getBracket(slug),
    refetchInterval: (q) => (q.state.data?.challenge.status === 'finished' ? 60_000 : 5_000),
  });

  if (!data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0E0F13] text-[#A3A6B1]">
        {error ? 'No bracket here.' : 'Loading the bracket…'}
      </div>
    );
  }

  const ch = data.challenge;
  const finished = ch.status === 'finished';

  if (projector) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col overflow-hidden bg-black px-[4vw] py-[4vh] text-white">
        <p className="text-[min(1.8vw,2.8vh)] font-bold uppercase tracking-[0.2em] text-[#E8675D]">{ch.title}</p>
        {!data.drawn ? (
          <p className="mt-[20vh] text-center font-heading text-[min(4vw,7vh)] font-bold">The draw is coming up</p>
        ) : (
          <>
            {data.upNext && !finished && <UpNext m={data.upNext} big />}
            {data.standings.length > 0 && (finished || !data.upNext) && (
              <div className="mt-[2vh]">
                <Podium bracket={data} big />
              </div>
            )}
            <div className="mt-[3vh] flex-1">
              <BracketView bracket={data} big />
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0F13] text-[#F4F1EC]">
      <header className="mx-auto flex max-w-5xl items-center gap-2 px-4 pt-4">
        <Link href={`/challenge/${slug}`} className="flex items-center gap-1 text-sm font-semibold text-[#A3A6B1] hover:text-[#F4F1EC]">
          <ChevronLeft className="h-4 w-4" /> Challenge
        </Link>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-5">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#E8675D]">{finished ? 'Results' : 'Live bracket'}</p>
        <h1 className="mt-1 font-heading text-2xl font-bold">{ch.title}</h1>
        <p className="mt-1 text-sm text-[#A3A6B1]">
          {ch.game} at {ch.cafe.name}. Best of {ch.bestOf}
          {ch.finalBestOf !== ch.bestOf ? `, final best of ${ch.finalBestOf}` : ''}.
        </p>

        {!data.drawn ? (
          <p className="mt-10 rounded-2xl border border-dashed border-[#3A3E4A] p-6 text-center text-[#A3A6B1]">
            The draw happens at the café once check-in closes. The bracket shows up here.
          </p>
        ) : (
          <>
            {data.standings.length > 0 && (
              <section className="mt-5">
                <Podium bracket={data} />
                {finished && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {ch.championPhotoUrl && (
                      <Link
                        href={`/challenge/${slug}/champion`}
                        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#D0463C] font-semibold text-white"
                      >
                        <Trophy className="h-4 w-4" /> Meet the champion
                      </Link>
                    )}
                    <ShareCardButton
                      src={`/challenge/${slug}/card/results`}
                      fileName={`khelo-${slug}-results.png`}
                      text={`${ch.title}: the results`}
                      label="Share the results"
                      challenge={slug}
                      kind="results"
                    />
                  </div>
                )}
              </section>
            )}
            {data.upNext && !finished && (
              <div className="mt-5">
                <UpNext m={data.upNext} />
              </div>
            )}
            <section className="mt-6">
              <BracketView bracket={data} />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function UpNext({ m, big = false }: { m: BracketMatch; big?: boolean }) {
  return (
    <div className={`rounded-2xl border border-[#5A2A26] bg-[#1A1114] ${big ? 'mt-[2vh] px-[2vw] py-[2vh]' : 'p-4'}`}>
      <p className={`flex items-center gap-2 font-bold uppercase tracking-[0.16em] text-[#E8675D] ${big ? 'text-[min(1.4vw,2.2vh)]' : 'text-[11px]'}`}>
        <Swords className={big ? 'h-[2.4vh] w-[2.4vh]' : 'h-3.5 w-3.5'} /> Up next · {m.name} · best of {m.bestOf}
      </p>
      <p className={`mt-1 font-heading font-bold ${big ? 'text-[min(4vw,6.5vh)]' : 'text-2xl'}`}>
        {m.a?.name} <span className="text-[#A3A6B1]">vs</span> {m.b?.name}
      </p>
    </div>
  );
}

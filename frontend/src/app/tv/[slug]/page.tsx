'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getTournament, type BracketMatch } from '@/lib/api/tournaments';
import { BracketView } from '@/components/tournaments/BracketView';
import { fmtTime, formatLabel, placeLabel } from '@/lib/tournament';

/** Café TV / projector view: what's on, who's next, the bracket. Refreshes itself. */
export default function TournamentScreen() {
  const { slug } = useParams<{ slug: string }>();
  const [now, setNow] = useState(() => new Date());
  const { data: t } = useQuery({ queryKey: ['tv', slug], queryFn: () => getTournament(slug), refetchInterval: 10_000 });

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);

  if (!t) return <div className="min-h-screen bg-[#0b0b12]" />;

  const url = typeof window !== 'undefined' ? `${window.location.origin}/tournaments/${t.slug}` : '';
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=0&data=${encodeURIComponent(url)}`;
  const Now = ({ m }: { m: BracketMatch }) => (
    <div className="flex items-center gap-5 rounded-3xl bg-white/[0.06] p-5">
      <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl" style={{ background: t.game.colour }}>
        <span className="text-xs font-bold tracking-widest opacity-80">STATION</span>
        <span className="font-heading text-4xl font-bold leading-none">{m.station ?? '–'}</span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold uppercase tracking-widest text-white/50">{m.name}</p>
        <p className="truncate font-heading text-3xl font-bold">{m.a?.name} <span className="text-white/40">vs</span> {m.b?.name}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0b0b12] p-8 text-white [color-scheme:dark]">
      <header className="mb-8 flex items-end justify-between gap-6">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.3em]" style={{ color: t.game.colour }}>
            {t.game.name} · {formatLabel(t)} · {t.cafe?.name}
          </p>
          <h1 className="font-heading text-5xl font-bold tracking-tight">{t.title}</h1>
        </div>
        <div className="text-right">
          <p className="font-data text-4xl font-bold">{now.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</p>
          <p className="text-sm text-white/50">KHEL-O Tournaments</p>
        </div>
      </header>

      {t.status === 'completed' ? (
        <div className="grid gap-6 lg:grid-cols-3">
          {t.results.slice(0, 3).map((r) => (
            <div key={r.id} className={`rounded-3xl p-8 ${r.place === 1 ? 'bg-amber-400 text-[#0b0b12]' : 'bg-white/[0.06]'}`}>
              <p className="text-lg font-bold uppercase tracking-widest opacity-70">{placeLabel(r.place)}</p>
              <p className="font-heading text-5xl font-bold">{r.name}</p>
            </div>
          ))}
        </div>
      ) : t.bracket.rounds.length === 0 ? (
        <div className="flex items-center gap-10 rounded-3xl bg-white/[0.06] p-10">
          {t.registrationOpen && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Scan to register" width={200} height={200} className="rounded-2xl bg-white p-3" />
          )}
          <div>
            <p className="font-heading text-5xl font-bold">
              {t.registrationOpen ? 'Scan to register' : 'Check in at the counter'}
            </p>
            <p className="mt-3 text-2xl text-white/70">
              Starts {fmtTime(t.startsAt)} · {t.taken}/{t.maxTeams} in{t.prizes[0] ? ` · ${t.prizes[0].place}: ${t.prizes[0].prize}` : ''}
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-red-400">Playing now</h2>
              {t.bracket.nowPlaying.length ? t.bracket.nowPlaying.map((m) => <Now key={m.id} m={m} />) : <p className="text-2xl text-white/40">Next match coming up…</p>}
            </section>
            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-white/50">Up next</h2>
              {t.bracket.upNext.slice(0, 4).map((m) => (
                <p key={m.id} className="truncate rounded-2xl bg-white/[0.04] px-5 py-3 text-2xl font-semibold">
                  {m.a?.name} <span className="text-white/40">vs</span> {m.b?.name}
                </p>
              ))}
            </section>
          </div>
          <div className="rounded-3xl bg-white/[0.04] p-6">
            <BracketView bracket={t.bracket} />
          </div>
        </div>
      )}
    </div>
  );
}

import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, MessageCircle, Trophy } from 'lucide-react';
import { getBracket, type Bracket } from '@/lib/api/challenges';
import { challengeDay, handle } from '@/lib/challenge';

interface PageProps {
  params: Promise<{ slug: string }>;
}

const load = cache(async (slug: string): Promise<Bracket | null> => {
  try {
    return await getBracket(slug);
  } catch {
    return null;
  }
});

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const b = await load(slug);
  const champ = b?.standings.find((s) => s.place === 1);
  if (!b || !champ) return { title: 'Champion', robots: { index: false } };
  const title = `${champ.name}: ${b.challenge.title} champion`;
  const description = `${champ.name} won ${b.challenge.title} at ${b.challenge.cafe.name} on ${challengeDay(b.challenge.startsAt)}.`;
  return {
    title,
    description,
    alternates: { canonical: `/challenge/${slug}/champion` },
    openGraph: {
      title,
      description,
      url: `/challenge/${slug}/champion`,
      ...(b.challenge.championPhotoUrl ? { images: [{ url: b.challenge.championPhotoUrl }] } : {}),
    },
  };
}

/** The champion's page: their photo, the podium, and the way into the next one. */
export default async function ChampionPage({ params }: PageProps) {
  const { slug } = await params;
  const b = await load(slug);
  const champ = b?.standings.find((s) => s.place === 1);
  if (!b || !champ) notFound();
  const ch = b.challenge;
  const others = b.standings.filter((s) => s.place !== 1);
  const ig = handle(ch.instagramHandle);

  return (
    <div className="min-h-screen bg-[#0E0F13] text-[#F4F1EC]">
      <header className="mx-auto flex max-w-xl items-center gap-2 px-4 pt-4">
        <Link href={`/challenge/${slug}/bracket`} className="flex items-center gap-1 text-sm font-semibold text-[#A3A6B1] hover:text-[#F4F1EC]">
          <ChevronLeft className="h-4 w-4" /> Results
        </Link>
      </header>
      <main className="mx-auto max-w-xl px-4 pb-16 pt-5 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#E8675D]">{ch.title} · Champion</p>
        {ch.championPhotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- one photo, from our own storage
          <img
            src={ch.championPhotoUrl}
            alt={`${champ.name}, champion of ${ch.title}`}
            className="mx-auto mt-4 aspect-[4/5] w-full max-w-sm rounded-3xl object-cover"
          />
        ) : (
          <div className="mx-auto mt-4 flex aspect-[4/5] w-full max-w-sm items-center justify-center rounded-3xl bg-gradient-to-br from-[#2A2210] to-[#16181E]">
            <Trophy className="h-24 w-24 text-[#F2C27A]" />
          </div>
        )}
        <h1 className="mt-5 font-heading text-[40px] font-bold leading-none">{champ.name}</h1>
        {champ.mainCharacter && <p className="mt-2 text-[#A3A6B1]">Mains {champ.mainCharacter}</p>}
        <p className="mt-3 text-[#DADCE3]">
          Won {ch.title} at {ch.cafe.name}, {challengeDay(ch.startsAt)}.
        </p>

        {others.length > 0 && (
          <div className="mt-6 grid grid-cols-2 gap-2">
            {others.map((s) => (
              <div key={s.place} className="rounded-2xl border border-[#262932] bg-[#16181E] p-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#A3A6B1]">{s.place === 2 ? '2nd' : '3rd'}</p>
                <p className="mt-0.5 truncate font-heading text-lg font-bold">{s.name}</p>
              </div>
            ))}
          </div>
        )}

        {ch.communityUrl && (
          <a
            href={ch.communityUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 flex items-center gap-3 rounded-2xl bg-[#25D366] px-4 py-4 text-left font-semibold text-[#0B2E17]"
          >
            <MessageCircle className="h-5 w-5" />
            <span className="flex-1">
              <span className="block">Want in on the next challenge?</span>
              <span className="block text-xs font-medium opacity-80">Join the KHELO WhatsApp community. Free.</span>
            </span>
          </a>
        )}
        {ig && <p className="mt-6 text-sm text-[#A3A6B1]">Videos from the day on {ig}.</p>}
      </main>
    </div>
  );
}

import { cache } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getChallenge, type Challenge } from '@/lib/api/challenges';
import { SimpleMarkdown } from '@/components/challenge/SimpleMarkdown';

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

const load = cache(async (slug: string): Promise<Challenge | null> => {
  try {
    return await getChallenge(slug);
  } catch {
    return null;
  }
});

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const ch = await load(slug);
  if (!ch) return { title: 'Rules', robots: { index: false } };
  return {
    title: `Rules · ${ch.title}`,
    description: `The rules for ${ch.title} at ${ch.cafe.name}.`,
    alternates: { canonical: `/challenge/${ch.slug}/rules` },
  };
}

/** The rules, for players on a phone, and ?projector=1 for the big screen:
 *  dark, full width, type big enough to read from the back of the room. */
export default async function ChallengeRulesPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const projector = (await searchParams)?.projector === '1';
  const ch = await load(slug);
  if (!ch) notFound();

  if (projector) {
    return (
      // Fixed over everything (the cookie strip too), sized by the smaller of
      // width and height so the whole list fits one screen without scrolling.
      <div className="fixed inset-0 z-[200] overflow-hidden bg-black px-[5vw] py-[4vh] text-white">
        <p className="text-[min(2vw,3vh)] font-bold uppercase tracking-[0.2em] text-[#E8675D]">{ch.title}</p>
        <h1 className="mt-[1vh] font-heading text-[min(4.5vw,7vh)] font-bold leading-none">The rules</h1>
        <SimpleMarkdown
          text={ch.rulesMd}
          className="mt-[3.5vh] gap-[1.6vh] text-[min(2.4vw,3.2vh)] leading-[1.25]"
          itemClassName="gap-[1.2vw]"
        />
        <p className="mt-[3.5vh] text-[min(1.8vw,2.6vh)] text-[#A3A6B1]">
          Best of {ch.bestOf}
          {ch.finalBestOf !== ch.bestOf ? ` · Final best of ${ch.finalBestOf}` : ''} · {ch.format}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0E0F13] text-[#F4F1EC]">
      <main className="mx-auto max-w-xl px-4 pb-16 pt-6">
        <Link href={`/challenge/${ch.slug}`} className="text-sm font-semibold text-[#A3A6B1] hover:text-[#F4F1EC]">
          ← {ch.title}
        </Link>
        <h1 className="mt-4 font-heading text-3xl font-bold">The rules</h1>
        <p className="mt-2 text-sm text-[#A3A6B1]">
          {ch.game} · {ch.format} · Best of {ch.bestOf}
          {ch.finalBestOf !== ch.bestOf ? `, final best of ${ch.finalBestOf}` : ''}
        </p>
        <SimpleMarkdown text={ch.rulesMd} className="mt-6 text-[15px] leading-relaxed text-[#DADCE3]" />
      </main>
    </div>
  );
}

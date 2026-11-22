import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { teamChallengeConfig } from '@/challenges';
import { TeamJoin } from '@/components/challenge/team/TeamJoin';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const cfg = teamChallengeConfig((await params).slug);
  return { title: cfg ? `Sign up · ${cfg.title}` : 'Sign up', robots: { index: false, follow: false } };
}

/** Sign-up for a team challenge: log in → team or solo → details → one tick → pay. */
export default async function JoinPage({ params }: PageProps) {
  const cfg = teamChallengeConfig((await params).slug);
  if (!cfg) notFound();
  return (
    <Suspense>
      <TeamJoin cfg={cfg} />
    </Suspense>
  );
}

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { teamChallengeConfig } from '@/challenges';
import { TeamInvite } from '@/components/challenge/team/TeamInvite';

interface PageProps {
  params: Promise<{ slug: string; code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const cfg = teamChallengeConfig((await params).slug);
  return {
    title: cfg ? `Join your team · ${cfg.title}` : 'Join your team',
    description: cfg ? `Your captain signed your team up. Free for you. ${cfg.venue.name}, Sat 5 Dec.` : undefined,
    robots: { index: false, follow: false },
  };
}

/** The captain's invite link: a teammate joins the team for free. */
export default async function InvitePage({ params }: PageProps) {
  const { slug, code } = await params;
  const cfg = teamChallengeConfig(slug);
  if (!cfg) notFound();
  return <TeamInvite cfg={cfg} code={code} />;
}

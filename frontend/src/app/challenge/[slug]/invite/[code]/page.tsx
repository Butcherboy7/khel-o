import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { teamChallengeConfig } from '@/challenges';
import { TeamInvite } from '@/components/challenge/team/TeamInvite';

interface PageProps {
  params: Promise<{ slug: string; code: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const cfg = teamChallengeConfig((await params).slug);
  const title = cfg ? `Join my team · ${cfg.title.replace(/^Khelo\s+/i, '')}` : 'Join your team';
  const description = cfg
    ? `Your captain already paid for the team. Tap to join free: add your name and Riot ID. ${cfg.venue.name}, Sat 5 Dec.`
    : undefined;
  return {
    title,
    description,
    robots: { index: false, follow: false },
    openGraph: { title, description, type: 'website', siteName: 'KHEL-O' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

/** The captain's invite link: a teammate joins the team for free. */
export default async function InvitePage({ params }: PageProps) {
  const { slug, code } = await params;
  const cfg = teamChallengeConfig(slug);
  if (!cfg) notFound();
  return <TeamInvite cfg={cfg} code={code} />;
}

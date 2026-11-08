'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { trackAction } from '@/lib/api/analyticsEvents';
import { joinedHere, recordJoin, suggestedHere, votedHere } from '@/lib/communityJoin';
import { getThisWeek } from '@/lib/api/community';
import { COMMUNITY_URL } from '@/lib/challenge';
import { cn } from '@/lib/cn';

/** One next step after a win. Not in the group yet: the invite. In it: the first thing still undone
 *  (vote, suggest a café), else nothing. Same card on every confirmation screen. */
export function CommunityInviteCard({ where }: { where: string }) {
  // The real member count, only once it is big enough to mean something.
  const { data } = useQuery({ queryKey: ['community-week'], queryFn: getThisWeek, staleTime: 120_000, retry: false });
  const members = data?.members ?? 0;
  const [step, setStep] = useState<'join' | 'vote' | 'suggest' | 'done' | null>(null);
  useEffect(() => {
    setStep(!joinedHere() ? 'join' : !votedHere() && data?.poll && !data.poll.closed ? 'vote' : !suggestedHere() ? 'suggest' : 'done');
  }, [data?.poll]);
  if (step === null || step === 'done') return null;
  if (step !== 'join') {
    const vote = step === 'vote';
    return (
      <Link
        href={vote ? '/community#vote' : '/community#photos'}
        onClick={() => trackAction('community_next_step_tap', { where, step })}
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 text-text-primary transition-colors hover:border-primary/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-extrabold uppercase tracking-wider text-error">Your next step</span>
          <span className="block font-heading text-body-emphasis font-bold">{vote ? 'Help pick the next challenge' : 'Know a café we are missing?'}</span>
          <span className="block text-caption text-text-secondary">{vote ? 'One tap. Your vote counts.' : 'Tell us the name. We reach out to the owner.'}</span>
        </span>
        <ArrowRight className="h-4 w-4 flex-shrink-0 text-text-secondary" aria-hidden />
      </Link>
    );
  }
  return (
    <a
      href={COMMUNITY_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => recordJoin(where)}
      className="flex items-center gap-3 rounded-2xl border border-[#3B6B4A] bg-[#13221A] p-4 text-[#F4F1EC] transition-colors hover:border-[#7FE0A0]"
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-[#0B1F12]">
        <WhatsAppIcon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-body-emphasis font-bold">Join the KHEL-O WhatsApp Community</span>
        <span className="block text-caption text-[#C9CBD3]">
          {members >= 10 ? `${members} gamers are in. ` : ''}New challenges drop there first, plus café news and people to play with. Free, leave any time.
        </span>
      </span>
    </a>
  );
}

/** Small green button for footers. */
export function CommunityButton({ where, className }: { where: string; className?: string }) {
  return (
    <a
      href={COMMUNITY_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => recordJoin(where)}
      className={cn(
        'inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#25D366] px-4 text-caption font-bold text-[#0B1F12] transition-colors hover:bg-[#2EE073]',
        className,
      )}
    >
      <WhatsAppIcon className="h-4 w-4" aria-hidden />
      Join our WhatsApp Community
    </a>
  );
}

/** After a booking: where the last challenge's photos and results are. */
export function LastChallengeLink({ where }: { where: string }) {
  return (
    <Link
      href="/challenge/tekken-01"
      onClick={() => trackAction('community_page_tap', { where })}
      className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-text-primary transition-colors hover:border-primary/50"
    >
      <span className="flex flex-shrink-0 -space-x-3" aria-hidden>
        {['full-house', 'couch', 'prize'].map((n) => (
          // eslint-disable-next-line @next/next/no-img-element -- small static photos from /public
          <img key={n} src={`/community/${n}.webp`} alt="" loading="lazy" className="h-11 w-11 rounded-full border-2 border-card object-cover" />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-body-emphasis font-bold">See the last challenge</span>
        <span className="block text-caption text-text-secondary">Tekken #01 at AdamsDen. The photos and who won.</span>
      </span>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-text-secondary" aria-hidden />
    </Link>
  );
}

'use client';

import { MessageCircle } from 'lucide-react';
import { trackAction } from '@/lib/api/analyticsEvents';
import { COMMUNITY_URL } from '@/lib/challenge';
import { cn } from '@/lib/cn';

/** "Join the WhatsApp Community" card: hear about every challenge first. */
export function CommunityInviteCard({ where }: { where: string }) {
  return (
    <a
      href={COMMUNITY_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => trackAction('community_join_tap', { where })}
      className="flex items-center gap-3 rounded-2xl border border-[#3B6B4A] bg-[#13221A] p-4 text-[#F4F1EC] transition-colors hover:border-[#7FE0A0]"
    >
      <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-[#25D366] text-[#0B1F12]">
        <MessageCircle className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-heading text-body-emphasis font-bold">Join the KHEL-O WhatsApp Community</span>
        <span className="block text-caption text-[#C9CBD3]">
          New challenges drop there first, plus café news and people to play with. Free, leave any time.
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
      onClick={() => trackAction('community_join_tap', { where })}
      className={cn(
        'inline-flex min-h-[40px] items-center gap-2 rounded-full bg-[#25D366] px-4 text-caption font-bold text-[#0B1F12] transition-colors hover:bg-[#2EE073]',
        className,
      )}
    >
      <MessageCircle className="h-4 w-4" aria-hidden />
      Join our WhatsApp Community
    </a>
  );
}

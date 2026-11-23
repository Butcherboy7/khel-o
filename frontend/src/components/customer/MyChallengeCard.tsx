'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { QrCode, UserPlus, X } from 'lucide-react';
import { teamChallengeConfig } from '@/challenges';
import { WhatsAppIcon } from '@/components/icons/WhatsAppIcon';
import { ChallengeGlyph } from '@/components/icons/ValorantIcon';
import { answerComing, getMyActiveChallenges, type MyActiveChallenge } from '@/lib/api/challenges';
import { challengeDay, challengeTime } from '@/lib/challenge';
import { useAuthStore } from '@/store/authStore';

const dismissKey = (slug: string) => `khelo.rsvpDismissed.${slug}`;
const wasDismissed = (slug: string) => {
  try { return window.localStorage.getItem(dismissKey(slug)) === '1'; } catch { return false; }
};

/** "Coming on the day?" for a confirmed player who hasn't answered, before the
 *  challenge starts. Closes itself once they answer; the X hides it on this
 *  device (the same question stays on their challenge page). */
function ComingPrompt({ c }: { c: MyActiveChallenge }) {
  const queryClient = useQueryClient();
  const [hidden, setHidden] = useState(() => wasDismissed(c.slug));
  const yes = useMutation({
    mutationFn: () => answerComing(c.slug, 'yes'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['challenges', 'mine'] }),
  });
  const showable =
    c.entryStatus === 'confirmed' && c.coming === null && (c.status === 'open' || c.status === 'closed') &&
    new Date(c.startsAt).getTime() > Date.now();
  if (!showable || hidden) return null;
  return (
    <div role="group" aria-label="Are you coming?" className="flex flex-col gap-2 rounded-2xl border border-[#5A2A26] bg-[#241A1D] px-3 py-2.5 text-[#F4F1EC]">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-caption">
          <span className="font-semibold">Are you coming?</span>{' '}
          <span className="text-[#A3A6B1]">Tell us so we can keep your spot in {c.title}.</span>
        </p>
        <button
          type="button"
          aria-label="Hide this for now"
          onClick={() => {
            try { window.localStorage.setItem(dismissKey(c.slug), '1'); } catch { /* storage blocked: it just hides for this visit */ }
            setHidden(true);
          }}
          className="-mr-1 -mt-1 flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl text-[#A3A6B1] hover:bg-white/10"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={yes.isPending}
          onClick={() => yes.mutate()}
          className="inline-flex h-10 items-center rounded-xl bg-[#D0463C] px-4 text-caption font-semibold text-white hover:bg-[#B93C33] disabled:opacity-60"
        >
          {yes.isPending ? 'Saving…' : 'Yes, I’m coming'}
        </button>
        <Link href={`/challenge/${c.slug}/me`} className="text-caption font-semibold text-[#E8675D] underline">Can’t make it</Link>
      </div>
    </div>
  );
}

/** A captain whose team isn't full: shown every time they open Home until the last teammate joins. */
function TeamNeedsPrompt({ c }: { c: MyActiveChallenge }) {
  const n = c.teamNeeds;
  if (!n) return null;
  const left = n.size - n.players;
  const share = (teamChallengeConfig(c.slug)?.shareText ?? 'Join my team: {link}').replace('{link}', n.inviteUrl);
  return (
    <div role="group" aria-label="Add your teammates" className="flex flex-col gap-2 rounded-2xl border-2 border-[#D0463C] bg-[#241A1D] px-3 py-3 text-[#F4F1EC]">
      <p className="flex items-start gap-2 text-caption">
        <UserPlus className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#E8675D]" aria-hidden />
        <span>
          <span className="font-semibold">Your team has {n.players} of {n.size} players.</span>{' '}
          <span className="text-[#A3A6B1]">Send your link to {left === 1 ? 'your last teammate' : `your ${left} teammates`} so you can play.</span>
        </span>
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(share)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#25D366] px-4 text-caption font-bold text-[#06210F] hover:bg-[#3BE07A]"
        >
          <WhatsAppIcon className="h-4 w-4" /> Send on WhatsApp
        </a>
        <Link href={`/challenge/${c.slug}/me#add-teammates`} className="text-caption font-semibold text-[#E8675D] underline">Open my team</Link>
      </div>
    </div>
  );
}

/** Top of the home screen for a signed-in player who is in an upcoming or
 *  live challenge: when it is, their place, and their check-in QR. */
export function MyChallengeCard() {
  // After hydration only: the nav may have fetched this already, and the
  // server HTML never has it.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useQuery({
    queryKey: ['challenges', 'mine', 'active'],
    queryFn: getMyActiveChallenges,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  if (!mounted || !isAuthenticated || !data?.length) return null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 pt-3">
      {data.map((c) => (
        <div key={c.slug} className="flex flex-col gap-2">
        <div
          className="flex items-center gap-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] p-3 text-[#F4F1EC] shadow-sm"
        >
          <Link href={`/challenge/${c.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#D0463C]/20 text-[#E8675D]">
              <ChallengeGlyph game={c.game} className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-body-emphasis font-bold">{c.title}</span>
              <span className="block truncate text-caption text-[#A3A6B1]">
                {c.status === 'live' ? 'On now' : `${challengeDay(c.startsAt)}, ${challengeTime(c.startsAt)}`} · {c.cafeName} ·{' '}
                <span className={c.entryStatus === 'confirmed' ? 'font-semibold text-[#7BD88F]' : 'font-semibold text-[#F2C94C]'}>
                  {c.soloWaiting
                    ? 'Solo · finding your team'
                    : c.teamName
                      ? `Team ${c.teamName}`
                      : `${c.entryStatus === 'confirmed' ? 'Confirmed' : 'Waitlist'}${c.rank ? ` #${c.rank}` : ''}`}
                </span>
              </span>
            </span>
          </Link>
          <Link
            href={`/challenge/${c.slug}/me`}
            className="inline-flex h-10 flex-shrink-0 items-center gap-1.5 rounded-xl bg-[#D0463C] px-3 text-caption font-semibold text-white hover:bg-[#B93C33]"
          >
            <QrCode className="h-4 w-4" aria-hidden /> My QR
          </Link>
        </div>
        <TeamNeedsPrompt c={c} />
        <ComingPrompt c={c} />
        </div>
      ))}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { QrCode, Swords } from 'lucide-react';
import { getMyActiveChallenges } from '@/lib/api/challenges';
import { challengeDay, challengeTime } from '@/lib/challenge';
import { useAuthStore } from '@/store/authStore';

/** Top of the home screen for a signed-in player who is in an upcoming or
 *  live challenge: when it is, their place, and their check-in QR. */
export function MyChallengeCard() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data } = useQuery({
    queryKey: ['challenges', 'mine', 'active'],
    queryFn: getMyActiveChallenges,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  if (!isAuthenticated || !data?.length) return null;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 pt-3">
      {data.map((c) => (
        <div
          key={c.slug}
          className="flex items-center gap-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] p-3 text-[#F4F1EC] shadow-sm"
        >
          <Link href={`/challenge/${c.slug}`} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#D0463C]/20 text-[#E8675D]">
              <Swords className="h-5 w-5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-heading text-body-emphasis font-bold">{c.title}</span>
              <span className="block truncate text-caption text-[#A3A6B1]">
                {c.status === 'live' ? 'On now' : `${challengeDay(c.startsAt)}, ${challengeTime(c.startsAt)}`} · {c.cafeName} ·{' '}
                <span className={c.entryStatus === 'confirmed' ? 'font-semibold text-[#7BD88F]' : 'font-semibold text-[#F2C94C]'}>
                  {c.entryStatus === 'confirmed' ? 'Confirmed' : 'Waitlist'} #{c.rank}
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
      ))}
    </div>
  );
}

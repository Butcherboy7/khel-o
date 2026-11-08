'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { trackAction } from '@/lib/api/analyticsEvents';
import { CommunityInviteCard } from '@/components/customer/CommunityInvite';

/** Real photos from Tekken #01 at AdamsDen (1 Nov 2026), in /public/community. */
const PHOTOS = ['full-house', 'couch', 'prize'];

/** On a finished challenge: show what the room looked like and the way into
 *  the next one. The community hears about #02 first. */
export function NextOneBlock() {
  return (
    <section className="mt-4 flex flex-col gap-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] p-4" aria-label="The next challenge">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E8675D]">You missed this one</p>
      <p className="text-[15px] text-[#DADCE3]">
        <b className="text-[#F4F1EC]">Want to be in the next one?</b> The community gets the date first.
      </p>
      <div className="grid grid-cols-3 gap-2">
        {PHOTOS.map((n) => (
          // eslint-disable-next-line @next/next/no-img-element -- small static photos from /public
          <img key={n} src={`/community/${n}.webp`} alt="" loading="lazy" className="aspect-[3/4] w-full rounded-xl border-2 border-[#F4EFE7] object-cover" />
        ))}
      </div>
      <CommunityInviteCard where="challenge_finished" />
      <Link
        href="/community"
        onClick={() => trackAction('community_page_tap', { where: 'challenge_finished' })}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-[#262932] px-4 text-sm font-semibold text-[#F4F1EC] hover:border-[#3A3E4A]"
      >
        See all the photos <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

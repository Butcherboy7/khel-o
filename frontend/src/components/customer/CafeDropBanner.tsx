'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Gamepad2 } from 'lucide-react';
import { dropArt } from '@/components/customer/HomeTabs';
import { listDrops } from '@/lib/api/drops';
import { trackAction } from '@/lib/api/analyticsEvents';

/** A small banner on a café page while that café has a live drop (for example
 *  GTA 6 seats). It disappears by itself once every session has started. */
export function CafeDropBanner({ cafeId }: { cafeId: string }) {
  const { data } = useQuery({ queryKey: ['home-drops'], queryFn: listDrops, staleTime: 60_000, retry: false });
  const drop = data?.find((d) => d.cafe.id === cafeId);
  if (!drop) return null;
  const soon = drop.state === 'soon';
  const art = dropArt(drop);
  return (
    <Link
      href={`/drops/${drop.slug}`}
      onClick={() => trackAction('cafe_drop_banner_tap', { drop: drop.slug })}
      className="flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-card p-2.5 shadow-card transition-colors hover:border-primary"
    >
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} alt="" className="h-14 w-24 flex-none rounded-xl object-cover" />
      ) : (
        <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-primary text-white">
          <Gamepad2 className="h-5 w-5" aria-hidden />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-extrabold uppercase tracking-wider text-primary">{soon ? 'Coming soon' : 'Limited time'}</span>
        <span className="block truncate font-heading text-body-emphasis font-bold text-text-primary">{drop.game} is here</span>
        <span className="block text-caption text-text-secondary">{soon ? 'Be first to reserve a seat' : `${drop.seatsLeft} seats left this week`}</span>
      </span>
      <span className="flex-shrink-0 rounded-full bg-primary px-3.5 py-2 text-caption font-bold text-white">Reserve</span>
      <ArrowRight className="hidden" aria-hidden />
    </Link>
  );
}

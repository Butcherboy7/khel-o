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
  // The game is out and every time is inside normal hours: nothing special to reserve, normal booking only.
  const art0 = dropArt(drop);
  if (drop.casual && !drop.hasSpecial) {
    return (
      <div className="flex items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-card p-2.5 shadow-card">
        {art0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art0} alt="" className="h-14 w-24 flex-none rounded-xl object-cover" />
        ) : (
          <span className="flex h-14 w-14 flex-none items-center justify-center rounded-xl bg-primary text-white">
            <Gamepad2 className="h-5 w-5" aria-hidden />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[10.5px] font-extrabold uppercase tracking-wider text-primary">{drop.game} is out now</span>
          <span className="block truncate font-heading text-body-emphasis font-bold text-text-primary">Play it here</span>
          <span className="block text-caption text-text-secondary">Pick a PlayStation or Xbox setup below and book a time</span>
        </span>
      </div>
    );
  }
  const soon = drop.state === 'soon';
  const late = !!drop.casual;
  const art = art0;
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
        <span className="block text-[10.5px] font-extrabold uppercase tracking-wider text-primary">{soon ? 'Coming soon' : late ? 'Late night and early morning' : 'Limited time'}</span>
        <span className="block truncate font-heading text-body-emphasis font-bold text-text-primary">{late ? `${drop.game} launch sessions` : `${drop.game} is here`}</span>
        <span className="block text-caption text-text-secondary">{soon ? 'Be first to reserve a seat' : late ? 'Reserve a seat with a small fee' : drop.seatsPerSlot ? `Only ${drop.seatsPerSlot} seats a night` : `${drop.seatsLeft} seats left`}</span>
      </span>
      <span className="flex-shrink-0 rounded-full bg-primary px-3.5 py-2 text-caption font-bold text-white">Reserve</span>
      <ArrowRight className="hidden" aria-hidden />
    </Link>
  );
}

'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Gamepad2 } from 'lucide-react';
import { listDrops } from '@/lib/api/drops';
import { trackAction } from '@/lib/api/analyticsEvents';

/** A small banner on a café page while that café has a live drop (for example
 *  GTA 6 seats). It disappears by itself once every session has started. */
export function CafeDropBanner({ cafeId }: { cafeId: string }) {
  const { data } = useQuery({ queryKey: ['home-drops'], queryFn: listDrops, staleTime: 60_000, retry: false });
  const drop = data?.find((d) => d.cafe.id === cafeId);
  if (!drop) return null;
  const soon = drop.state === 'soon';
  return (
    <Link
      href={`/drops/${drop.slug}`}
      onClick={() => trackAction('cafe_drop_banner_tap', { drop: drop.slug })}
      className="flex items-center gap-3 rounded-2xl border border-[#5A2A26] bg-[#1A1114] px-4 py-3 text-[#F4F1EC] transition-colors hover:border-[#E8675D]"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-xl bg-[#D0463C]">
        <Gamepad2 className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-extrabold uppercase tracking-wider text-[#E8675D]">{soon ? 'Coming soon' : 'Limited time'}</span>
        <span className="block font-heading text-body-emphasis font-bold">This café has {drop.game}</span>
        <span className="block text-caption text-[#C9CBD3]">{soon ? 'Be first to reserve a seat' : `${drop.seatsLeft} seats left. Reserve yours`}</span>
      </span>
      <ArrowRight className="h-4 w-4 flex-none" aria-hidden />
    </Link>
  );
}

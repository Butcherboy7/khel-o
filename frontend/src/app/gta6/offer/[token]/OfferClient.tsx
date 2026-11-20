'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { getGta6Offer } from '@/lib/api/gta6Offers';
import { PageSpinner } from '@/components/ui';

/** Older shared links: an open slot forwards to the normal checkout with the slot chosen; anything else explains why not. */
export default function OfferClient({ token }: { token: string }) {
  const router = useRouter();
  const { data, isLoading, isError } = useQuery({ queryKey: ['gta6-offer', token], queryFn: () => getGta6Offer(token), retry: false });
  const o = data?.offer;
  const open = Boolean(o && o.status === 'open' && Date.parse(o.expiresAt) > Date.now());

  useEffect(() => {
    if (!o || !open) return;
    const q = new URLSearchParams({
      cafeId: o.cafe?.id ?? '', tierId: o.tier?.id ?? '', date: o.date, time: o.startTime, dayOffset: '0',
      duration: String(o.hours), seats: String(o.seats), offer: o.token,
    });
    router.replace(`/bookings/new?${q.toString()}`);
  }, [o, open, router]);

  if (isLoading || open) return <PageSpinner label="Opening your slot" />;

  const lapsed = o?.status === 'lapsed';
  const title = isError || !o ? "This link isn't valid" : lapsed ? 'This slot is no longer confirmed' : o.status === 'claimed' || o.status === 'held' ? 'This slot was just taken' : 'This link has run out';
  const body =
    isError || !o
      ? 'Ask us on WhatsApp and we will check the slot for you.'
      : lapsed
        ? "It wasn't paid for in time, so it is open to everyone again and may be booked by someone else. Ask for it and we will check with the café."
        : 'It was first come, first served. Message us on WhatsApp and we will find you another time.';
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center gap-4 px-4 py-10">
      <h1 className="font-heading text-h2 font-bold text-text-primary">{title}</h1>
      <p className="text-body text-text-secondary">{body}</p>
      {lapsed && (
        <a href={o?.cafe?.slug ? `/cafe/${o.cafe.slug}` : '/gta6'} className="btn-depth inline-flex min-h-[52px] items-center justify-center rounded-xl bg-primary px-6 text-body font-bold text-white">
          Ask for a slot
        </a>
      )}
    </main>
  );
}

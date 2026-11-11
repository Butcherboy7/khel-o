'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getAdminDrops } from '@/lib/api/admin';
import { DropsManager, type DropExtra } from '@/components/drops/DropsManager';

/** Every café's drops in one place. An admin can make one for any café, then open it to
 *  share, check people in, change prices or cancel it: the same screen the café uses. */
export default function AdminDropsPage() {
  const { data } = useQuery({ queryKey: ['admin', 'drops'], queryFn: getAdminDrops });
  const extra = useMemo(() => {
    const out: Record<string, DropExtra> = {};
    for (const d of data ?? []) out[d.id] = { feesTaken: d.feesTaken, waitlist: d.waitlist, refunded: d.refunded };
    return out;
  }, [data]);
  const seats = (data ?? []).reduce((a, d) => a + d.seats, 0);
  const fees = (data ?? []).reduce((a, d) => a + d.feesTaken, 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <DropsManager base="/admin/drops" admin extra={extra} />
      {data && data.length > 0 && (
        <p className="text-caption text-text-secondary">
          All drops together: {seats} {seats === 1 ? 'seat' : 'seats'} reserved and ₹{fees.toLocaleString('en-IN')} in booking fees. Booking fees are not refunded unless the café cancels.
        </p>
      )}
    </div>
  );
}

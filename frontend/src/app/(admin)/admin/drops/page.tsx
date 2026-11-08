'use client';

import { useQuery } from '@tanstack/react-query';
import { Rocket } from 'lucide-react';
import { getAdminDrops } from '@/lib/api/admin';
import { Card, CardContent, ErrorState, PageSpinner } from '@/components/ui';

export default function AdminDropsPage() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['admin', 'drops'], queryFn: getAdminDrops });
  if (isLoading) return <PageSpinner />;
  if (error || !data) return <ErrorState title="Could not load drops" message={(error as Error)?.message} onRetry={() => refetch()} />;
  const total = data.reduce((a, d) => a + d.feesTaken, 0);
  const seats = data.reduce((a, d) => a + d.seats, 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-h2 font-bold text-text-primary"><Rocket className="h-6 w-6" /> Drops</h1>
        <p className="mt-1 text-body text-text-secondary">
          Every launch drop: seats reserved, reservation fees taken (not refunded), people waiting. {seats} seats and ₹{total.toLocaleString('en-IN')} in fees across all drops.
        </p>
      </div>
      {data.length === 0 && <p className="text-body text-text-secondary">No drops yet.</p>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.map((d) => (
          <Card key={d.id} elevation="resting">
            <CardContent className="flex flex-col gap-1.5 p-4">
              <p className="text-[10.5px] font-extrabold uppercase tracking-wider text-error">{d.status}</p>
              <p className="font-heading text-body-emphasis font-bold text-text-primary">{d.title}</p>
              <p className="text-caption text-text-secondary">{d.cafe} · {d.game}{d.startsOn ? ` · ${d.startsOn} to ${d.endsOn ?? 'open'}` : ''}</p>
              <div className="mt-2 grid grid-cols-4 gap-2 text-center">
                {[['Bookings', d.reservations], ['Seats', d.seats], ['Fees ₹', d.feesTaken], ['Waiting', d.waitlist]].map(([l, n]) => (
                  <div key={l as string}>
                    <p className="font-heading text-body-emphasis font-bold text-text-primary">{n}</p>
                    <p className="text-[11px] text-text-secondary">{l}</p>
                  </div>
                ))}
              </div>
              {d.refunded > 0 && <p className="text-caption text-text-secondary">{d.refunded} refunded</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

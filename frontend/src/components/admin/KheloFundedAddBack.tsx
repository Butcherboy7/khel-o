'use client';

import { useQuery } from '@tanstack/react-query';
import { Gift } from 'lucide-react';
import { getKheloFundedAddBack, type AddBackBooking } from '@/lib/api/admin';
import { queryKeys } from '@/hooks/queries/keys';
import { Badge, Card, CardContent, ErrorState, SkeletonCard } from '@/components/ui';

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Read-only. What KHEL-O may still owe each café for challenge rewards it funds.
 *  It never records a payment and never changes a payout: KHEL-O has no record of
 *  these reimbursements, so the total is an estimate to settle by hand. */
export function KheloFundedAddBackSection() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [...queryKeys.admin.all, 'cafe-payouts', 'add-back'],
    queryFn: getKheloFundedAddBack,
    staleTime: 30_000,
  });

  return (
    <section className="flex flex-col gap-3" aria-labelledby="add-back-title" data-add-back>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Gift className="h-5 w-5 text-primary" />
          <h2 id="add-back-title" className="font-heading text-h2 text-text-primary">KHEL-O-funded rewards to add back</h2>
          <Badge variant="warning" size="sm">Estimate</Badge>
        </div>
        <p className="mt-1 text-caption text-text-secondary">
          Challenge rewards where KHEL-O, not the café, pays the discount. Each row is one paid booking, counted once, replaced rewards included.
        </p>
      </div>

      {isLoading && <SkeletonCard />}
      {isError && (
        <ErrorState title="Couldn’t load the add-back list" message={(error as Error)?.message ?? 'Try again.'} onRetry={() => refetch()} />
      )}

      {data && (
        <>
          <Card elevation="raised" className="border border-amber-500/30 bg-amber-50/60">
            <CardContent className="flex flex-col gap-1 p-4">
              <p className="text-caption font-semibold text-text-primary">{data.label}</p>
              <p className="font-data text-h2 font-bold text-text-primary" data-add-back-total>{rupees(data.estimateTotal)}</p>
              <p className="text-caption text-text-secondary">
                {data.bookingCount} paid {data.bookingCount === 1 ? 'booking' : 'bookings'}
                {data.needsReviewCount > 0 ? ` · ${data.needsReviewCount} to look at with the books` : ''}
              </p>
              <p className="text-caption text-text-secondary">{data.note}</p>
            </CardContent>
          </Card>

          {data.cafes.length === 0 ? (
            <p className="text-caption text-text-secondary">No paid bookings on a KHEL-O-funded reward yet.</p>
          ) : (
            data.cafes.map((c) => (
              <details key={c.cafeId} className="rounded-2xl border border-border bg-surface" open={data.cafes.length === 1}>
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3 text-caption font-semibold text-text-primary">
                  <span>{c.cafe}</span>
                  <span className="font-data">{rupees(c.total)} <span className="font-normal text-text-secondary">· {c.bookings.length} {c.bookings.length === 1 ? 'booking' : 'bookings'}</span></span>
                </summary>
                <div className="overflow-x-auto px-5 pb-4">
                  <table className="w-full text-left text-caption">
                    <thead className="text-text-secondary">
                      <tr>
                        <th className="py-1 pr-3 font-semibold">Booking</th>
                        <th className="py-1 pr-3 font-semibold">Date</th>
                        <th className="py-1 pr-3 font-semibold">Reward</th>
                        <th className="py-1 pr-3 text-right font-semibold">Discount</th>
                        <th className="py-1 font-semibold">Café’s own share</th>
                      </tr>
                    </thead>
                    <tbody className="text-text-primary">
                      {c.bookings.map((b) => (
                        <Row key={b.bookingId} b={b} />
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))
          )}
        </>
      )}
    </section>
  );
}

function Row({ b }: { b: AddBackBooking }) {
  return (
    <>
      <tr className="border-t border-border align-top">
        <td className="py-1.5 pr-3 font-mono">{b.bookingReference}</td>
        <td className="py-1.5 pr-3">{b.sessionDate} {b.startTime}</td>
        <td className="py-1.5 pr-3">
          {b.label}
          <span className="block text-text-secondary">{b.challenge}</span>
          {b.superseded && <span className="mt-0.5 inline-block rounded bg-surface px-1.5 text-xs font-semibold text-text-secondary">Reward replaced later, booking stands</span>}
        </td>
        <td className="py-1.5 pr-3 text-right font-data">{rupees(b.discount)}</td>
        <td className="py-1.5">{b.cafeShareInPayout ? 'In a recorded payout' : 'Not in a payout yet'}</td>
      </tr>
      {b.financialReviewNote && (
        <tr>
          <td colSpan={5} className="pb-2 pt-0.5 text-xs font-semibold text-text-primary">
            <span className="rounded-lg bg-amber-100 px-2 py-1">Needs a look at the books: {b.financialReviewNote}</span>
          </td>
        </tr>
      )}
    </>
  );
}
